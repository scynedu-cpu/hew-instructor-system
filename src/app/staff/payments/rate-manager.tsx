"use client";

import { useActionState, useMemo, useState } from "react";
import type { PaymentRateSettingWithProgram } from "@/lib/types";
import { won } from "@/lib/format";
import { setRate, type RateState } from "./actions";

const initial: RateState = {};
const DEFAULT_KEY = "__default__";

export function RateManager({
  defaultRate,
  history,
  programs,
}: {
  defaultRate: number | null;
  history: PaymentRateSettingWithProgram[];
  programs: { id: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState(setRate, initial);
  const [open, setOpen] = useState(false);
  const today = new Date().toLocaleDateString("en-CA");

  // 프로그램(또는 "기본")별로 묶기 — history 는 이미 effective_from desc 정렬이라
  // 각 그룹의 첫 항목이 "현재 적용 중인" 단가.
  const groups = useMemo(() => {
    const map = new Map<
      string,
      { label: string; items: PaymentRateSettingWithProgram[] }
    >();
    for (const h of history) {
      const key = h.program_id ?? DEFAULT_KEY;
      const label = h.program?.name ?? "기본(그 외 프로그램)";
      if (!map.has(key)) map.set(key, { label, items: [] });
      map.get(key)!.items.push(h);
    }
    // 기본이 항상 먼저, 그다음 프로그램명 순
    return [...map.entries()].sort(([a], [b]) => {
      if (a === DEFAULT_KEY) return -1;
      if (b === DEFAULT_KEY) return 1;
      return map.get(a)!.label.localeCompare(map.get(b)!.label);
    });
  }, [history]);

  const programOverrides = groups.filter(([key]) => key !== DEFAULT_KEY);

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">단가 (시간당)</h2>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-zinc-50"
        >
          {open ? "닫기" : "단가 등록"}
        </button>
      </div>

      <div className="flex flex-col gap-1">
        <p className="text-2xl font-bold">
          {defaultRate === null ? (
            <span className="text-base font-normal text-red-600">
              기본 단가가 없습니다 — 아래에서 등록하세요.
            </span>
          ) : (
            <>
              {won(defaultRate)}
              <span className="ml-1 text-sm font-normal text-muted">
                / 시간 (기본, 그 외 프로그램)
              </span>
            </>
          )}
        </p>
        {programOverrides.length > 0 && (
          <ul className="flex flex-wrap gap-x-4 gap-y-0.5 text-sm text-muted">
            {programOverrides.map(([key, g]) => (
              <li key={key}>
                <span className="font-medium text-foreground">{g.label}</span>{" "}
                {won(g.items[0].rate)} / 시간
              </li>
            ))}
          </ul>
        )}
      </div>

      {open && (
        <form
          action={formAction}
          className="flex flex-col gap-3 rounded-md border border-border bg-zinc-50/60 p-3"
        >
          <div className="flex flex-wrap gap-3">
            <label className="flex flex-col gap-1 text-sm font-medium">
              적용 대상 <span className="text-red-600">*</span>
              <select
                name="program_id"
                defaultValue=""
                className="w-56 rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand"
              >
                <option value="">기본(그 외 모든 프로그램)</option>
                {programs.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              시간당 단가 (원) <span className="text-red-600">*</span>
              <input
                name="rate"
                type="number"
                min={0}
                step={1000}
                required
                className="w-40 rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              적용 시작일 <span className="text-red-600">*</span>
              <input
                name="effective_from"
                type="date"
                defaultValue={today}
                required
                className="rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand"
              />
            </label>
          </div>
          <label className="flex flex-col gap-1 text-sm font-medium">
            메모 <span className="font-normal text-muted">선택</span>
            <input
              name="note"
              placeholder="예: 2026년도 단가 인상"
              className="rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand"
            />
          </label>
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
            {pending ? "등록 중…" : "새 단가 등록"}
          </button>
        </form>
      )}

      {groups.length > 0 && (
        <div className="mt-1 flex flex-col gap-2">
          <p className="text-xs font-semibold text-muted">변경 이력</p>
          {groups.map(([key, g]) => (
            <div key={key}>
              <p className="text-xs font-medium">{g.label}</p>
              <ul className="flex flex-col gap-0.5 text-xs">
                {g.items.map((h, i) => (
                  <li key={h.id} className="flex flex-wrap gap-x-2 text-muted">
                    <span className={i === 0 ? "font-semibold text-foreground" : ""}>
                      {won(h.rate)} / 시간
                    </span>
                    <span>· {h.effective_from} 적용</span>
                    {h.created_by && <span>· {h.created_by}</span>}
                    {h.note && <span>· {h.note}</span>}
                    {i === 0 && <span className="text-brand">(현재)</span>}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
