// 작업지시서 #018 — 운영 모니터링 대시보드
// staff 로그인 후 가장 먼저 보이는 화면(roleHome, src/lib/auth.ts).
// 승인된 목업(ops_monitor_mockup.jsx)의 레이아웃·톤·차트 구성을 그대로 따르되,
// 모든 수치는 실데이터로 계산한다. 프레젠테이션은 ./ops-dashboard.tsx 로 분리.

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { computeStatus, DOC_TYPES, type DocStatus } from "@/lib/documents";
import { won } from "@/lib/format";
import {
  addDays,
  parseYmd,
  startOfWeek,
  todayYmd,
  weekday,
  ymd,
  WEEKDAY_KR,
} from "@/lib/calendar";
import type { SessionStatus } from "@/lib/types";
import {
  OpsDashboard,
  type DashboardData,
  type SectionCard,
  type UrgentItem,
} from "./ops-dashboard";

const DOC_STATUS_RANK: Record<DocStatus, number> = {
  valid: 0,
  expiring_soon: 1,
  expired: 2,
};

/** 최근/직전 5건 평균 하락폭이 이 이상이면 "평판 급락"으로 본다(작업지시서 2-2). */
const RATING_DROP_THRESHOLD = 0.8;
/** "강사 미배정 세션"·"다가오는 일정" 경고에서 말하는 "임박"의 기준(일) */
const IMMINENT_DAYS = 14;
/** 정산 "미지급이 오래 지남" 경고 기준(일) */
const STALE_PENDING_DAYS = 30;

function krDateLabel(dateStr: string): string {
  const { y, m, d } = parseYmd(dateStr);
  return `${y}년 ${m}월 ${d}일 (${WEEKDAY_KR[weekday(dateStr)]})`;
}

/** 목업 라벨("8/4주")과 동일하게 — 그 주 시작일의 월/일 */
function weekLabel(weekStart: string): string {
  const { m, d } = parseYmd(weekStart);
  return `${m}/${d}주`;
}

function endOfMonth(y: number, m: number): string {
  const next = m === 12 ? ymd(y + 1, 1, 1) : ymd(y, m + 1, 1);
  return addDays(next, -1);
}

