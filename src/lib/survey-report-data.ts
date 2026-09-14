// 작업지시서 #014-1 (2-5) — 구청·교육청 제출용 보고서 데이터 집계. 서버 전용.
// PDF 렌더링(survey-report-pdf.ts)에 필요한 숫자만 이 파일에서 전부 계산한다.

import { createClient } from "@/lib/supabase/server";
import type { SurveyGroupCode } from "@/lib/types";
import { SURVEY_GROUP_LABEL } from "@/lib/types";

export interface ReportFilters {
  schoolId?: string | null;
  group?: SurveyGroupCode | null;
  from?: string | null;
  to?: string | null;
}

export interface ReportQuestionRow {
  text: string;
  avg: number | null;
  count: number;
}

export interface ReportRankingRow {
  label: string;
  avg: number;
  count: number;
}

export interface ReportData {
  schoolName: string | null;
  groupLabel: string | null;
  from: string | null;
  to: string | null;
  overallAvg: number | null;
  overallCount: number;
  commonQuestions: ReportQuestionRow[];
  groupQuestions: ReportQuestionRow[] | null;
  schoolRanking: ReportRankingRow[] | null; // schoolId 필터가 없을 때만
  groupRanking: ReportRankingRow[] | null; // group 필터가 없을 때만
  participation: {
    avgRate: number | null;
    lowCount: number;
    totalSessions: number;
    lowest: { schoolName: string; programLabel: string; rate: number | null }[];
  };
  textInsights: {
    questionText: string;
    topics: { topic: string; count: number; examples: string[] }[];
  }[];
}

