"use client";

// 작업지시서 #014-1 (2-3) — 서술형 응답 AI 분석. 범위를 고르고 문항별로
// "AI 분석 실행"을 누르면 Claude 가 주제별로 정리한다. 결과는
// survey_text_insights 에 저장되어 재방문 시 즉시 표시(재분석 없이).

import { useEffect, useState } from "react";
import type { InsightScopeType, SurveyTextInsight } from "@/lib/types";
import { getTextInsights, getTextQuestions, runTextAnalysis } from "./actions";
import type { RefGroup, RefInstructor, RefSchool } from "./insights-client";

export function TextAnalysisTab({
  schools,
  groups,
  instructors,
}: {
  schools: RefSchool[];
  groups: RefGroup[];
  instructors: RefInstructor[];
}) {
  const [scopeType, setScopeType] = useState<InsightScopeType>("all");
  const [scopeValue, setScopeValue] = useState("");
  const [questions, setQuestions] = useState<{ id: string; question_text: string }[]>([]);
  const [insights, setInsights] = useState<Record<string, SurveyTextInsight>>({});
  const [loading, setLoading] = useState(true);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    getTextQuestions().then(setQuestions);
  }, []);

  async function loadInsights() {
    if (scopeType !== "all" && !scopeValue) {
      setInsights({});
      return;
    }
    setLoading(true);
    const res = await getTextInsights(scopeType, scopeValue);
    setInsights(res.insights);
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 범위 변경 시 조회
    loadInsights();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeType, scopeValue]);

  async function run(questionId: string) {
    setRunningId(questionId);
    setErrors((e) => ({ ...e, [questionId]: "" }));
    const res = await runTextAnalysis(questionId, scopeType, scopeValue);
    if (res.error) {
      setErrors((e) => ({ ...e, [questionId]: res.error! }));
    } else if (res.insight) {
      setInsights((prev) => ({ ...prev, [questionId]: res.insight! }));
    }
    setRunningId(null);
  }

  const scopeReady = scopeType === "all" || Boolean(scopeValue);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface p-3">
        <label className="flex flex-col gap-1 text-xs text-muted">
          분석 범위
          <select
            value={scopeType}
            onChange={(e) => {
              setScopeType(e.target.value as InsightScopeType);
              setScopeValue("");
            }}
            className="rounded-md border border-border bg-white px-3 py-1.5 text-sm outline-none focus:border-brand"
          >
            <option value="all">전체</option>
            <option value="school">특정 학교</option>
            <option value="program_group">특정 프로그램그룹</option>
            <option value="instructor">특정 강사</option>
          </select>
        </label>

        {scopeType === "school" && (
          <select
            value={scopeValue}
            onChange={(e) => setScopeValue(e.target.value)}
            className="rounded-md border border-border bg-white px-3 py-1.5 text-sm outline-none focus:border-brand"
          >
            <option value="">학교 선택…</option>
            {schools.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        )}
        {scopeType === "program_group" && (
          <select
            value={scopeValue}
            onChange={(e) => setScopeValue(e.target.value)}
            className="rounded-md border border-border bg-white px-3 py-1.5 text-sm outline-none focus:border-brand"
          >
            <option value="">그룹 선택…</option>
            {groups.map((g) => (
              <option key={g.code} value={g.code}>
                {g.label}
              </option>
            ))}
          </select>
        )}
        {scopeType === "instructor" && (
          <select
            value={scopeValue}
            onChange={(e) => setScopeValue(e.target.value)}
            className="rounded-md border border-border bg-white px-3 py-1.5 text-sm outline-none focus:border-brand"
          >
            <option value="">강사 선택…</option>
            {instructors.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {!scopeReady ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted">
          위에서 범위를 선택하세요.
        </p>
      ) : loading ? (
        <p className="text-sm text-muted">불러오는 중…</p>
      ) : (
        <div className="flex flex-col gap-4">
          {questions.map((q) => {
            const insight = insights[q.id];
            const busy = runningId === q.id;
            return (
              <section key={q.id} className="rounded-lg border border-border bg-surface p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold">{q.question_text}</h3>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => run(q.id)}
                    className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-zinc-50 disabled:opacity-50"
                  >
                    {busy ? "분석 중…" : insight ? "다시 분석" : "AI 분석 실행"}
                  </button>
                </div>

                {errors[q.id] && (
                  <p className="mt-2 rounded bg-red-50 px-2 py-1 text-xs text-red-700">{errors[q.id]}</p>
                )}

                {!insight ? (
                  <p className="mt-2 text-xs text-muted">아직 분석하지 않았습니다.</p>
                ) : (
                  <div className="mt-3 flex flex-col gap-2">
                    <p className="text-xs text-muted">
                      응답 {insight.response_count}건 분석 · {insight.analyzed_by ?? "담당자"} ·{" "}
                      {new Date(insight.analyzed_at).toLocaleString("ko-KR")}
                    </p>
                    <ul className="flex flex-col gap-2">
                      {insight.topics.map((t, i) => (
                        <li key={i} className="rounded-md bg-zinc-50 px-3 py-2">
                          <div className="flex items-center gap-2">
                            <span className="badge bg-blue-50 text-blue-700">{t.count}건</span>
                            <span className="text-sm font-medium">{t.topic}</span>
                          </div>
                          {t.examples.length > 0 && (
                            <ul className="mt-1 flex flex-col gap-0.5 text-xs text-muted">
                              {t.examples.map((ex, j) => (
                                <li key={j}>&ldquo;{ex}&rdquo;</li>
                              ))}
                            </ul>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
