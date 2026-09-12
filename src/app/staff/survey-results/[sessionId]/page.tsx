import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { QuestionType } from "@/lib/types";
import { QUESTION_TYPE_LABEL } from "@/lib/types";

interface SessionInfo {
  id: string;
  scheduled_date: string | null;
  school: { name: string } | null;
  program: { name: string; category: string | null; sub_program: string | null } | null;
}

interface AnswerRow {
  answer_rating: number | null;
  answer_text: string | null;
  question: {
    id: string;
    question_type: QuestionType;
    question_text: string;
    options: string[] | null;
    display_order: number;
    is_active: boolean;
  } | null;
}

interface QuestionAgg {
  id: string;
  question_type: QuestionType;
  question_text: string;
  options: string[] | null;
  display_order: number;
  is_active: boolean;
  ratings: number[];
  texts: string[];
}

function programLabel(p: SessionInfo["program"]): string {
  if (!p) return "-";
  const cat = p.category ?? p.name;
  return p.sub_program ? `${cat} · ${p.sub_program}` : cat;
}

export default async function SurveyResultDetailPage({
  params,
}: PageProps<"/staff/survey-results/[sessionId]">) {
  await requireRole("staff");
  const { sessionId } = await params;
  const supabase = await createClient();

  const { data: session } = await supabase
    .from("class_sessions")
    .select("id, scheduled_date, school:schools(name), program:programs(name,category,sub_program)")
    .eq("id", sessionId)
    .maybeSingle<SessionInfo>();

  if (!session) notFound();

  const { data: responses } = await supabase
    .from("survey_responses")
    .select("id")
    .eq("session_id", sessionId)
    .returns<{ id: string }[]>();

  const responseIds = (responses ?? []).map((r) => r.id);

  let answers: AnswerRow[] = [];
  if (responseIds.length > 0) {
    const { data } = await supabase
      .from("survey_answers")
      .select(
        "answer_rating, answer_text, question:survey_questions(id,question_type,question_text,options,display_order,is_active)",
      )
      .in("response_id", responseIds)
      .returns<AnswerRow[]>();
    answers = data ?? [];
  }

  // 문항별 집계 — 활성/비활성 상관없이 "이 세션에 실제 답변이 있는 문항"만 모은다
  // (지시서 2-3: 비활성 문항도 과거 응답 있으면 상세엔 그대로 표시)
  const byQuestion = new Map<string, QuestionAgg>();
  for (const a of answers) {
    if (!a.question) continue;
    const q = a.question;
    let agg = byQuestion.get(q.id);
    if (!agg) {
      agg = {
        id: q.id,
        question_type: q.question_type,
        question_text: q.question_text,
        options: q.options,
        display_order: q.display_order,
        is_active: q.is_active,
        ratings: [],
        texts: [],
      };
      byQuestion.set(q.id, agg);
    }
    if (a.answer_rating != null) agg.ratings.push(a.answer_rating);
    if (a.answer_text) agg.texts.push(a.answer_text);
  }
  const questions = [...byQuestion.values()].sort(
    (a, b) => a.display_order - b.display_order,
  );

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link
          href="/staff/survey-results"
          className="text-sm text-link hover:underline"
        >
          ← 만족도 설문 결과
        </Link>
        <h1 className="mt-1 text-xl font-bold">{session.school?.name ?? "-"}</h1>
        <p className="text-sm text-muted">
          {programLabel(session.program)} · {session.scheduled_date ?? "일자 미정"}
        </p>
      </div>

      <div className="rounded-lg border border-border bg-surface p-4 text-sm">
        총 응답 수: <span className="font-bold">{responseIds.length}건</span>
      </div>

      {responseIds.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border bg-surface px-4 py-10 text-center text-sm text-muted">
          아직 접수된 응답이 없습니다.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {questions.map((q) => (
            <section
              key={q.id}
              className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="badge bg-blue-50 text-blue-700">
                  {QUESTION_TYPE_LABEL[q.question_type]}
                </span>
                <h2 className="text-sm font-semibold">{q.question_text}</h2>
                {!q.is_active && (
                  <span className="badge bg-zinc-200 text-zinc-600">
                    비활성(과거 문항)
                  </span>
                )}
              </div>

              {q.question_type === "rating_5" && (
                <RatingSummary ratings={q.ratings} />
              )}

              {q.question_type === "single_choice" && (
                <ChoiceDistribution options={q.options ?? []} texts={q.texts} />
              )}

              {(q.question_type === "short_text" || q.question_type === "long_text") && (
                <TextList texts={q.texts} />
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function RatingSummary({ ratings }: { ratings: number[] }) {
  if (ratings.length === 0) {
    return <p className="text-sm text-muted">응답 없음</p>;
  }
  const avg = ratings.reduce((s, n) => s + n, 0) / ratings.length;
  return (
    <p className="text-sm">
      평균 <span className="text-lg font-bold">{avg.toFixed(2)}</span>점
      <span className="ml-2 text-muted">(응답 {ratings.length}건)</span>
    </p>
  );
}

function ChoiceDistribution({
  options,
  texts,
}: {
  options: string[];
  texts: string[];
}) {
  const counts = new Map<string, number>();
  for (const t of texts) counts.set(t, (counts.get(t) ?? 0) + 1);

  // 문항의 현재 선택지 순서를 기준으로 먼저 나열하고, 선택지가 바뀐 이후의
  // 과거 응답 값(현재 options에 없는 값)은 뒤에 이어서 표시한다.
  const known = options.filter((o) => counts.has(o));
  const unknown = [...counts.keys()].filter((k) => !options.includes(k));
  const ordered = [...known, ...unknown];
  const total = texts.length;

  if (total === 0) {
    return <p className="text-sm text-muted">응답 없음</p>;
  }

  return (
    <ul className="flex flex-col gap-1 text-sm">
      {ordered.map((opt) => {
        const n = counts.get(opt) ?? 0;
        const pct = total > 0 ? Math.round((n / total) * 100) : 0;
        return (
          <li key={opt} className="flex items-center gap-2">
            <span className="w-28 shrink-0 truncate">{opt}</span>
            <span className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-100">
              <span
                className="block h-full rounded-full bg-brand"
                style={{ width: `${pct}%` }}
              />
            </span>
            <span className="w-16 shrink-0 text-right text-xs text-muted">
              {n}명 ({pct}%)
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function TextList({ texts }: { texts: string[] }) {
  if (texts.length === 0) {
    return <p className="text-sm text-muted">응답 없음</p>;
  }
  return (
    <ol className="flex flex-col gap-1.5 text-sm">
      {texts.map((t, i) => (
        <li key={i} className="rounded-md bg-zinc-50 px-3 py-2">
          <span className="mr-2 text-xs text-muted">{i + 1}.</span>
          {t}
        </li>
      ))}
    </ol>
  );
}
