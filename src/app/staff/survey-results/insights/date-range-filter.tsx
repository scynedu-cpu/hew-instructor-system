"use client";

// 공용 기간 필터 — 문항별 약점진단(2-1)/다차원 비교(2-2)에서 재사용.
// "이번 달" 단축 버튼 + 직접 범위 지정, 비우면 전체 기간.

function todayYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function monthStartYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

export function DateRangeFilter({
  from,
  to,
  onChange,
  onApply,
  busy,
}: {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
  onApply: () => void;
  busy: boolean;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface p-3">
      <label className="flex flex-col gap-1 text-xs text-muted">
        시작일
        <input
          type="date"
          value={from}
          onChange={(e) => onChange(e.target.value, to)}
          className="rounded-md border border-border bg-white px-2 py-1.5 text-sm outline-none focus:border-brand"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        종료일
        <input
          type="date"
          value={to}
          onChange={(e) => onChange(from, e.target.value)}
          className="rounded-md border border-border bg-white px-2 py-1.5 text-sm outline-none focus:border-brand"
        />
      </label>
      <button
        type="button"
        onClick={() => onChange(monthStartYmd(), todayYmd())}
        className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-zinc-50"
      >
        이번 달
      </button>
      {(from || to) && (
        <button
          type="button"
          onClick={() => onChange("", "")}
          className="text-xs text-muted hover:underline"
        >
          기간 초기화(전체)
        </button>
      )}
      <button
        type="button"
        onClick={onApply}
        disabled={busy}
        className="ml-auto rounded-md bg-brand px-4 py-1.5 text-sm font-semibold text-brand-fg hover:bg-brand-hover disabled:opacity-50"
      >
        {busy ? "조회 중…" : "조회"}
      </button>
    </div>
  );
}
