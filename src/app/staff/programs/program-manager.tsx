"use client";

import { useActionState, useMemo, useState, useTransition } from "react";
import type { Program, SurveyGroupCode } from "@/lib/types";
import { SURVEY_GROUP_LABEL } from "@/lib/types";
import { createProgram, toggleProgramActive, type ProgramFormState } from "./actions";

const initial: ProgramFormState = {};
const GROUP_CODES: SurveyGroupCode[] = ["A", "B", "C", "D", "E"];

export function ProgramManager({ programs }: { programs: Program[] }) {
  const [state, formAction, pending] = useActionState(createProgram, initial);
  const [subs, setSubs] = useState<string[]>([""]);
  const [surveyGroup, setSurveyGroup] = useState<SurveyGroupCode>("A");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, startToggle] = useTransition();

  const grouped = useMemo(() => {
    const map = new Map<string, Program[]>();
    for (const p of programs) {
      const key = p.category ?? p.name;
      const arr = map.get(key) ?? [];
      arr.push(p);
      map.set(key, arr);
    }
    return [...map.entries()];
  }, [programs]);

  function toggle(p: Program) {
    setBusyId(p.id);
    startToggle(async () => {
      await toggleProgramActive(p.id, !p.is_active);
      setBusyId(null);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {/* 추가 */}
      <form
        action={formAction}
        className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4"
      >
        <h2 className="font-semibold">프로그램 추가</h2>
        <label className="flex flex-col gap-1 text-sm font-medium">
          대분류 <span className="text-red-600">*</span>
          <input
            name="category"
            required
            placeholder="예: 현장직업체험, 직업인특강"
            className="rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm font-medium">
          설문 문항 그룹{" "}
          <span className="text-red-600">*</span>{" "}
          <span className="font-normal text-muted">
            세부항목 전체에 동일하게 적용됩니다(QR 설문 문항 자동 구성 기준)
          </span>
          <select
            name="survey_group"
            required
            value={surveyGroup}
            onChange={(e) => setSurveyGroup(e.target.value as SurveyGroupCode)}
            className="w-64 rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand"
          >
            {GROUP_CODES.map((code) => (
              <option key={code} value={code}>
                {SURVEY_GROUP_LABEL[code]}
              </option>
            ))}
          </select>
        </label>

        <div className="flex flex-col gap-1.5 text-sm font-medium">
          <span>
            세부항목{" "}
            <span className="font-normal text-muted">
              0개 가능 — 없으면 대분류 자체가 매칭 키워드
            </span>
          </span>
          {subs.map((s, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                name="sub_program"
                value={s}
                onChange={(e) =>
                  setSubs((prev) =>
                    prev.map((v, idx) => (idx === i ? e.target.value : v)),
                  )
                }
                placeholder="예: 로봇공학자"
                className="flex-1 rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand"
              />
              {subs.length > 1 && (
                <button
                  type="button"
                  onClick={() => setSubs((p) => p.filter((_, idx) => idx !== i))}
                  className="text-sm text-muted hover:text-red-600"
                >
                  삭제
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={() => setSubs((p) => [...p, ""])}
            className="self-start text-sm font-medium text-brand hover:underline"
          >
            + 세부항목 추가
          </button>
        </div>

        {state.error && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {state.error}
          </p>
        )}
        {state.ok && (
          <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
            {state.ok}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="self-start rounded-md bg-brand px-4 py-2 text-sm font-semibold text-brand-fg hover:bg-brand-hover disabled:opacity-50"
        >
          {pending ? "추가 중…" : "추가"}
        </button>
      </form>

      {/* 목록 */}
      <div className="flex flex-col gap-4">
        {grouped.length === 0 && (
          <p className="rounded-lg border border-dashed border-border bg-surface px-4 py-8 text-center text-sm text-muted">
            등록된 프로그램이 없습니다.
          </p>
        )}
        {grouped.map(([category, rows]) => (
          <div key={category} className="rounded-lg border border-border">
            <div className="flex items-center gap-2 border-b border-border bg-zinc-50 px-3 py-2 text-sm font-semibold">
              {category}
              <span className="badge bg-zinc-200 text-zinc-600">
                {SURVEY_GROUP_LABEL[rows[0].survey_group]}
              </span>
            </div>
            <ul className="divide-y divide-border text-sm">
              {rows.map((p) => (
                <li
                  key={p.id}
                  className={`flex items-center justify-between gap-3 px-3 py-2 ${
                    p.is_active ? "" : "bg-zinc-50/60 text-muted"
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={p.is_active ? "font-medium" : "line-through"}>
                      {p.sub_program ?? "(세부항목 없음 · 대분류 자체)"}
                    </span>
                    <span className="badge bg-blue-50 text-blue-700">
                      키워드: {p.matching_keyword}
                    </span>
                    {!p.is_active && (
                      <span className="badge bg-zinc-200 text-zinc-600">
                        비활성
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    disabled={busyId === p.id}
                    onClick={() => toggle(p)}
                    className={`rounded-md border px-2.5 py-1 text-xs ${
                      p.is_active
                        ? "border-border hover:bg-zinc-50"
                        : "border-brand text-brand hover:bg-blue-50"
                    } disabled:opacity-50`}
                  >
                    {busyId === p.id
                      ? "…"
                      : p.is_active
                        ? "비활성화"
                        : "다시 활성화"}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