export default async function StaffDashboardPage() {
  await requireRole("staff");
  const supabase = await createClient();

  const today = todayYmd();
  const { y: ty, m: tm } = parseYmd(today);
  const weekStart = startOfWeek(today);
  const weekEnd = addDays(weekStart, 6);
  const monthStart = ymd(ty, tm, 1);
  const monthEnd = endOfMonth(ty, tm);
  const imminentUntil = addDays(today, IMMINENT_DAYS);
  const staleBefore = addDays(today, -STALE_PENDING_DAYS);

  // ----------------------------------------------------------------
  // 1) 최종확정 기한 초과 (#004)
  // ----------------------------------------------------------------
  const { data: overdueRaw } = await supabase.rpc(
    "assignments_pending_final_confirm",
  );
  const overdue = (overdueRaw ?? []) as {
    id: string;
    session_id: string;
    confirm_due_date: string | null;
  }[];
  const overdueSessionIds = [...new Set(overdue.map((a) => a.session_id))];

  // ----------------------------------------------------------------
  // 2) 강의완료 처리 누락 — confirmed 이면서 지난 강의인데 lecture_confirmations 없음 (#012)
  // ----------------------------------------------------------------
  type ConfirmedPastRow = {
    id: string;
    scheduled_date: string;
    school: { name: string } | null;
    program: { name: string } | null;
    assignments: { id: string } | null;
  };
  const { data: confirmedPastRaw } = await supabase
    .from("class_sessions")
    .select(
      "id, scheduled_date, school:schools(name), program:programs(name), assignments(id)",
    )
    .eq("session_status", "confirmed")
    .lt("scheduled_date", today)
    .order("scheduled_date", { ascending: true })
    .returns<ConfirmedPastRow[]>();
  const confirmedPast = confirmedPastRaw ?? [];
  const confirmedAssignmentIds = confirmedPast
    .map((r) => r.assignments?.id)
    .filter((id): id is string => Boolean(id));

  const { data: existingConfirmations } = confirmedAssignmentIds.length
    ? await supabase
        .from("lecture_confirmations")
        .select("assignment_id")
        .in("assignment_id", confirmedAssignmentIds)
        .returns<{ assignment_id: string }[]>()
    : { data: [] as { assignment_id: string }[] };
  const confirmedSet = new Set(
    (existingConfirmations ?? []).map((c) => c.assignment_id),
  );
  const missingCompletion = confirmedPast.filter(
    (r) => r.assignments && !confirmedSet.has(r.assignments.id),
  );

  // ----------------------------------------------------------------
  // 3) 강사 미배정 세션 (임박, #004)
  // ----------------------------------------------------------------
  type UnassignedRow = {
    id: string;
    scheduled_date: string;
    school: { name: string } | null;
    program: { name: string } | null;
  };
  const { data: unassignedRaw } = await supabase
    .from("class_sessions")
    .select("id, scheduled_date, school:schools(name), program:programs(name)")
    .eq("session_status", "unassigned")
    .not("scheduled_date", "is", null)
    .lte("scheduled_date", imminentUntil)
    .order("scheduled_date", { ascending: true })
    .returns<UnassignedRow[]>();
  const unassignedImminent = unassignedRaw ?? [];

  // ----------------------------------------------------------------
  // 4) 평판 급락 감지 — 강사별 최근 5건 vs 직전 5건 (#016/#017)
  // ----------------------------------------------------------------
  type RatingAnswerRow = {
    instructor_id: string;
    answer_rating: number;
    response: { submitted_at: string } | null;
  };
  const { data: ratingAnswersRaw } = await supabase
    .from("survey_answers")
    .select("instructor_id, answer_rating, response:survey_responses(submitted_at)")
    .not("instructor_id", "is", null)
    .not("answer_rating", "is", null)
    .returns<RatingAnswerRow[]>();

  const byInstructor = new Map<string, { rating: number; at: string }[]>();
  for (const a of ratingAnswersRaw ?? []) {
    if (!a.response?.submitted_at) continue;
    const arr = byInstructor.get(a.instructor_id) ?? [];
    arr.push({ rating: a.answer_rating, at: a.response.submitted_at });
    byInstructor.set(a.instructor_id, arr);
  }

  const ratingDrops: {
    instructorId: string;
    recentAvg: number;
    priorAvg: number;
  }[] = [];
  for (const [instructorId, list] of byInstructor) {
    const sorted = [...list].sort((a, b) => b.at.localeCompare(a.at));
    if (sorted.length < 10) continue;
    const recent = sorted.slice(0, 5);
    const prior = sorted.slice(5, 10);
    const recentAvg = recent.reduce((s, r) => s + r.rating, 0) / recent.length;
    const priorAvg = prior.reduce((s, r) => s + r.rating, 0) / prior.length;
    if (priorAvg - recentAvg >= RATING_DROP_THRESHOLD) {
      ratingDrops.push({ instructorId, recentAvg, priorAvg });
    }
  }

  // ----------------------------------------------------------------
  // 필요한 참조 정보(학교/프로그램/강사 이름) 한 번에 조회
  // ----------------------------------------------------------------
  const refSessionIds = [
    ...new Set([
      ...overdueSessionIds,
      ...missingCompletion.map((r) => r.id),
      ...unassignedImminent.map((r) => r.id),
    ]),
  ];
  const { data: refSessionsRaw } = refSessionIds.length
    ? await supabase
        .from("class_sessions")
        .select("id, school:schools(name), program:programs(name)")
        .in("id", refSessionIds)
        .returns<
          {
            id: string;
            school: { name: string } | null;
            program: { name: string } | null;
          }[]
        >()
    : { data: [] as { id: string; school: { name: string } | null; program: { name: string } | null }[] };
  const sessionRefMap = new Map((refSessionsRaw ?? []).map((s) => [s.id, s]));

  const ratingDropInstructorIds = ratingDrops.map((r) => r.instructorId);
  const { data: ratingDropInstructorsRaw } = ratingDropInstructorIds.length
    ? await supabase
        .from("instructors")
        .select("id,name")
        .in("id", ratingDropInstructorIds)
        .returns<{ id: string; name: string }[]>()
    : { data: [] as { id: string; name: string }[] };
  const instructorNameMap = new Map(
    (ratingDropInstructorsRaw ?? []).map((i) => [i.id, i.name]),
  );

  // ----------------------------------------------------------------
  // "지금 처리해야 할 일" 목록 조립
  // ----------------------------------------------------------------
  const urgent: UrgentItem[] = [];

  if (overdue.length > 0) {
    const first = sessionRefMap.get(overdue[0].session_id);
    const rest = overdue.length - 1;
    urgent.push({
      id: "overdue-final-confirm",
      tone: "critical",
      iconKey: "overdue",
      title: "최종확정 기한 초과",
      detail: `${first?.school?.name ?? "학교"} · ${first?.program?.name ?? "프로그램"}${
        rest > 0 ? ` 외 ${rest}건` : ""
      } — 강의 1개월 전 재확인 기한이 지났습니다`,
      action: "지금 확정하기",
      href: "/staff/assignments/final",
    });
  }

  if (missingCompletion.length > 0) {
    const first = missingCompletion[0];
    const rest = missingCompletion.length - 1;
    const { y, m } = parseYmd(first.scheduled_date);
    urgent.push({
      id: "missing-completion",
      tone: "warning",
      iconKey: "missing_complete",
      title: "강의완료 처리 누락",
      detail: `${first.school?.name ?? "학교"} ${first.program?.name ?? "프로그램"}(${
        first.scheduled_date
      } 진행분)${rest > 0 ? ` 외 ${rest}건` : ""} — 정산 집계에서 빠집니다`,
      action: "완료 처리하기",
      href: `/staff/calendar?y=${y}&m=${m}&sessionId=${first.id}`,
    });
  }

  if (unassignedImminent.length > 0) {
    urgent.push({
      id: "unassigned-imminent",
      tone: "warning",
      iconKey: "unassigned",
      title: "강사 미배정 세션",
      detail: `${IMMINENT_DAYS}일 이내 예정 세션 중 ${unassignedImminent.length}건에 강사가 아직 배정되지 않았습니다`,
      action: "배정하러 가기",
      href: "/staff/assignments",
    });
  }

  for (const drop of ratingDrops) {
    const name = instructorNameMap.get(drop.instructorId) ?? "강사";
    urgent.push({
      id: `rating-drop-${drop.instructorId}`,
      tone: "info",
      iconKey: "rating_drop",
      title: "평판 급락 감지",
      detail: `${name} 강사 — 최근 5건 평균 ${drop.priorAvg.toFixed(1)} → ${drop.recentAvg.toFixed(1)}로 하락`,
      action: "이력 확인하기",
      href: `/staff/instructors/${drop.instructorId}/edit`,
    });
  }

  // ----------------------------------------------------------------
  // 영역별 현황 — 다가오는 일정
  // ----------------------------------------------------------------
  const [{ count: weekSessionCount }, { count: monthSessionCount }] =
    await Promise.all([
      supabase
        .from("class_sessions")
        .select("id", { count: "exact", head: true })
        .in("session_status", ["provisional", "confirmed"])
        .gte("scheduled_date", weekStart)
        .lte("scheduled_date", weekEnd),
      supabase
        .from("class_sessions")
        .select("id", { count: "exact", head: true })
        .in("session_status", ["provisional", "confirmed"])
        .gte("scheduled_date", monthStart)
        .lte("scheduled_date", monthEnd),
    ]);

  const scheduleStatus: SectionCard["status"] =
    missingCompletion.length > 0
      ? "red"
      : unassignedImminent.length > 0
        ? "amber"
        : "green";

  // ----------------------------------------------------------------
  // 영역별 현황 — 강사 관리
  // ----------------------------------------------------------------
  const [
    { data: allInstructors },
    { data: specialties },
    { data: careers },
    { data: certs },
    { data: docs },
    { data: instructorAccounts },
  ] = await Promise.all([
    supabase.from("instructors").select("id"),
    supabase.from("instructor_specialties").select("instructor_id"),
    supabase.from("instructor_career_history").select("instructor_id"),
    supabase.from("instructor_certifications").select("instructor_id"),
    supabase.from("instructor_documents").select("instructor_id,expires_at"),
    supabase.from("app_accounts").select("instructor_id").eq("role", "instructor"),
  ]);

  const specCount = new Map<string, number>();
  for (const s of specialties ?? [])
    specCount.set(s.instructor_id, (specCount.get(s.instructor_id) ?? 0) + 1);
  const careerCount = new Map<string, number>();
  for (const c of careers ?? [])
    careerCount.set(c.instructor_id, (careerCount.get(c.instructor_id) ?? 0) + 1);
  const certCount = new Map<string, number>();
  for (const c of certs ?? [])
    certCount.set(c.instructor_id, (certCount.get(c.instructor_id) ?? 0) + 1);
  const docsByInstructor = new Map<string, { expires_at: string | null }[]>();
  for (const d of docs ?? []) {
    const arr = docsByInstructor.get(d.instructor_id) ?? [];
    arr.push({ expires_at: d.expires_at });
    docsByInstructor.set(d.instructor_id, arr);
  }
  const accountSet = new Set(
    (instructorAccounts ?? []).map((a) => a.instructor_id),
  );

  let infoIncompleteCount = 0;
  let noAccountCount = 0;
  let expiredCount = 0;
  let expiringSoonCount = 0;
  for (const i of allInstructors ?? []) {
    const infoIncomplete =
      (careerCount.get(i.id) ?? 0) === 0 &&
      (certCount.get(i.id) ?? 0) === 0 &&
      (specCount.get(i.id) ?? 0) === 0;
    if (infoIncomplete) infoIncompleteCount++;
    if (!accountSet.has(i.id)) noAccountCount++;

    let worst: DocStatus | null = null;
    for (const d of docsByInstructor.get(i.id) ?? []) {
      const st = computeStatus(d.expires_at);
      if (!worst || DOC_STATUS_RANK[st] > DOC_STATUS_RANK[worst]) worst = st;
    }
    if (worst === "expired") expiredCount++;
    else if (worst === "expiring_soon") expiringSoonCount++;
  }
  void DOC_TYPES; // (제출 서류 종류는 #010 화면에서 상세로 확인 — 여기선 카운트만)

  const instructorsStatus: SectionCard["status"] =
    expiredCount > 0
      ? "red"
      : expiringSoonCount > 0 || infoIncompleteCount > 0 || noAccountCount > 0
        ? "amber"
        : "green";

  // ----------------------------------------------------------------
  // 영역별 현황 — 정산
  // ----------------------------------------------------------------
  const [{ count: rateCount }, { data: pendingPayments }] = await Promise.all([
    supabase
      .from("payment_rate_settings")
      .select("id", { count: "exact", head: true }),
    supabase
      .from("payments")
      .select("id,instructor_id,amount,settled_at")
      .eq("payment_status", "pending")
      .returns<
        { id: string; instructor_id: string; amount: number; settled_at: string | null }[]
      >(),
  ]);
  const hasRate = (rateCount ?? 0) > 0;
  const pendingList = pendingPayments ?? [];
  const pendingAmountSum = pendingList.reduce((s, p) => s + Number(p.amount), 0);
  const pendingInstructorCount = new Set(
    pendingList.map((p) => p.instructor_id),
  ).size;
  const oldPendingExists = pendingList.some(
    (p) => p.settled_at && p.settled_at.slice(0, 10) <= staleBefore,
  );

  const paymentStatus: SectionCard["status"] = !hasRate
    ? "red"
    : oldPendingExists
      ? "amber"
      : "green";

  // ----------------------------------------------------------------
  // 영역별 현황 — 만족도 설문 + 차트(최근 6주 rating_5 평균)
  // ----------------------------------------------------------------
  type SurveyAnswerRow = {
    answer_rating: number;
    response: { submitted_at: string } | null;
    question: { question_type: string } | null;
  };
  const [{ count: weekResponseCount }, { data: allSurveyAnswersRaw }, { data: linkRows }, { data: allResponses }] =
    await Promise.all([
      supabase
        .from("survey_responses")
        .select("id", { count: "exact", head: true })
        .gte("submitted_at", weekStart)
        .lt("submitted_at", addDays(weekEnd, 1)),
      supabase
        .from("survey_answers")
        .select(
          "answer_rating, response:survey_responses(submitted_at), question:survey_questions(question_type)",
        )
        .not("answer_rating", "is", null)
        .returns<SurveyAnswerRow[]>(),
      supabase
        .from("survey_links")
        .select("session_id, session:class_sessions(scheduled_date, school:schools(name), program:programs(name))")
        .returns<
          {
            session_id: string;
            session: {
              scheduled_date: string | null;
              school: { name: string } | null;
              program: { name: string } | null;
            } | null;
          }[]
        >(),
      supabase.from("survey_responses").select("session_id").returns<{ session_id: string }[]>(),
    ]);

  const ratingOnly = (allSurveyAnswersRaw ?? []).filter(
    (a) => a.question?.question_type === "rating_5" && a.response?.submitted_at,
  );
  const respondedSessionIds = new Set((allResponses ?? []).map((r) => r.session_id));
  const zeroResponseSessionIds = new Set(
    (linkRows ?? [])
      .map((l) => l.session_id)
      .filter((id) => !respondedSessionIds.has(id)),
  );

  const satisfactionTrend: DashboardData["satisfactionTrend"] = [];
  let trendSum = 0;
  let trendCount = 0;
  for (let i = 5; i >= 0; i--) {
    const wStart = addDays(weekStart, -7 * i);
    const wEnd = addDays(wStart, 6);
    const inWeek = ratingOnly.filter((a) => {
      const d = a.response!.submitted_at.slice(0, 10);
      return d >= wStart && d <= wEnd;
    });
    const score =
      inWeek.length > 0
        ? inWeek.reduce((s, a) => s + a.answer_rating, 0) / inWeek.length
        : null;
    if (score !== null) {
      trendSum += inWeek.reduce((s, a) => s + a.answer_rating, 0);
      trendCount += inWeek.length;
    }
    satisfactionTrend.push({
      week: weekLabel(wStart),
      score: score !== null ? Math.round(score * 100) / 100 : null,
    });
  }
  const satisfactionAvgLabel = trendCount > 0 ? (trendSum / trendCount).toFixed(1) : "-";

  const surveyStatus: SectionCard["status"] =
    zeroResponseSessionIds.size > 0 ? "amber" : "green";

  // ----------------------------------------------------------------
  // 세션 상태 분포 차트 — 현재 학년도
  // ----------------------------------------------------------------
  const { data: yearSessions } = await supabase
    .from("class_sessions")
    .select("session_status")
    .eq("academic_year", ty)
    .returns<{ session_status: SessionStatus }[]>();
  const statusCount: Record<string, number> = {
    unassigned: 0,
    provisional: 0,
    confirmed: 0,
    completed: 0,
  };
  for (const s of yearSessions ?? []) {
    if (s.session_status in statusCount) statusCount[s.session_status]++;
  }
  const sessionStatus: DashboardData["sessionStatus"] = [
    { name: "미배정", count: statusCount.unassigned, color: "#e11d48" },
    { name: "임시배정", count: statusCount.provisional, color: "#f59e0b" },
    { name: "확정", count: statusCount.confirmed, color: "#2563eb" },
    { name: "완료", count: statusCount.completed, color: "#16a34a" },
  ];

  // ----------------------------------------------------------------
  // 섹션 카드 조립
  // ----------------------------------------------------------------
  const sections: SectionCard[] = [
    {
      key: "schedule",
      iconKey: "schedule",
      label: "다가오는 일정",
      status: scheduleStatus,
      href: "/staff/calendar",
      rows: [
        { label: "이번 주 예정 세션", value: `${weekSessionCount ?? 0}건` },
        { label: "이번 달 예정 세션", value: `${monthSessionCount ?? 0}건` },
        {
          label: "완료처리 누락",
          value: `${missingCompletion.length}건`,
          warn: missingCompletion.length > 0,
        },
      ],
    },
    {
      key: "instructors",
      iconKey: "instructors",
      label: "강사 관리 현황",
      status: instructorsStatus,
      href: "/staff/instructors/dashboard",
      rows: [
        {
          label: "서류 만료임박·만료",
          value: `${expiredCount + expiringSoonCount}명`,
          warn: expiredCount + expiringSoonCount > 0,
        },
        {
          label: "필수정보 미비",
          value: `${infoIncompleteCount}명`,
          warn: infoIncompleteCount > 0,
        },
        {
          label: "계정 미발급",
          value: `${noAccountCount}명`,
          warn: noAccountCount > 0,
        },
      ],
    },
    {
      key: "payment",
      iconKey: "payment",
      label: "정산 현황",
      status: paymentStatus,
      href: "/staff/payments",
      rows: [
        { label: "미지급 금액", value: won(pendingAmountSum) },
        { label: "미지급 대상", value: `${pendingInstructorCount}명` },
        {
          label: "단가 설정",
          value: hasRate ? "정상" : "미설정",
          ok: hasRate,
          warn: !hasRate,
        },
      ],
    },
    {
      key: "survey",
      iconKey: "survey",
      label: "만족도 설문 현황",
      status: surveyStatus,
      href: "/staff/survey-results",
      rows: [
        { label: "이번 주 응답", value: `${weekResponseCount ?? 0}건` },
        {
          label: "평균 만족도",
          value: trendCount > 0 ? `${satisfactionAvgLabel} / 5` : "응답 없음",
        },
        {
          label: "응답 0건 세션",
          value: `${zeroResponseSessionIds.size}건`,
          warn: zeroResponseSessionIds.size > 0,
        },
      ],
    },
  ];

  const now = new Date();
  const data: DashboardData = {
    todayLabel: krDateLabel(today),
    generatedAtLabel: now.toLocaleTimeString("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
    }),
    urgent,
    sections,
    satisfactionTrend,
    satisfactionAvgLabel,
    sessionStatus,
  };

  return <OpsDashboard data={data} />;
}
