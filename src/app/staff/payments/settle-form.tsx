"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { won } from "@/lib/format";
import {
  settlePeriod,
  previewSettle,
  type SettleState,
  type PreviewRow,
} from "./actions";

const initial: SettleState = {};

function monthRange(): { start: string; end: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const pad = (n: number) => String(n).padStart(2, "0");
  const start = `${y}-${pad(m + 1)}-01`;
  const last = new Date(y, m + 1, 0).getDate();
  const end = `${y}-${pad(m + 1)}-${pad(last)}`;
  return { start, end };
}

export function SettleForm({ hasRate }: { hasRate: boolean }) {
  const router = useRouter();
  const def = monthRange();
  const [start, setStart] = useState(def.start);
  const [end, setEnd] = useState(def.end);
  const [preview, setPreview] = useState<PreviewRow[] | null>(null);
  const [previewErr, setPreviewErr] = useState<string | null>(null);
  const [previewing, startPreview] = useTransition();
  const [state, formAction, pending] = useActionState(settlePeriod, initial);

  function doPreview() {
    setPreviewErr(null);
    setPreview(null);
    startPreview(async () => {
      const res = await previewSettle(start, end);
      if (res.error) setPreviewErr(res.error);
      else setPreview(res.rows ?? []);
    });
  }

  const totalQty = (preview ?? []).reduce((s, r) => s + r.quantity, 0);
  const totalAmount = (preview ?? []).reduce((s, r) => s + r.estimated_amount, 0);

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      <h2 className="font-semibold">정산 집계</h2>
      <p className="text-xs text-muted">
        지정한 기간에 완료된 강의(강의 확인 기준) 중 아직 정산되지 않은 건을
        강사별로 집계합니다. 이미 정산에 포함된 강의는 자동 제외됩니다.
      </p>

      {!hasRate && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          단가가 없어 정산할 수 없습니다. 위에서 단가를 먼저 등록하세요.
        </p>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm font-medium">
          시작일
          <input
            type="date"
            value={start}
            onChange={(e) => {
              setStart(e.target.value);
              setPreview(null);
            }}
            className="rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          종료일
          <input
            type="date"
            value={end}
            onChange={(e) => {
              setEnd(e.target.value);
              setPreview(null);
            }}
            className="rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand"
          />
        </label>
        <button
          type="button"
          onClick={doPreview}
          disabled={previewing || !start || !end}
          className="rounded-md border border-brand px-3 py-2 text-sm font-medium text-brand hover:bg-blue-50 disabled:opacity-50"
        >
          {previewing ? "조회 중…" : "대상 미리보기"}
        </button>
      </div>

      {previewErr && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {previewErr}
        </p>
      )}

      {preview !== null && (
        <div className="rounded-md border border-border bg-zinc-50/60 p-3 text-sm">
          {preview.length === 0 ? (
            <p className="text-muted">
              이 기간에 새로 정산할 완료 강의가 없습니다.
            </p>
          ) : (
            <>
              <p className="mb-1 font-medium">
                정산 대상: {preview.length}명 / 총 {totalQty}건 · 예상 총액{" "}
                {won(totalAmount)}
              </p>
              <ul className="flex flex-col gap-0.5 text-muted">
                {preview.map((r) => (
                  <li key={r.instructor_id}>
                    · {r.instructor_name} — {r.quantity}건 · {r.total_hours}시간
                    · 예상 {won(r.estimated_amount)}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

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

      <form
        action={(fd) => {
          formAction(fd);
          setPreview(null);
          setTimeout(() => router.refresh(), 400);
        }}
      >
        <input type="hidden" name="period_start" value={start} />
        <input type="hidden" name="period_end" value={end} />
        <button
          type="submit"
          disabled={pending || !hasRate || !start || !end}
          className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-brand-fg hover:bg-brand-hover disabled:opacity-50"
        >
          {pending ? "집계 중…" : "이 기간 정산 집계"}
        </button>
      </form>
    </section>
  );
}
