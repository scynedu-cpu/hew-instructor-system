"use server";

// 작업지시서 #014-1 — 만족도설문 심화분석. staff 전용 서버 액션 모음.
// 문항별 평균(2-1)/다차원 비교+교차표(2-2)/AI 서술분석(2-3)/참여율(2-4) —
// 전부 그때그때 실데이터를 직접 집계한다(별도 캐시 테이블 없음). AI 분석
// 결과만 survey_text_insights 에 저장해 재방문 시 즉시 표시한다.

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { analyzeSurveyTexts } from "@/lib/survey-text-analysis";
import type {
  CrossTabCell,
  InsightScopeType,
  ParticipationRow,
  QuestionAverage,
  RankingRow,
  SurveyGroupCode,
  SurveyTextInsight,
} from "@/lib/types";

const MIN_SAMPLE = 5; // 표본 부족 기준 (지시서 2-2)

/** 서술형 분석 대상 3문항 — id가 바뀌어도 안 끊기도록 문구로 식별(#016 방식과 동일) */
const TEXT_QUESTION_TEXTS = [
  "오늘 프로그램에서 가장 기억에 남는 점은 무엇인가요?",
  "오늘 프로그램에서 아쉬웠던 점이나 개선하면 좋을 점은 무엇인가요?",
  "앞으로 더 듣거나 참여해보고 싶은 주제는 무엇인가요?",
] as const;

