"use client";

import { useState } from "react";
import type { SurveyQuestion } from "@/lib/types";
import { submitSurveyResponse, type SurveyAnswerInput } from "../actions";

type AnswerValue = { rating?: number; text?: string };

// 5점 척도만 필수 응답을 강제한다. 신분/성별(single_choice)도 필수,
// 학년(short_text)·기타의견(long_text)은 선택 응답.
function isRequired(q: SurveyQuestion): boolean {
  return q.question_type === "rating_5" || q.question_type === "single_choice";
}

export function SurveyForm({
  token,
  questions,
}: {
  token: string;
  questions: SurveyQuestion[];
}) {
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function setRating(id: string, rating: number) {
    setAnswers((prev) => ({ ...prev, [id]: { ...prev[id], rating } }));
  }
  function setText(id: string, text: string) {
    setAnswers((prev) => ({ ...prev, [id]: { ...prev[id], text } }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);

    const missing = questions.filter((q) => {
      if (!isRequired(q)) return false;
      const a = answers[q.id];
      if (q.question_type === "rating_5") return a?.rating == null;
      return !a?.text; // single_choice — 선택한 값이 text 에 담김
    });
    if (missing.length > 0) {
      setErr(`아직 응답하지 않은 필수 문항이 있습니다: "${missing[0].question_text}"`);
      return;
    }

    const payload: SurveyAnswerInput[] = questions
      .map((q): SurveyAnswerInput | null => {
        const a = answers[q.id];
        if (!a) return null;
        if (q.question_type === "rating_5" && a.rating != null) {
          return { question_id: q.id, answer_rating: a.rating };
        }
        if (q.question_type !== "rating_5" && a.text && a.text.trim()) {
          return { question_id: q.id, answer_text: a.text.trim() };
        }
        return null;
      })
      .filter((v): v is SurveyAnswerInput => v !== null);

    setBusy(true);
    try {
      const res = await submitSurveyResponse(token, payload);
      if (res.error) setErr(res.error);
      else setDone(true);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-lg border border-border bg-surface p-6 text-center">
        <h2 className="text-lg font-bold">감사합니다</h2>
        <p className="mt-2 text-sm text-muted">
          소중한 의견이 정상적으로 접수되었습니다.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4"
    >
      {questions.map((q) => (
        <fieldset key={q.id} className="flex flex-col gap-2 border-b border-border pb-4 last:border-b-0 last:pb-0">
          <legend className="mb-1 text-sm font-semibold">
            {q.question_text}
            {isRequired(q) && <span className="ml-1 text-red-600">*</span>}
          </legend>

          {q.question_type === "rating_5" && (
            <div className="flex justify-between gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRating(q.id, n)}
                  className={`flex h-10 flex-1 items-center justify-center rounded-md border text-sm font-semibold ${
                    answers[q.id]?.rating === n
                      ? "border-brand bg-brand text-brand-fg"
                      : "border-border bg-white hover:bg-zinc-50"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          )}
          {q.question_type === "rating_5" && (
            <div className="flex justify-between text-[11px] text-muted">
              <span>전혀 아니다</span>
              <span>매우 그렇다</span>
            </div>
          )}

          {q.question_type === "single_choice" && (
            <div className="flex flex-col gap-1.5">
              {(q.options ?? []).map((opt) => (
                <label
                  key={opt}
                  className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${
                    answers[q.id]?.text === opt
                      ? "border-brand bg-blue-50/50"
                      : "border-border"
                  }`}
                >
                  <input
                    type="radio"
                    name={`q_${q.id}`}
                    checked={answers[q.id]?.text === opt}
                    onChange={() => setText(q.id, opt)}
                  />
                  {opt}
                </label>
              ))}
            </div>
          )}

          {q.question_type === "short_text" && (
            <input
              value={answers[q.id]?.text ?? ""}
              onChange={(e) => setText(q.id, e.target.value)}
              className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-brand"
            />
          )}

          {q.question_type === "long_text" && (
            <textarea
              value={answers[q.id]?.text ?? ""}
              onChange={(e) => setText(q.id, e.target.value)}
              rows={4}
              className="rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-brand"
            />
          )}
        </fieldset>
      ))}

      {err && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="rounded-md bg-brand px-4 py-2.5 text-sm font-semibold text-brand-fg hover:bg-brand-hover disabled:opacity-50"
      >
        {busy ? "제출 중…" : "제출하기"}
      </button>
    </form>
  );
}
