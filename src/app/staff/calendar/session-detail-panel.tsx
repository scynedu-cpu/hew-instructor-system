"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  CalendarSession,
  InstructorWithSpecialties,
  TimeConflict,
} from "@/lib/types";
import { SESSION_STATUS_LABEL } from "@/lib/types";
import {
  checkRescheduleConflict,
  checkSwapConflict,
  completeSession,
  getSessionHistory,
  reschedule,
  swapInstructor,
  type SessionHistory,
} from "./actions";
import { ConflictDialog } from "./conflict-dialog";

export function SessionDetailPanel({
  session,
  instructors,
  onClose,
  onChanged,
}: {
  session: CalendarSession;
  instructors: InstructorWithSpecialties[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [date, setDate] = useState(session.scheduled_date);
  const [timeSlot, setTimeSlot] = useState(session.time_slot ?? "");
  const [reason, setReason] = useState("");
  const [query, setQuery] = useState("");
  const [pickedInstructor, setPickedInstructor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [history, setHistory] = useState<SessionHistory | null>(null);
  const [actualDate, setActualDate] = useState(session.scheduled_date);
  const [actualHours, setActualHours] = useState("");
  const [completeFile, setCompleteFile] = useState<File | null>(null);
  const [completeBusy, setCompleteBusy] = useState(false);
  const [completeErr, setCompleteErr] = useState<string | null>(null);
  const completeFileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<{
    title: string;
    message: string;
    conflicts: TimeConflict[];
    run: () => Promise<void>;
  } | null>(null);

  useEffect(() => {
    getSessionHistory(session.id).then(setHistory);
  }, [session.id]);

  const instructorName = useMemo(
    () => new Map(instructors.map((i) => [i.id, i.name])),
    [instructors],
  );

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return instructors.slice(0, 8);
    return instructors
      .filter(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          i.specialties.some((s) => s.toLowerCase().includes(q)),
      )
      .slice(0, 12);
  }, [query, instructors]);

  const scheduleChanged =
    date !== session.scheduled_date || timeSlot !== (session.time_slot ?? "");

  async function runReschedule() {
    setBusy(true);
    try {
      const res = await reschedule(session.id, date, timeSlot || null, reason);
      if (res.error) setErr(res.error);
      else onChanged();
    } finally {
      setBusy(false);
      setPending(null);
    }
  }

  async function runSwap() {
    if (!pickedInstructor) return;
    setBusy(true);
    try {
      const res = await swapInstructor(session.id, pickedInstructor, reason);
      if (res.error) setErr(res.error);
      else onChanged();
    } finally {
      setBusy(false);
      setPending(null);
    }
  }

  async function doReschedule() {
    setErr(null);
    if (!date) return setErr("날짜를 입력하세요.");
    setBusy(true);
    let conflicts: TimeConflict[] = [];
    try {
      conflicts = await checkRescheduleConflict(session.id, date, timeSlot || null);
    } finally {
      setBusy(false);
    }
    if (conflicts.length > 0) {
      setPending({
        title: "일정 변경 — 강사 배정 중복",
        message: `${session.instructor_name ?? "배정 강사"} 님이 ${date}${
          timeSlot ? ` ${timeSlot}` : ""
        }에 이미 다른 세션에 배정되어 있습니다.`,
        conflicts,
        run: runReschedule,
      });
      return;
    }
    await runReschedule();
  }

  async function doSwap() {
    setErr(null);
    if (!pickedInstructor) return setErr("교체할 강사를 선택하세요.");
    setBusy(true);
    let conflicts: TimeConflict[] = [];
    try {
      conflicts = await checkSwapConflict(session.id, pickedInstructor);
    } finally {
      setBusy(false);
    }
    if (conflicts.length > 0) {
      setPending({
        title: "강사 교체 — 배정 중복",
        message: `${instructorName.get(pickedInstructor) ?? "선택한 강사"} 님이 ${
          session.scheduled_date
        }${session.time_slot ? ` ${session.time_slot}` : ""}에 이미 다른 세션에 배정되어 있습니다.`,
        conflicts,
        run: runSwap,
      });
      return;
    }
    await runSwap();
  }

  async function doComplete() {
    setCompleteErr(null);
    if (!actualDate) return setCompleteErr("실제 강의일을 입력하세요.");
    if (!actualHours || Number(actualHours) <= 0) {
      return setCompleteErr("실제 강의 시간을 입력하세요.");
    }
    if (!completeFile) return setCompleteErr("강의확인서 파일을 첨부하세요.");
    const fd = new FormData();
    fd.set("session_id", session.id);
    fd.set("actual_date", actualDate);
    fd.set("actual_hours", actualHours);
    fd.set("file", completeFile);
    setCompleteBusy(true);
    try {
      const res = await completeSession(fd);
      if (res.error) setCompleteErr(res.error);
      else onChanged();
    } finally {
      setCompleteBusy(false);
    }
  }

  const timeline = buildTimeline(history, instructorName);

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-md flex-col gap-5 overflow-y-auto bg-surface p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold">{session.school_name}</h2>
            <p className="text-sm text-muted">{session.program_name}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-sm text-muted hover:bg-zinc-100"
          >
            닫기 ✕
          </button>
        </div>

        <dl className="grid grid-cols-2 gap-2 rounded-lg border border-border p-3 text-sm">
          <Field label="상태">
            {SESSION_STATUS_LABEL[session.session_status]}
          </Field>
          <Field label="현재 배정 강사">
            {session.instructor_name ?? "미정"}
          </Field>
          <Field label="예정일">{session.scheduled_date}</Field>
          <Field label="시간대">{session.time_slot || "-"}</Field>
        </dl>

        {err && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {err}
          </p>
        )}

        {/* 강의 완료 처리 — 작업지시서 #012, confirmed 세션만 노출 */}
        {session.session_status === "confirmed" && (
          <section className="flex flex-col gap-2 rounded-lg border border-brand/30 bg-blue-50/30 p-3">
            <h3 className="text-sm font-semibold">강의 완료 처리</h3>
            <label className="flex flex-col gap-1 text-xs text-muted">
              실제 강의일
              <input
                type="date"
                value={actualDate ?? ""}
                onChange={(e) => setActualDate(e.target.value)}
                className="rounded-md border border-border px-2 py-1.5 text-sm text-foreground"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              실제 강의 시간(시간)
              <input
                type="number"
                min="0"
                step="0.5"
                value={actualHours}
                onChange={(e) => setActualHours(e.target.value)}
                placeholder="예: 1.5"
                className="rounded-md border border-border px-2 py-1.5 text-sm text-foreground"
              />
            </label>
            <div className="flex flex-col gap-1 text-xs text-muted">
              강의확인서 파일
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => completeFileRef.current?.click()}
                  className="cursor-pointer rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium text-foreground hover:bg-zinc-50"
                >
                  파일 선택
                </button>
                <span className="truncate text-sm text-foreground">
                  {completeFile?.name ?? "선택된 파일 없음"}
                </span>
              </div>
              <input
                ref={completeFileRef}
                type="file"
                hidden
                onChange={(e) => setCompleteFile(e.target.files?.[0] ?? null)}
              />
            </div>
            {completeErr && (
              <p className="rounded bg-red-50 px-2 py-1 text-xs text-red-700">
                {completeErr}
              </p>
            )}
            <button
              type="button"
              disabled={completeBusy}
              onClick={doComplete}
              className="self-start rounded-md bg-brand px-3 py-1.5 text-sm font-semibold text-brand-fg hover:bg-brand-hover disabled:opacity-50"
            >
              {completeBusy ? "처리 중…" : "강의 완료 처리"}
            </button>
          </section>
        )}

        {/* 강의 완료된 세션은 일정/강사를 더 바꿀 수 없음 — 작업지시서 #012 수정 */}
        {session.session_status === "completed" ? (
          <section className="flex flex-col gap-1 rounded-lg border border-border bg-zinc-50 p-3 text-sm text-muted">
            <p className="font-semibold text-foreground">강의완료</p>
            <p>
              강의 완료 처리된 세션은 일정 변경·강사 교체를 할 수 없습니다.
            </p>
          </section>
        ) : (
          <>
            {/* 일정 변경 */}
            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold">일정 변경</h3>
              <div className="flex flex-wrap gap-2">
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="rounded-md border border-border px-2 py-1.5 text-sm"
                />
                <input
                  value={timeSlot}
                  onChange={(e) => setTimeSlot(e.target.value)}
                  placeholder="시간대 (예: 3·4교시)"
                  className="flex-1 rounded-md border border-border px-2 py-1.5 text-sm"
                />
              </div>
              <button
                type="button"
                disabled={busy || !scheduleChanged}
                onClick={doReschedule}
                className="self-start rounded-md bg-brand px-3 py-1.5 text-sm font-semibold text-brand-fg hover:bg-brand-hover disabled:opacity-50"
              >
                일정 변경 저장
              </button>
            </section>

            {/* 강사 교체 */}
            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold">강사 교체</h3>
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPickedInstructor(null);
                }}
                placeholder="이름 또는 전문분야로 검색"
                className="rounded-md border border-border px-2 py-1.5 text-sm"
              />
              <ul className="flex max-h-52 flex-col gap-1 overflow-y-auto">
                {matches.length === 0 && (
                  <li className="px-1 py-2 text-xs text-muted">
                    일치하는 강사가 없습니다.
                  </li>
                )}
                {matches.map((i) => (
                  <li key={i.id}>
                    <button
                      type="button"
                      onClick={() => setPickedInstructor(i.id)}
                      className={`flex w-full items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-left text-sm ${
                        pickedInstructor === i.id
                          ? "border-brand bg-blue-50/50"
                          : "border-border hover:bg-zinc-50"
                      } ${i.id === session.instructor_id ? "opacity-50" : ""}`}
                      disabled={i.id === session.instructor_id}
                    >
                      <span className="font-medium">
                        {i.name}
                        {i.id === session.instructor_id && " (현재)"}
                      </span>
                      <span className="truncate text-xs text-muted">
                        {i.specialties.join(", ") || "전문분야 미등록"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="변경 사유 (선택, 이력에 기록)"
                className="rounded-md border border-border px-2 py-1.5 text-sm"
              />
              <button
                type="button"
                disabled={busy || !pickedInstructor}
                onClick={doSwap}
                className="self-start rounded-md bg-amber-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
              >
                강사 교체
              </button>
            </section>
          </>
        )}

        {/* 이력 */}
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">변경 이력</h3>
          {!history ? (
            <p className="text-xs text-muted">불러오는 중…</p>
          ) : timeline.length === 0 ? (
            <p className="text-xs text-muted">변경 이력이 없습니다.</p>
          ) : (
            <ol className="flex flex-col gap-2 border-l-2 border-border pl-3 text-xs">
              {timeline.map((t, idx) => (
                <li key={idx} className="relative">
                  <span className="absolute -left-[17px] top-1 h-2 w-2 rounded-full bg-border" />
                  <div className="text-muted">
                    {new Date(t.at).toLocaleString("ko-KR")}
                    {t.by ? ` · ${t.by}` : ""}
                  </div>
                  <div>{t.text}</div>
                  {t.reason && (
                    <div className="text-muted">사유: {t.reason}</div>
                  )}
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      {pending && (
        <ConflictDialog
          title={pending.title}
          message={pending.message}
          conflicts={pending.conflicts}
          busy={busy}
          onCancel={() => setPending(null)}
          onConfirm={pending.run}
        />
      )}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}

type TimelineItem = {
  at: string;
  by: string | null;
  text: string;
  reason: string | null;
};

function buildTimeline(
  history: SessionHistory | null,
  instructorName: Map<string, string>,
): TimelineItem[] {
  if (!history) return [];
  const items: TimelineItem[] = [];

  for (const h of history.schedule) {
    const from = `${h.previous_date ?? "미정"}${
      h.previous_time_slot ? ` ${h.previous_time_slot}` : ""
    }`;
    const to = `${h.new_date}${h.new_time_slot ? ` ${h.new_time_slot}` : ""}`;
    items.push({
      at: h.changed_at,
      by: h.changed_by,
      text: `일정 변경: ${from} → ${to}`,
      reason: h.reason,
    });
  }

  for (const h of history.assignment) {
    const from = h.from_instructor_id
      ? (instructorName.get(h.from_instructor_id) ?? "이전 강사")
      : "미정";
    const to = h.to_instructor_id
      ? (instructorName.get(h.to_instructor_id) ?? "새 강사")
      : "미정";
    const ctx =
      h.change_context === "calendar_edit"
        ? "캘린더에서 교체"
        : h.change_context === "final_confirm"
          ? "최종확정 단계"
          : h.change_context;
    items.push({
      at: h.changed_at,
      by: h.changed_by,
      text: `강사 변경 (${ctx}): ${from} → ${to}`,
      reason: h.reason,
    });
  }

  return items.sort((a, b) => a.at.localeCompare(b.at));
}