function inDateRange(
  submittedAt: string | null | undefined,
  from?: string | null,
  to?: string | null,
): boolean {
  if (!submittedAt) return false;
  const d = submittedAt.slice(0, 10);
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

// ------------------------------------------------------------------
// 2-1. 문항별 약점 진단
// ------------------------------------------------------------------
export async function getQuestionAverages(
  from?: string | null,
  to?: string | null,
): Promise<{
  common: QuestionAverage[];
  byGroup: Record<SurveyGroupCode, QuestionAverage[]>;
  error?: string;
}> {
  await requireRole("staff");
  const supabase = await createClient();

  const { data: questions, error: qErr } = await supabase
    .from("survey_questions")
    .select("id,question_text,scope,survey_group,display_order")
    .eq("question_type", "rating_5")
    .eq("is_active", true)
    .order("survey_group", { ascending: true, nullsFirst: true })
    .order("display_order", { ascending: true })
    .returns<
      { id: string; question_text: string; scope: "common" | "group"; survey_group: SurveyGroupCode | null; display_order: number }[]
    >();
  if (qErr) return { common: [], byGroup: {} as Record<SurveyGroupCode, QuestionAverage[]>, error: qErr.message };

  const ids = (questions ?? []).map((q) => q.id);
  const { data: answers, error: aErr } = ids.length
    ? await supabase
        .from("survey_answers")
        .select("question_id, answer_rating, response:survey_responses(submitted_at)")
        .in("question_id", ids)
        .not("answer_rating", "is", null)
        .returns<{ question_id: string; answer_rating: number; response: { submitted_at: string } | null }[]>()
    : { data: [] as { question_id: string; answer_rating: number; response: { submitted_at: string } | null }[], error: null };
  if (aErr) return { common: [], byGroup: {} as Record<SurveyGroupCode, QuestionAverage[]>, error: aErr.message };

  const agg = new Map<string, { sum: number; count: number }>();
  for (const a of answers ?? []) {
    if (!inDateRange(a.response?.submitted_at, from, to)) continue;
    const e = agg.get(a.question_id) ?? { sum: 0, count: 0 };
    e.sum += a.answer_rating;
    e.count += 1;
    agg.set(a.question_id, e);
  }

  const rows: QuestionAverage[] = (questions ?? []).map((q) => {
    const e = agg.get(q.id);
    return {
      id: q.id,
      text: q.question_text,
      scope: q.scope,
      group: q.survey_group,
      avg: e && e.count > 0 ? Math.round((e.sum / e.count) * 100) / 100 : null,
      count: e?.count ?? 0,
    };
  });

  const common = rows.filter((r) => r.scope === "common");
  const byGroup = {} as Record<SurveyGroupCode, QuestionAverage[]>;
  for (const r of rows) {
    if (r.scope === "group" && r.group) {
      (byGroup[r.group] ??= []).push(r);
    }
  }

  return { common, byGroup };
}

// ------------------------------------------------------------------
// 2-2. 다차원 비교 — 학교별/프로그램그룹별/강사별 순위
// ------------------------------------------------------------------
type GeneralAnswerRow = {
  answer_rating: number;
  response: {
    submitted_at: string;
    session: {
      school_id: string;
      school: { name: string } | null;
      program: { survey_group: SurveyGroupCode } | null;
    } | null;
  } | null;
};

function toRankingRows(agg: Map<string, { label: string; sum: number; count: number }>): RankingRow[] {
  return [...agg.entries()]
    .map(([key, v]) => ({
      key,
      label: v.label,
      avg: Math.round((v.sum / v.count) * 100) / 100,
      count: v.count,
      lowSample: v.count < MIN_SAMPLE,
    }))
    .sort((a, b) => b.avg - a.avg);
}

export async function getRankings(
  from?: string | null,
  to?: string | null,
): Promise<{
  bySchool: RankingRow[];
  byGroup: RankingRow[];
  instructorsTop: RankingRow[];
  instructorsBottom: RankingRow[];
  error?: string;
}> {
  await requireRole("staff");
  const supabase = await createClient();

  // 학교별/프로그램그룹별 — 강사평가 문항을 제외한 공통 평점형 문항(프로그램 자체에 대한 만족도)
  const { data: genQuestions, error: gqErr } = await supabase
    .from("survey_questions")
    .select("id")
    .eq("scope", "common")
    .eq("question_type", "rating_5")
    .eq("is_instructor_rating", false)
    .eq("is_active", true)
    .returns<{ id: string }[]>();
  if (gqErr) {
    return { bySchool: [], byGroup: [], instructorsTop: [], instructorsBottom: [], error: gqErr.message };
  }
  const genIds = (genQuestions ?? []).map((q) => q.id);

  const { data: genAnswers, error: gaErr } = genIds.length
    ? await supabase
        .from("survey_answers")
        .select(
          "answer_rating, response:survey_responses(submitted_at, session:class_sessions(school_id, school:schools(name), program:programs(survey_group)))",
        )
        .in("question_id", genIds)
        .not("answer_rating", "is", null)
        .returns<GeneralAnswerRow[]>()
    : { data: [] as GeneralAnswerRow[], error: null };
  if (gaErr) return { bySchool: [], byGroup: [], instructorsTop: [], instructorsBottom: [], error: gaErr.message };

  const bySchoolAgg = new Map<string, { label: string; sum: number; count: number }>();
  const byGroupAgg = new Map<string, { label: string; sum: number; count: number }>();
  for (const a of genAnswers ?? []) {
    if (!inDateRange(a.response?.submitted_at, from, to)) continue;
    const session = a.response?.session;
    if (!session) continue;
    const sEntry = bySchoolAgg.get(session.school_id) ?? {
      label: session.school?.name ?? "알수없음",
      sum: 0,
      count: 0,
    };
    sEntry.sum += a.answer_rating;
    sEntry.count += 1;
    bySchoolAgg.set(session.school_id, sEntry);

    const group = session.program?.survey_group;
    if (group) {
      const gEntry = byGroupAgg.get(group) ?? { label: group, sum: 0, count: 0 };
      gEntry.sum += a.answer_rating;
      gEntry.count += 1;
      byGroupAgg.set(group, gEntry);
    }
  }

  // 강사별 — 강사평가 문항(instructor_id 가 트리거로 채워짐)만 사용
  const { data: instAnswers, error: iaErr } = await supabase
    .from("survey_answers")
    .select("answer_rating, instructor_id, response:survey_responses(submitted_at)")
    .not("instructor_id", "is", null)
    .not("answer_rating", "is", null)
    .returns<{ answer_rating: number; instructor_id: string; response: { submitted_at: string } | null }[]>();
  if (iaErr) return { bySchool: [], byGroup: [], instructorsTop: [], instructorsBottom: [], error: iaErr.message };

  const byInstructorAgg = new Map<string, { sum: number; count: number }>();
  for (const a of instAnswers ?? []) {
    if (!inDateRange(a.response?.submitted_at, from, to)) continue;
    const e = byInstructorAgg.get(a.instructor_id) ?? { sum: 0, count: 0 };
    e.sum += a.answer_rating;
    e.count += 1;
    byInstructorAgg.set(a.instructor_id, e);
  }
  const instructorIds = [...byInstructorAgg.keys()];
  const { data: instructors } = instructorIds.length
    ? await supabase.from("instructors").select("id,name").in("id", instructorIds).returns<{ id: string; name: string }[]>()
    : { data: [] as { id: string; name: string }[] };
  const nameMap = new Map((instructors ?? []).map((i) => [i.id, i.name]));

  const instructorAggLabeled = new Map<string, { label: string; sum: number; count: number }>();
  for (const [id, v] of byInstructorAgg) {
    instructorAggLabeled.set(id, { label: nameMap.get(id) ?? "강사", ...v });
  }
  const allInstructorRows = toRankingRows(instructorAggLabeled);

  return {
    bySchool: toRankingRows(bySchoolAgg),
    byGroup: toRankingRows(byGroupAgg),
    instructorsTop: allInstructorRows.slice(0, 10),
    instructorsBottom: [...allInstructorRows].reverse().slice(0, 10),
  };
}

// ------------------------------------------------------------------
// 2-2. 강사 선택 시 교차표(학교 × 프로그램)
// ------------------------------------------------------------------
export async function getInstructorCrossTab(instructorId: string): Promise<{
  schools: string[];
  programs: string[];
  cells: Record<string, Record<string, CrossTabCell>>;
  error?: string;
}> {
  await requireRole("staff");
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("survey_answers")
    .select(
      "answer_rating, response:survey_responses(session:class_sessions(school:schools(name), program:programs(category,name)))",
    )
    .eq("instructor_id", instructorId)
    .not("answer_rating", "is", null)
    .returns<
      {
        answer_rating: number;
        response: {
          session: {
            school: { name: string } | null;
            program: { category: string | null; name: string } | null;
          } | null;
        } | null;
      }[]
    >();
  if (error) return { schools: [], programs: [], cells: {}, error: error.message };

  const cells: Record<string, Record<string, { sum: number; count: number }>> = {};
  const schoolSet = new Set<string>();
  const programSet = new Set<string>();
  for (const a of data ?? []) {
    const session = a.response?.session;
    const school = session?.school?.name;
    const program = session?.program?.category ?? session?.program?.name;
    if (!school || !program) continue;
    schoolSet.add(school);
    programSet.add(program);
    cells[school] ??= {};
    const cell = cells[school][program] ?? { sum: 0, count: 0 };
    cell.sum += a.answer_rating;
    cell.count += 1;
    cells[school][program] = cell;
  }

  const result: Record<string, Record<string, CrossTabCell>> = {};
  for (const school of schoolSet) {
    result[school] = {};
    for (const program of programSet) {
      const c = cells[school]?.[program];
      if (c) {
        result[school][program] = {
          avg: Math.round((c.sum / c.count) * 100) / 100,
          count: c.count,
          lowSample: c.count < MIN_SAMPLE,
        };
      }
    }
  }

  return { schools: [...schoolSet].sort(), programs: [...programSet].sort(), cells: result };
}

// ------------------------------------------------------------------
// 2-4. 세션별 참여율
// ------------------------------------------------------------------
export async function getParticipation(): Promise<{ rows: ParticipationRow[]; error?: string }> {
  await requireRole("staff");
  const supabase = await createClient();

  const { data: links, error } = await supabase
    .from("survey_links")
    .select(
      "session_id, session:class_sessions(scheduled_date, student_count, school:schools(name), program:programs(name,category,sub_program))",
    )
    .returns<
      {
        session_id: string;
        session: {
          scheduled_date: string | null;
          student_count: string | null;
          school: { name: string } | null;
          program: { name: string; category: string | null; sub_program: string | null } | null;
        } | null;
      }[]
    >();
  if (error) return { rows: [], error: error.message };

  const sessionIds = (links ?? []).map((l) => l.session_id);
  const { data: responses } = sessionIds.length
    ? await supabase.from("survey_responses").select("session_id").in("session_id", sessionIds).returns<{ session_id: string }[]>()
    : { data: [] as { session_id: string }[] };
  const countMap = new Map<string, number>();
  for (const r of responses ?? []) countMap.set(r.session_id, (countMap.get(r.session_id) ?? 0) + 1);

  const rows: ParticipationRow[] = (links ?? []).map((l) => {
    const s = l.session;
    const responseCount = countMap.get(l.session_id) ?? 0;
    const match = s?.student_count?.match(/\d+/);
    const expectedCount = match ? parseInt(match[0], 10) : null;
    const rate =
      expectedCount && expectedCount > 0
        ? Math.round((responseCount / expectedCount) * 1000) / 10
        : null;
    const p = s?.program;
    return {
      sessionId: l.session_id,
      schoolName: s?.school?.name ?? "-",
      programLabel: p ? (p.sub_program ? `${p.category ?? p.name} · ${p.sub_program}` : (p.category ?? p.name)) : "-",
      scheduledDate: s?.scheduled_date ?? null,
      responseCount,
      expectedCount,
      rate,
    };
  });

  rows.sort((a, b) => {
    if (a.rate === null && b.rate === null) return 0;
    if (a.rate === null) return 1;
    if (b.rate === null) return -1;
    return a.rate - b.rate;
  });

  return { rows };
}

// ------------------------------------------------------------------
// 2-3. 서술형 응답 AI 분석
// ------------------------------------------------------------------
export async function getTextQuestions(): Promise<
  { id: string; question_text: string }[]
> {
  await requireRole("staff");
  const supabase = await createClient();
  const { data } = await supabase
    .from("survey_questions")
    .select("id,question_text")
    .in("question_text", TEXT_QUESTION_TEXTS)
    .returns<{ id: string; question_text: string }[]>();
  // 지시서 순서(기억에 남는 점 → 아쉬운 점 → 더 듣고 싶은 주제) 그대로 정렬
  const order = new Map(TEXT_QUESTION_TEXTS.map((t, i) => [t, i]));
  return (data ?? []).sort(
    (a, b) => (order.get(a.question_text as typeof TEXT_QUESTION_TEXTS[number]) ?? 99) -
      (order.get(b.question_text as typeof TEXT_QUESTION_TEXTS[number]) ?? 99),
  );
}

export async function getTextInsights(
  scopeType: InsightScopeType,
  scopeValue: string,
): Promise<{ insights: Record<string, SurveyTextInsight>; error?: string }> {
  await requireRole("staff");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("survey_text_insights")
    .select("*")
    .eq("scope_type", scopeType)
    .eq("scope_value", scopeType === "all" ? "" : scopeValue)
    .returns<SurveyTextInsight[]>();
  if (error) return { insights: {}, error: error.message };
  const insights: Record<string, SurveyTextInsight> = {};
  for (const row of data ?? []) insights[row.question_id] = row;
  return { insights };
}

type TextAnswerRow = {
  answer_text: string | null;
  response: {
    session: {
      school_id: string;
      program: { survey_group: SurveyGroupCode } | null;
      assignments: { instructor_id: string } | null;
    } | null;
  } | null;
};

export async function runTextAnalysis(
  questionId: string,
  scopeType: InsightScopeType,
  scopeValue: string,
): Promise<{ insight?: SurveyTextInsight; error?: string }> {
  const { account } = await requireRole("staff");
  const supabase = await createClient();

  const { data: question, error: qErr } = await supabase
    .from("survey_questions")
    .select("id,question_text")
    .eq("id", questionId)
    .maybeSingle<{ id: string; question_text: string }>();
  if (qErr) return { error: qErr.message };
  if (!question) return { error: "문항을 찾을 수 없습니다." };

  const { data: answers, error: aErr } = await supabase
    .from("survey_answers")
    .select(
      "answer_text, response:survey_responses(session:class_sessions(school_id, program:programs(survey_group), assignments(instructor_id)))",
    )
    .eq("question_id", questionId)
    .not("answer_text", "is", null)
    .returns<TextAnswerRow[]>();
  if (aErr) return { error: aErr.message };

  const filtered = (answers ?? []).filter((a) => {
    const session = a.response?.session;
    if (!session) return false;
    if (scopeType === "all") return true;
    if (scopeType === "school") return session.school_id === scopeValue;
    if (scopeType === "program_group") return session.program?.survey_group === scopeValue;
    if (scopeType === "instructor") return session.assignments?.instructor_id === scopeValue;
    return false;
  });
  const texts = filtered.map((a) => a.answer_text).filter((t): t is string => Boolean(t && t.trim()));

  if (texts.length === 0) {
    return { error: "이 범위에는 분석할 서술형 응답이 없습니다." };
  }

  let topics;
  try {
    topics = await analyzeSurveyTexts(question.question_text, texts);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "AI 분석에 실패했습니다." };
  }

  const scopeValueStored = scopeType === "all" ? "" : scopeValue;
  const { data: saved, error: upErr } = await supabase
    .from("survey_text_insights")
    .upsert(
      {
        question_id: questionId,
        scope_type: scopeType,
        scope_value: scopeValueStored,
        response_count: texts.length,
        topics,
        analyzed_by: account.display_name ?? "담당자",
        analyzed_at: new Date().toISOString(),
      },
      { onConflict: "question_id,scope_type,scope_value" },
    )
    .select("*")
    .single<SurveyTextInsight>();
  if (upErr) return { error: upErr.message };

  revalidatePath("/staff/survey-results/insights");
  return { insight: saved };
}
