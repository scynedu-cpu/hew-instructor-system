"use client";

import { useActionState, useState } from "react";
import type { PaymentRateSetting } from "@/lib/types";
import { won } from "@/lib/format";
import { setRate, type RateState } from "./actions";

const initial: RateState = {};

export function RateManager({
  currentRate,
  history,
}: {
  currentRate: number | null;
  history: PaymentRateSetting[];
}) {
  const [state, formAction, pending] = useActionState(setRate, initial);
  const [open, setOpen] = useState(false);
  const today = new Date().toLocaleDateString("en-CA");

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">단가 (강의 1건당)</h2>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-zinc-50"
        >
          {open ? "닫기" : "단가 변경"}
        </button>
      </div>

      <p className="text-2xl font-bold">
        {currentRate === null ? (
          <span className="text-base font-normal text-red-600">
            설정된 단가가 없습니다 — 아래에서 등록하세요.
          </span>
        ) : (
          won(currentRate)
        )}
      </p>

      {open && (
        <form
          action={formAction}
          className="flex flex-col gap-3 rounded-md border border-border bg-zinc-50/60 p-3"
        >
          <div className="flex flex-wrap gap-3">
            <label className="flex flex-col gap-1 text-sm font-medium">
              새 단가 (원) <span className="text-red-600">*</span>
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
            className="self-start rounded-md bg-brand px-4 py-2 text-sm font-semibold text-brand-fg hover:bg-blue-800 disabled:opacity-50"
          >
            {pending ? "등록 중…" : "새 단가 등록"}
          </button>
        </form>
      )}

      {history.length > 0 && (
        <div className="mt-1">
          <p className="mb-1 text-xs font-semibold text-muted">변경 이력</p>
          <ul className="flex flex-col gap-1 text-xs">
            {history.map((h, i) => (
              <li key={h.id} className="flex flex-wrap gap-x-2 text-muted">
                <span className={i === 0 ? "font-semibold text-foreground" : ""}>
                  {won(h.rate)}
                </span>
                <span>· {h.effective_from} 적용</span>
                {h.created_by && <span>· {h.created_by}</span>}
                {h.note && <span>· {h.note}</span>}
                {i === 0 && <span className="text-brand">(현재)</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
