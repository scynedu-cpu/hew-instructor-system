"use client";

import { useActionState, useState } from "react";
import { confirmSchedule, type ActionState } from "../actions";

const initial: ActionState = {};

export function ScheduleForm({
  sessionId,
  requestedDates,
  currentDate,
  currentTimeSlot,
  hasCandidates,
}: {
  sessionId: string;
  requestedDates: string[];
  currentDate: string | null;
  currentTimeSlot: string;
  hasCandidates: boolean;
}) {
  const [state, formAction, pending] = useActionState(confirmSchedule, initial);
  const [date, setDate] = useState(currentDate ?? requestedDates[0] ?? "");
  const [timeSlot, setTimeSlot] = useState(currentTimeSlot);

  return (
    <form
      action={formAction}
      className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4"
    >
      <h2 className="font-semibold">
        예정일 / 시간대 확정
        {currentDate && hasCandidates && (
          <span className="ml-2 text-xs font-normal text-muted">
            (다시 확정하면 후보가 재계산됩니다)
          </span>
        )}
      </h2>

      <input type="hidden" name="session_id" value={sessionId} />

      {requestedDates.length > 0 && (
        <div className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">학교 희망일자</span>
          <div className="flex flex-wrap gap-2">
            {requestedDates.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDate(d)}
                className={`rounded-md border px-3 py-1.5 text-sm ${
                  date === d
                    ? "border-brand bg-blue-50 font-semibold text-brand"
                    : "border-border hover:bg-zinc-50"
                }`}
              >
                {d}
              </button>
            ))}
          </div>
        </div>
      )}

      <label className="flex flex-col gap-1.5 text-sm font-medium">
        예정일 <span className="text-red-600">*</span>
        <input
          type="date"
          name="scheduled_date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required
          className="w-48 rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand"
        />
      </label>

      <label className="flex flex-col gap-1.5 text-sm font-medium">
        시간대 <span className="font-normal text-muted">자유 입력</span>
        <input
          name="time_slot"
          value={timeSlot}
          onChange={(e) => setTimeSlot(e.target.value)}
          placeholder="예: 10:00~12:00, 3·4교시"
          className="w-64 rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand"
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
        disabled={pending || !date}
        className="self-start rounded-md bg-brand px-4 py-2 text-sm font-semibold text-brand-fg hover:bg-blue-800 disabled:opacity-50"
      >
        {pending
          ? "처리 중…"
          : currentDate && hasCandidates
            ? "다시 확정 · 후보 재계산"
            : "예정일 확정 · 후보 계산"}
      </button>
    </form>
  );
}
