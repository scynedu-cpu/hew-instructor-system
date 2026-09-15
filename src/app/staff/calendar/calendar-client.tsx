"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type {
  CalendarSession,
  InstructorWithSpecialties,
  PendingCalendarItem,
  TimeConflict,
} from "@/lib/types";
import { conflictReasonText, REQUEST_STATUS_LABEL } from "@/lib/types";
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
  if (s.session_status === "unassigned")
    return "border-l-4 border-red-400 bg-red-50 text-red-900";
  return "border-l-4 border-amber-400 bg-amber-50 text-amber-900";
}

export function CalendarClient({
  view,
  year,
  month,
  anchor,
  days,
  sessions,
  pendingItems,
  instructors,
  initialSelectedId = null,
}: {
  view: "month" | "week";
  year: number;
  month: number;
  anchor: string;
  days: string[];
  sessions: CalendarSession[];
  pendingItems: PendingCalendarItem[];
  instructors: InstructorWithSpecialties[];
  /** 작업지시서 #018 — 운영 대시보드에서 특정 세션 상세를 바로 열기 위한 딥링크 */
  initialSelectedId?: string | null;
}) {
  const router = useRouter();
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId);
  const [selectedPendingId, setSelectedPendingId] = useState<string | null>(null);
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
  const pendingByDate = new Map<string, PendingCalendarItem[]>();
  for (const p of pendingItems) {
    const arr = pendingByDate.get(p.scheduled_date) ?? [];
    arr.push(p);
    pendingByDate.set(p.scheduled_date, arr);
  }
  // 검토대기 항목이 같은 날짜의 "다른 학교" 일정(승인된 세션이든 다른 검토대기
  // 항목이든)과 겹치면 경고 표시 — 담당자가 승인 전에 캘린더에서 바로 확인 가능.
  function otherSchoolEntriesOnDate(date: string, schoolId: string) {
    const approved = (byDate.get(date) ?? [])
      .filter((s) => s.session_status !== "completed" && s.school_id !== schoolId)
      .map((s) => `${s.school_name} · ${s.program_name} (승인됨)`);
    const otherPending = (pendingByDate.get(date) ?? [])
      .filter((p) => p.school_id !== schoolId)
      .map((p) => `${p.school_name} · ${p.program_name} (검토대기)`);
    return [...approved, ...otherPending];
  }
  function hasOtherSchoolOnDate(date: string, schoolId: string): boolean {
    return otherSchoolEntriesOnDate(date, schoolId).length > 0;
  }
  const selectedPending =
    pendingItems.find((p) => p.itemId === selectedPendingId) ?? null;

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
          <span className="mr-1 inline-block h-2 w-2 rounded-sm bg-red-400" />
          강사 미배정
        </span>
        <span>
          <span className="mr-1 inline-block h-2 w-2 rounded-sm bg-zinc-400" />
          강의완료
        </span>
        <span>
          <span className="mr-1 inline-block h-2 w-2 rounded-sm border border-dashed border-violet-400 bg-violet-50" />
          검토대기(미승인 신청)
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
                      {s.session_status === "unassigned" && (
                        <span className="rounded bg-red-200 px-1 py-0.5 text-[10px] font-medium text-red-800">
                          배정 필요
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
              {(pendingByDate.get(date) ?? []).map((p) => {
                const overlap = hasOtherSchoolOnDate(date, p.school_id);
                return (
                  <button
                    key={p.itemId}
                    type="button"
                    onClick={() => setSelectedPendingId(p.itemId)}
                    className="rounded border border-dashed border-violet-400 bg-violet-50 px-1.5 py-1 text-left text-violet-900"
                  >
                    <div className="flex items-center gap-1 font-semibold leading-tight">
                      <span>{p.school_name}</span>
                      <span className="rounded bg-violet-200 px-1 py-0.5 text-[10px] font-medium text-violet-800">
                        검토대기
                      </span>
                      {overlap && (
                        <span className="rounded bg-amber-200 px-1 py-0.5 text-[10px] font-medium text-amber-900">
                          ⚠ 겹침
                        </span>
                      )}
                    </div>
                    <div className="leading-tight">{p.program_name}</div>
                    <div className="mt-0.5 flex flex-wrap gap-x-1.5 text-[11px] opacity-80">
                      {p.time_slot && <span>{p.time_slot}</span>}
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

      {selectedPending && (
        <PendingItemPopover
          item={selectedPending}
          overlaps={otherSchoolEntriesOnDate(
            selectedPending.scheduled_date,
            selectedPending.school_id,
          )}
          onClose={() => setSelectedPendingId(null)}
        />
      )}
    </div>
  );
}

function PendingItemPopover({
  item,
  overlaps,
  onClose,
}: {
  item: PendingCalendarItem;
  overlaps: string[];
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-sm flex-col gap-3 rounded-lg bg-surface p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-bold text-violet-800">
            🕓 검토대기 — {item.school_name}
          </h3>
          <span className="badge bg-violet-100 text-violet-800">
            {REQUEST_STATUS_LABEL[item.request_status]}
          </span>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-sm">
          <dt className="text-muted">프로그램</dt>
          <dd>{item.program_name}</dd>
          <dt className="text-muted">희망일자</dt>
          <dd>
            {item.scheduled_date}
            {item.time_slot ? ` · ${item.time_slot}` : ""}
          </dd>
          {item.student_count && (
            <>
              <dt className="text-muted">인원</dt>
              <dd>{item.student_count}</dd>
            </>
          )}
          {item.note && (
            <>
              <dt className="text-muted">비고</dt>
              <dd>{item.note}</dd>
            </>
          )}
        </dl>
        {overlaps.length > 0 && (
          <div className="rounded-md bg-amber-50 p-2 text-xs text-amber-900">
            <p className="mb-1 font-semibold">⚠ 같은 날짜 다른 학교 일정</p>
            <ul>
              {overlaps.map((o) => (
                <li key={o}>· {o}</li>
              ))}
            </ul>
          </div>
        )}
        <p className="text-xs text-muted">
          아직 승인 전이라 캘린더에 참고용으로만 표시됩니다. 승인·반려는 신청
          관리 화면에서 처리하세요.
        </p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-zinc-50"
          >
            닫기
          </button>
          <Link
            href={`/staff/requests/${item.requestId}`}
            className="rounded-md bg-brand px-3 py-1.5 text-sm font-semibold text-brand-fg hover:bg-brand-hover"
          >
            신청 상세 보기
          </Link>
        </div>
      </div>
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
