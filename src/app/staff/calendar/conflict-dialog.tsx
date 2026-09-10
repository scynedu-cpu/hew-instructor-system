"use client";

import type { TimeConflict } from "@/lib/types";

export function ConflictDialog({
  title,
  message,
  conflicts,
  busy,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  conflicts: TimeConflict[];
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        e.stopPropagation();
        onCancel();
      }}
    >
      <div
        className="flex w-full max-w-sm flex-col gap-3 rounded-lg bg-surface p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-bold text-amber-700">⚠ {title}</h3>
        <p className="text-sm">{message}</p>
        <ul className="rounded-md bg-amber-50 p-2 text-xs text-amber-900">
          {conflicts.map((c) => (
            <li key={c.session_id}>
              · {c.school_name} {c.program_name} ({c.scheduled_date}
              {c.time_slot ? ` ${c.time_slot}` : ""})
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted">
          담당자 재량으로 계속 진행할 수 있습니다.
        </p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-zinc-50 disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="rounded-md bg-amber-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {busy ? "진행 중…" : "그대로 진행"}
          </button>
        </div>
      </div>
    </div>
  );
}
