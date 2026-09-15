import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { SessionRequestWithRefs } from "@/lib/types";
import { programLabel, SESSION_STATUS_LABEL } from "@/lib/types";
import { StatusBadge } from "@/components/status-badge";
import {
  AUTO_APPROVE_REVIEWER,
  collectPrimaryDates,
  findScheduleOverlaps,
} from "@/lib/schedule-overlap";
import { ReviewPanel } from "./review-panel";

type SessionRow = {
  id: string;
  session_status: keyof typeof SESSION_STATUS_LABEL;
  scheduled_date: string | null;
  time_slot: string | null;
  student_count: string | null;
  required_specialty: string | null;
  program_id: string;
};

export default async function StaffRequestDetailPage({
  params,
}: PageProps<"/staff/requests/[id]">) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: r } = await supabase
    .from("session_requests")
    .select(
      "*, school:schools(id,name,level), session_request_items(*, program:programs(id,name,category,sub_program,matching_keyword)), class_sessions(id,session_status,scheduled_date,time_slot,student_count,required_specialty,program_id)",
    )
    .eq("id", id)
    .maybeSingle<
      Omit<SessionRequestWithRefs, "class_sessions"> & {
        class_sessions: SessionRow[];
      }
    >();

  if (!r) notFound();

  const items = r.session_request_items ?? [];
  const sessions = r.class_sessions ?? [];
  const isPending =
    r.request_status === "submitted" || r.request_status === "reviewing";
  const isAutoApproved =
    r.request_status === "approved" && r.reviewed_by === AUTO_APPROVE_REVIEWER;

  const overlaps = isPending
    ? await (async () => {
        const { allDatesKnown, dates } = collectPrimaryDates(items);
        if (!allDatesKnown) return [];
        return findScheduleOverlaps(supabase, r.school_id, dates);
      })()
    : [];

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <div>
        <Link
          href="/staff/requests"
          className="text-sm text-link hover:underline"
        >
          ← 교육 신청 관리
        </Link>
        <div className="mt-1 flex items-center gap-2">
          <h1 className="text-xl font-bold">
            {r.school?.name} · 프로그램 {items.length}건
          </h1>
          <StatusBadge status={r.request_status} />
        </div>
      </div>

      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 rounded-lg border border-border bg-surface p-4 text-sm sm:grid-cols-2">
        <Field label="학교">
          {r.school?.name} <span className="text-muted">({r.school?.level})</span>
        </Field>
        <Field label="학년도">{r.academic_year}</Field>
        <Field label="담당교사">{r.teacher_name || "-"}</Field>
        <Field label="제출">
          {new Date(r.submitted_at).toLocaleString("ko-KR")}
          {r.submitted_by ? ` · ${r.submitted_by}` : ""}
        </Field>
        {r.proxy_note && (
          <Field label="대리입력 비고">
            <span className="whitespace-pre-wrap">{r.proxy_note}</span>
          </Field>
        )}
        {r.reviewed_at && (
          <Field label="검토">
            {new Date(r.reviewed_at).toLocaleString("ko-KR")}
            {r.reviewed_by ? ` · ${r.reviewed_by}` : ""}
          </Field>
        )}
      </dl>

      {/* 신청 프로그램(명세) */}
      <div>
        <h2 className="mb-2 text-sm font-semibold text-muted">
          신청 프로그램 ({items.length}건)
        </h2>
        <ul className="flex flex-col gap-2">
          {items.map((it) => (
            <li
              key={it.id}
              className="rounded-lg border border-border bg-surface p-3 text-sm"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">
                  {it.program ? programLabel(it.program) : "프로그램"}
                </span>
                {it.program?.matching_keyword && (
                  <span className="badge bg-blue-50 text-blue-700">
                    매칭: {it.program.matching_keyword}
                  </span>
                )}
              </div>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted">
                <span>
                  희망일자:{" "}
                  {it.dates_tbd
                    ? "미정"
                    : (it.requested_dates ?? []).join(", ") || "-"}
                </span>
                <span>시간: {it.preferred_time_slot || "-"}</span>
                <span>인원: {it.expected_student_count || "-"}</span>
                {it.note && <span>비고: {it.note}</span>}
              </div>
            </li>
          ))}
        </ul>
      </div>

      {isPending && overlaps.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">
            ⚠ 다른 학교 일정과 겹쳐 자동승인되지 않았습니다
          </p>
          <ul className="mt-2 flex flex-col gap-1">
            {overlaps.map((o, i) => (
              <li key={i}>
                · {o.date} — {o.schoolName} · {o.programLabel}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-amber-700">
            내용을 확인한 뒤 그대로 승인하거나 반려하세요.
          </p>
        </div>
      )}

      {r.request_status === "rejected" && (
        <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">
          <span className="font-semibold">반려 사유:</span>{" "}
          {r.rejection_reason || "(사유 미기재)"}
        </div>
      )}

      {r.request_status === "approved" && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm">
          <p className="font-semibold text-green-800">
            {isAutoApproved
              ? `자동승인됨(다른 학교 일정과 겹치지 않음) — 수업 일정 ${sessions.length}건 생성 완료`
              : `승인됨 — 수업 일정 ${sessions.length}건 생성 완료`}
          </p>
          <ul className="mt-2 flex flex-col gap-1 text-green-900">
            {sessions.map((s) => {
              const it = items.find((i) => i.program_id === s.program_id);
              return (
                <li key={s.id}>
                  · {it?.program ? programLabel(it.program) : "프로그램"} —{" "}
                  {SESSION_STATUS_LABEL[s.session_status]} /{" "}
                  {s.scheduled_date || "예정일 미정"}
                  {s.time_slot ? ` / ${s.time_slot}` : ""}
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-xs text-green-700">
            예정일 확정과 강사 배정은 다음 단계(강사 배정)에서 진행됩니다.
          </p>
        </div>
      )}

      {isPending && (
        <ReviewPanel
          requestId={r.id}
          status={r.request_status as "submitted" | "reviewing"}
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
