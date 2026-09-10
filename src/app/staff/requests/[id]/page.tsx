import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { SessionRequestWithRefs } from "@/lib/types";
import { StatusBadge } from "@/components/status-badge";
import { ReviewPanel } from "./review-panel";

export default async function StaffRequestDetailPage({
  params,
}: PageProps<"/staff/requests/[id]">) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: r } = await supabase
    .from("session_requests")
    .select(
      "*, school:schools(id,name,level), program:programs(id,name,category), class_sessions(id,session_status,scheduled_date,time_slot,student_count,required_specialty,required_instructor_count)",
    )
    .eq("id", id)
    .maybeSingle<
      SessionRequestWithRefs & {
        class_sessions: {
          id: string;
          session_status: string;
          scheduled_date: string | null;
          time_slot: string | null;
          student_count: string | null;
          required_specialty: string | null;
          required_instructor_count: number;
        }[];
      }
    >();

  if (!r) notFound();

  const session = r.class_sessions?.[0];
  const isPending =
    r.request_status === "submitted" || r.request_status === "reviewing";

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <div>
        <Link
          href="/staff/requests"
          className="text-sm text-muted hover:underline"
        >
          ← 교육 신청 관리
        </Link>
        <div className="mt-1 flex items-center gap-2">
          <h1 className="text-xl font-bold">
            {r.school?.name} · {r.program?.name}
          </h1>
          <StatusBadge status={r.request_status} />
        </div>
      </div>

      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 rounded-lg border border-border bg-surface p-4 text-sm sm:grid-cols-2">
        <Field label="학교">
          {r.school?.name} <span className="text-muted">({r.school?.level})</span>
        </Field>
        <Field label="프로그램">
          {r.program?.name}
          {r.program?.category ? ` · ${r.program.category}` : ""}
        </Field>
        <Field label="학년도">{r.academic_year}</Field>
        <Field label="희망일자">
          {(r.requested_dates ?? []).join(", ") || "-"}
        </Field>
        <Field label="희망 시간대">{r.preferred_time_slot || "-"}</Field>
        <Field label="예상 인원">{r.expected_student_count || "-"}</Field>
        <Field label="필요 전문분야">{r.required_specialty || "-"}</Field>
        <Field label="필요 강사 수">{r.required_instructor_count}명</Field>
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

      {r.request_status === "rejected" && (
        <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">
          <span className="font-semibold">반려 사유:</span>{" "}
          {r.rejection_reason || "(사유 미기재)"}
        </div>
      )}

      {r.request_status === "approved" && session && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm">
          <p className="font-semibold text-green-800">
            승인됨 — 수업 일정 생성 완료
          </p>
          <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-green-900">
            <Field label="세션 상태">{session.session_status}</Field>
            <Field label="예정일">{session.scheduled_date || "미정"}</Field>
            <Field label="시간대">{session.time_slot || "-"}</Field>
            <Field label="인원">{session.student_count || "-"}</Field>
          </dl>
          <p className="mt-2 text-xs text-green-700">
            실제 날짜 확정과 강사 배정은 다음 단계(강사 매칭)에서 진행됩니다.
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
