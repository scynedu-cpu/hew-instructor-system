"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type {
  CalendarSession,
  InstructorWithSpecialties,
  TimeConflict,
} from "@/lib/types";
import { conflictReasonText } from "@/lib/types";
import {
  WEEKDAY_KR,
  dayOfMonth,
  monthOf,
  monthLabel,
  prevMonth,
  nextMonth,
  addDays,
  todayYmd,
} from "@/lib/calendar";
import { checkRescheduleConflict, reschedule } from "./actions";
import { SessionDetailPanel } from "./session-detail-panel";
import { ConflictDialog } from "./conflict-dialog";

function statusClasses(s: CalendarSession) {
  if (s.session_status === "completed")
    return "border-l-4 border-zinc-400 bg-zinc-100 text-zinc-600";
  if (s.session_status === "confirmed")
    return "border-l-4 border-green-500 bg-green-50 text-green-900";
  return "border-l-4 border-amber-400 bg-amber-50 text-amber-900";
}

export function CalendarClient({
  view,
  year,
  month,
  anchor,
  days,
  sessions,
  instructors,
}: {
  view: "month" | "week";
  year: number;
  month: number;
  anchor: string;
  days: string[];
  sessions: CalendarSession[];
  instructors: InstructorWithSpecialties[];
}) {
  const router = useRouter();
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pending, setPending] = useState<{
    sessionId: string;
    targetDate: string;
    timeSlot: string | null;
    instructorName: string | null;
    conflicts: TimeConflict[];
  } | null>(null);

  const today = todayYmd();
  const byDate = new Map<string, CalendarSession[]>();
  for (const s of sessions) {
    const arr = byDate.get(s.scheduled_date) ?? [];
    arr.push(s);
    byDate.set(s.scheduled_date, arr);
  }

  const p = prevMonth(year, month);
  const n = nextMonth(year, month);
  const selected = sessions.find((s) => s.id === selectedId) ?? null;

  async function applyReschedule(
    sessionId: string,
    targetDate: string,
    timeSlot: string | null,
  ) {
    setBusy(true);
    try {
      const res = await reschedule(sessionId, targetDate, timeSlot);
      if (res.error) setMsg(res.error);
      else router.refresh();
    } finally {
      setBusy(false);
      setPending(null);
    }
  }

  async function handleDrop(sessionId: string, targetDate: string) {
    setMsg(null);
    const s = sessions.find((x) => x.id === sessionId);
    if (!s || s.scheduled_date === targetDate || busy) return;
    if (s.session_status === "completed") return;

    setBusy(true);
    let conflicts: TimeConflict[] = [];
    try {
      conflicts = await checkRescheduleConflict(sessionId, targetDate, s.time_slot);
    } finally {
      setBusy(false);
      setDragOver(null);
    }

    if (conflicts.length > 0) {
      setPending({
        sessionId,
        targetDate,
        timeSlot: s.time_slot,
        instructorName: s.instructor_name,
        conflicts,
      });
      return;
    }
    await applyReschedule(sessionId, targetDate, s.time_slot);
  }

  const gridCols = "grid grid-cols-7 gap-px bg-border";
  const cellBase =
    "min-h-28 bg-surface p-1.5 flex flex-col gap-1 text-xs transition-colors";

  return (
    <div className="flex flex-col gap-3">
      {/* 상단 컨트롤 */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          {view === "month" ? (
            <>
              <NavLink href={`/staff/calendar?view=month&y=${p.y}&m=${p.m}`}>
                ‹
              </NavLink>
              <span className="min-w-28 text-center text-sm font-semibold">
                {monthLabel(year, month)}
              </span>
              <NavLink href={`/staff/calendar?view=month&y=${n.y}&m=${n.m}`}>
                ›
              </NavLink>
            </>
          ) : (
            <>
              <NavLink
                href={`/staff/calendar?view=week&d=${addDays(anchor, -7)}`}
              >
                ‹
              </NavLink>
              <span className="min-w-40 text-center text-sm font-semibold">
                {days[0]} ~ {days[6]}
              </span>
              <NavLink href={`/staff/calendar?view=week&d=${addDays(anchor, 7)}`}>
                ›
              </NavLink>
            </>
          )}
          <Link
            href={
              view === "month"
                ? `/staff/calendar?view=month`
                : `/staff/calendar?view=week&d=${today}`
            }
            className="ml-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-zinc-50"
          >
            오늘
          </Link>
        </div>

        <div className="flex items-center gap-2">
          {busy && <span className="text-xs text-muted">처리 중…</span>}
          <div className="flex overflow-hidden rounded-md border border-border text-xs">
            <Link
              href="/staff/calendar?view=month"
              className={`px-3 py-1 ${
                view === "month"
                  ? "bg-brand text-brand-fg"
                  : "bg-surface hover:bg-zinc-50"
              }`}
            >
              월간
            </Link>
            <Link
              href={`/staff/calendar?view=week&d=${anchor}`}
              className={`px-3 py-1 ${
                view === "week"
                  ? "bg-brand text-brand-fg"
                  : "bg-surface hover:bg-zinc-50"
              }`}
            >
              주간
            </Link>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 text-xs text-muted">
        <span>
          <span className="mr-1 inline-block h-2 w-2 rounded-sm bg-green-500" />
          최종확정
        </span>
        <span>
          <span className="mr-1 inline-block h-2 w-2 rounded-sm bg-amber-400" />
          임시배정
        </span>
        <span>
          <span className="mr-1 inline-block h-2 w-2 rounded-sm bg-zinc-400" />
          강의완료
        </span>
        <span>카드를 다른 날짜 칸으로 드래그하면 일정이 이동합니다. (강의완료 세션은 변경할 수 없습니다)</span>
      </div>

      {msg && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {msg}
        </p>
      )}

      {/* 요일 헤더 */}
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-t-lg bg-border text-center text-xs font-medium">
        {WEEKDAY_KR.map((w, i) => (
          <div
            key={w}
            className={`bg-zinc-50 py-1.5 ${
              i === 0 ? "text-red-600" : i === 6 ? "text-blue-600" : "text-muted"
            }`}
          >
            {w}
          </div>
        ))}
      </div>

      {/* 그리드 */}
      <div className={`${gridCols} overflow-hidden rounded-b-lg`}>
        {days.map((date) => {
          const inMonth = view === "week" || monthOf(date) === month;
          const list = byDate.get(date) ?? [];
          return (
            <div
              key={date}
              onDragOver={(e) => {
                e.preventDefault();
                if (dragOver !== date) setDragOver(date);
              }}
              onDragLeave={() => setDragOver((d) => (d === date ? null : d))}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData("text/plain");
                if (id) handleDrop(id, date);
              }}
              className={`${cellBase} ${view === "week" ? "min-h-64" : ""} ${
                dragOver === date ? "bg-blue-50 ring-2 ring-inset ring-brand" : ""
              } ${inMonth ? "" : "bg-zinc-50/60"}`}
            >
              <div
                className={`text-right text-[11px] ${
                  date === today
                    ? "font-bold text-brand"
                    : inMonth
                      ? "text-muted"
                      : "text-zinc-300"
                }`}
              >
                {date === today ? "오늘 " : ""}
                {dayOfMonth(date)}
              </div>
              {list.map((s) => {
                const completed = s.session_status === "completed";
                return (
                  <button
                    key={s.id}
                    type="button"
                    draggable={!completed}
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", s.id);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onClick={() => setSelectedId(s.id)}
                    className={`rounded px-1.5 py-1 text-left ${
                      completed
                        ? "cursor-pointer"
                        : "cursor-grab active:cursor-grabbing"
                    } ${statusClasses(s)}`}
                  >
                    <div className="flex items-center gap-1 font-semibold leading-tight">
                      <span>{s.school_name}</span>
                      {completed && (
                        <span className="rounded bg-zinc-300 px-1 py-0.5 text-[10px] font-medium text-zinc-700">
                          강의완료
                        </span>
                      )}
                    </div>
                    <div className="leading-tight">{s.program_name}</div>
                    <div className="mt-0.5 flex flex-wrap gap-x-1.5 text-[11px] opacity-80">
                      {s.time_slot && <span>{s.time_slot}</span>}
                      <span>{s.instructor_name ?? "강사 미정"}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>

      {pending && (
        <ConflictDialog
          title="일정 이동 — 강사 배정 충돌"
          message={`${pending.instructorName ?? "배정 강사"} 님이 ${pending.targetDate}${
            pending.timeSlot ? ` ${pending.timeSlot}` : ""
          }에 ${conflictReasonText(pending.conflicts)}.`}
          conflicts={pending.conflicts}
          busy={busy}
          onCancel={() => setPending(null)}
          onConfirm={() =>
            applyReschedule(
              pending.sessionId,
              pending.targetDate,
              pending.timeSlot,
            )
          }
        />
      )}

      {selected && (
        <SessionDetailPanel
          session={selected}
          instructors={instructors}
          onClose={() => setSelectedId(null)}
          onChanged={() => {
            setSelectedId(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-md border border-border px-2 py-1 text-sm hover:bg-zinc-50"
    >
      {children}
    </Link>
  );
}