function inRange(dateStr: string | null | undefined, from?: string | null, to?: string | null): boolean {
  if (!dateStr) return false;
  const d = dateStr.slice(0, 10);
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

export async function buildReportData(filters: ReportFilters): Promise<ReportData> {
  const supabase = await createClient();
  const { schoolId, group, from, to } = filters;

  const [{ data: schoolRow }] = await Promise.all([
    schoolId
      ? supabase.from("schools").select("name").eq("id", schoolId).maybeSingle<{ name: string }>()
      : Promise.resolve({ data: null }),
  ]);

  // ------------------------------------------------------------
  // 문항별 평균 — 공통 5개 + (group 지정 시) 그룹 5개
  // ------------------------------------------------------------
  const { data: commonQ } = await supabase
    .from("survey_questions")
    .select("id,question_text,is_instructor_rating,display_order")
    .eq("scope", "common")
    .eq("question_type", "rating_5")
    .eq("is_active", true)
    .order("display_order", { ascending: true })
    .returns<{ id: string; question_text: string; is_instructor_rating: boolean; display_order: number }[]>();

  const { data: groupQ } = group
    ? await supabase
        .from("survey_questions")
        .select("id,question_text,display_order")
        .eq("scope", "group")
        .eq("survey_group", group)
        .eq("question_type", "rating_5")
        .eq("is_active", true)
        .order("display_order", { ascending: true })
        .returns<{ id: string; question_text: string; display_order: number }[]>()
    : { data: null };

  const allQIds = [...(commonQ ?? []).map((q) => q.id), ...(groupQ ?? []).map((q) => q.id)];

  type AnswerRow = {
    question_id: string;
    answer_rating: number;
    response: {
      submitted_at: string;
      session: { school_id: string; program: { survey_group: SurveyGroupCode } | null } | null;
    } | null;
  };
  const { data: answers } = allQIds.length
    ? await supabase
        .from("survey_answers")
        .select(
          "question_id, answer_rating, response:survey_responses(submitted_at, session:class_sessions(school_id, program:programs(survey_group)))",
        )
        .in("question_id", allQIds)
        .not("answer_rating", "is", null)
        .returns<AnswerRow[]>()
    : { data: [] as AnswerRow[] };

  function matchesScope(a: AnswerRow): boolean {
    if (!inRange(a.response?.submitted_at, from, to)) return false;
    const session = a.response?.session;
    if (!session) return false;
    if (schoolId && session.school_id !== schoolId) return false;
    if (group && session.program?.survey_group !== group) return false;
    return true;
  }

  const perQuestion = new Map<string, { sum: number; count: number }>();
  for (const a of answers ?? []) {
    if (!matchesScope(a)) continue;
    const e = perQuestion.get(a.question_id) ?? { sum: 0, count: 0 };
    e.sum += a.answer_rating;
    e.count += 1;
    perQuestion.set(a.question_id, e);
  }
  function toRow(q: { id: string; question_text: string }): ReportQuestionRow {
    const e = perQuestion.get(q.id);
    return {
      text: q.question_text,
      avg: e && e.count > 0 ? Math.round((e.sum / e.count) * 100) / 100 : null,
      count: e?.count ?? 0,
    };
  }
  const commonQuestions = (commonQ ?? []).map(toRow);
  const groupQuestions = groupQ ? groupQ.map(toRow) : null;

  // 전체 평균 만족도 — 강사평가 문항을 제외한 공통 문항(프로그램 자체 만족도) 기준
  const generalIds = new Set((commonQ ?? []).filter((q) => !q.is_instructor_rating).map((q) => q.id));
  let overallSum = 0;
  let overallCount = 0;
  for (const a of answers ?? []) {
    if (!generalIds.has(a.question_id) || !matchesScope(a)) continue;
    overallSum += a.answer_rating;
    overallCount += 1;
  }

  // ------------------------------------------------------------
  // 비교 그래프 — 필터로 이미 한 축이 고정됐으면 그 축은 생략
  // ------------------------------------------------------------
  let schoolRanking: ReportRankingRow[] | null = null;
  let groupRanking: ReportRankingRow[] | null = null;
  if (!schoolId || !group) {
    const { data: schoolNames } = await supabase.from("schools").select("id,name").returns<{ id: string; name: string }[]>();
    const nameById = new Map((schoolNames ?? []).map((s) => [s.id, s.name]));

    const bySchool = new Map<string, { sum: number; count: number }>();
    const byGroup = new Map<string, { sum: number; count: number }>();
    for (const a of answers ?? []) {
      if (!generalIds.has(a.question_id)) continue;
      if (!inRange(a.response?.submitted_at, from, to)) continue;
      const session = a.response?.session;
      if (!session) continue;

      if (!schoolId) {
        // group 필터만 적용한 채 학교별로 쪼갠다
        if (group && session.program?.survey_group !== group) continue;
        const e = bySchool.get(session.school_id) ?? { sum: 0, count: 0 };
        e.sum += a.answer_rating;
        e.count += 1;
        bySchool.set(session.school_id, e);
      }
      if (!group) {
        // school 필터만 적용한 채 그룹별로 쪼갠다
        if (schoolId && session.school_id !== schoolId) continue;
        const g = session.program?.survey_group;
        if (!g) continue;
        const e = byGroup.get(g) ?? { sum: 0, count: 0 };
        e.sum += a.answer_rating;
        e.count += 1;
        byGroup.set(g, e);
      }
    }
    if (!schoolId) {
      schoolRanking = [...bySchool.entries()]
        .map(([id, v]) => ({ label: nameById.get(id) ?? "알수없음", avg: Math.round((v.sum / v.count) * 100) / 100, count: v.count }))
        .sort((a, b) => b.avg - a.avg);
    }
    if (!group) {
      groupRanking = [...byGroup.entries()]
        .map(([code, v]) => ({
          label: SURVEY_GROUP_LABEL[code as SurveyGroupCode],
          avg: Math.round((v.sum / v.count) * 100) / 100,
          count: v.count,
        }))
        .sort((a, b) => b.avg - a.avg);
    }
  }

  // ------------------------------------------------------------
  // 참여율 통계
  // ------------------------------------------------------------
  type LinkRow = {
    session_id: string;
    session: {
      scheduled_date: string | null;
      student_count: string | null;
      school_id: string;
      school: { name: string } | null;
      program: { name: string; category: string | null; sub_program: string | null; survey_group: SurveyGroupCode } | null;
    } | null;
  };
  const { data: links } = await supabase
    .from("survey_links")
    .select(
      "session_id, session:class_sessions(scheduled_date, student_count, school_id, school:schools(name), program:programs(name,category,sub_program,survey_group))",
    )
    .returns<LinkRow[]>();

  const scopedLinks = (links ?? []).filter((l) => {
    const s = l.session;
    if (!s) return false;
    if (schoolId && s.school_id !== schoolId) return false;
    if (group && s.program?.survey_group !== group) return false;
    if ((from || to) && !inRange(s.scheduled_date, from, to)) return false;
    return true;
  });
  const sessionIds = scopedLinks.map((l) => l.session_id);
  const { data: responseRows } = sessionIds.length
    ? await supabase.from("survey_responses").select("session_id").in("session_id", sessionIds).returns<{ session_id: string }[]>()
    : { data: [] as { session_id: string }[] };
  const respCountMap = new Map<string, number>();
  for (const r of responseRows ?? []) respCountMap.set(r.session_id, (respCountMap.get(r.session_id) ?? 0) + 1);

  const participationRows = scopedLinks.map((l) => {
    const s = l.session!;
    const responseCount = respCountMap.get(l.session_id) ?? 0;
    const m = s.student_count?.match(/\d+/);
    const expected = m ? parseInt(m[0], 10) : null;
    const rate = expected && expected > 0 ? Math.round((responseCount / expected) * 1000) / 10 : null;
    const p = s.program;
    return {
      schoolName: s.school?.name ?? "-",
      programLabel: p ? (p.sub_program ? `${p.category ?? p.name} · ${p.sub_program}` : (p.category ?? p.name)) : "-",
      rate,
    };
  });
  const withRate = participationRows.filter((r) => r.rate !== null) as { schoolName: string; programLabel: string; rate: number }[];
  const avgRate = withRate.length > 0 ? Math.round((withRate.reduce((s, r) => s + r.rate, 0) / withRate.length) * 10) / 10 : null;
  const lowCount = withRate.filter((r) => r.rate < 30).length;
  const lowest = [...participationRows]
    .sort((a, b) => (a.rate ?? 999) - (b.rate ?? 999))
    .slice(0, 5);

  // ------------------------------------------------------------
  // 서술형 분석 요약 — 이미 저장된 결과만 사용(여기서 새로 분석하지 않음)
  // ------------------------------------------------------------
  const insightScope = schoolId
    ? { type: "school" as const, value: schoolId }
    : group
      ? { type: "program_group" as const, value: group }
      : { type: "all" as const, value: "" };

  const TEXT_QUESTION_TEXTS = [
    "오늘 프로그램에서 가장 기억에 남는 점은 무엇인가요?",
    "오늘 프로그램에서 아쉬웠던 점이나 개선하면 좋을 점은 무엇인가요?",
    "앞으로 더 듣거나 참여해보고 싶은 주제는 무엇인가요?",
  ];
  const { data: textQuestions } = await supabase
    .from("survey_questions")
    .select("id,question_text")
    .in("question_text", TEXT_QUESTION_TEXTS)
    .returns<{ id: string; question_text: string }[]>();

  const { data: insightRows } = await supabase
    .from("survey_text_insights")
    .select("question_id,topics")
    .eq("scope_type", insightScope.type)
    .eq("scope_value", insightScope.value)
    .returns<{ question_id: string; topics: { topic: string; count: number; examples: string[] }[] }[]>();
  const insightByQuestion = new Map((insightRows ?? []).map((r) => [r.question_id, r.topics]));

  const order = new Map(TEXT_QUESTION_TEXTS.map((t, i) => [t, i]));
  const textInsights = (textQuestions ?? [])
    .filter((q) => insightByQuestion.has(q.id))
    .sort((a, b) => (order.get(a.question_text) ?? 99) - (order.get(b.question_text) ?? 99))
    .map((q) => ({ questionText: q.question_text, topics: insightByQuestion.get(q.id)! }));

  return {
    schoolName: schoolRow?.name ?? null,
    groupLabel: group ? SURVEY_GROUP_LABEL[group] : null,
    from: from ?? null,
    to: to ?? null,
    overallAvg: overallCount > 0 ? Math.round((overallSum / overallCount) * 100) / 100 : null,
    overallCount,
    commonQuestions,
    groupQuestions,
    schoolRanking,
    groupRanking,
    participation: { avgRate, lowCount, totalSessions: participationRows.length, lowest },
    textInsights,
  };
}
