import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type {
  Assignment,
  AssignmentCandidateWithInstructor,
  ClassSessionWithRefs,
  Instructor,
} from "@/lib/types";
import { SESSION_STATUS_LABEL } from "@/lib/types";
import { ScheduleForm } from "./schedule-form";
import { CandidatePicker } from "./candidate-picker";

export default async function AssignmentDetailPage({
  params,
}: PageProps<"/staff/assignments/[sessionId]">) {
  await requireRole("staff");
  const { sessionId } = await params;
  const supabase = await createClient();

  const { data: session } = await supabase
    .from("class_sessions")
    .select(
      "*, school:schools(id,name,level), program:programs(id,name,category), request_item:session_request_items(requested_dates,preferred_time_slot,dates_tbd)",
    )
    .eq("id", sessionId)
    .maybeSingle<ClassSessionWithRefs>();

  if (!session) notFound();

  const { data: candidates } = await supabase
    .from("assignment_candidates")
    .select(
      "*, instructor:instructors(id,name,rating_avg,status,instructor_specialties(specialty))",
    )
    .eq("session_id", sessionId)
    .order("rank", { ascending: true })
    .returns<AssignmentCandidateWithInstructor[]>();

  const { data: assignment } = await supabase
    .from("assignments")
    .select("*")
    .eq("session_id", sessionId)
    .maybeSingle<Assignment>();

  let assignedInstructor: Pick<Instructor, "id" | "name"> | null = null;
  if (assignment) {
    const { data: ins } = await supabase
      .from("instructors")
      .select("id,name")
      .eq("id", assignment.instructor_id)
      .maybeSingle<Pick<Instructor, "id" | "name">>();
    assignedInstructor = ins ?? null;
  }

  const scheduleConfirmed = !!session.scheduled_date;

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <div>
        <Link
          href="/staff/assignments"
          className="text-sm text-muted hover:underline"
        >
          ← 강사 배정
        </Link>
        <h1 className="mt-1 text-xl font-bold">
          {session.school?.name} · {session.program?.name}
        </h1>
        <span className="badge mt-1 inline-block bg-zinc-100 text-zinc-600">
          {SESSION_STATUS_LABEL[session.session_status]}
        </span>
      </div>

      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 rounded-lg border border-border bg-surface p-4 text-sm sm:grid-cols-2">
        <Field label="학교">
          {session.school?.name}{" "}
          <span className="text-muted">({session.school?.level})</span>
        </Field>
        <Field label="프로그램">{session.program?.name}</Field>
        <Field label="학년도">{session.academic_year}</Field>
        <Field label="필요 전문분야">{session.required_specialty || "-"}</Field>
        <Field label="필요 강사 수">{session.required_instructor_count}명</Field>
        <Field label="인원">{session.student_count || "-"}</Field>
        <Field label="예정일">
          {session.scheduled_date || (
            <span className="text-amber-700">미확정</span>
          )}
        </Field>
        <Field label="시간대">{session.time_slot || "-"}</Field>
      </dl>

      {session.session_status === "unassigned" && (
        <>
          <ScheduleForm
            sessionId={session.id}
            requestedDates={session.request_item?.requested_dates ?? []}
            currentDate={session.scheduled_date}
            currentTimeSlot={
              session.time_slot ?? session.request_item?.preferred_time_slot ?? ""
            }
            hasCandidates={(candidates ?? []).length > 0}
          />

          {scheduleConfirmed && (candidates ?? []).length === 0 && (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
              예정일이 확정되어 있습니다. 위 <b>「예정일 확정 · 후보 계산」</b>{" "}
              버튼을 눌러 추천 후보 3명을 계산하세요.
            </p>
          )}

          {(candidates ?? []).length > 0 && (
            <CandidatePicker
              sessionId={session.id}
              requiredSpecialty={session.required_specialty}
              candidates={candidates ?? []}
            />
          )}
        </>
      )}

      {session.session_status !== "unassigned" && assignment && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm">
          <p className="font-semibold text-green-800">
            {assignment.assignment_type === "provisional"
              ? "임시배정 완료"
              : "최종확정 완료"}
          </p>
          <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-green-900">
            <Field label="배정 강사">{assignedInstructor?.name ?? "-"}</Field>
            <Field label="예정일">{session.scheduled_date || "-"}</Field>
            <Field label="시간대">{session.time_slot || "-"}</Field>
            <Field label="최종확정 마감일">
              {assignment.confirm_due_date || "-"}
            </Field>
            <Field label="담당자">{assignment.assigned_by}</Field>
            {assignment.is_changed_at_final && (
              <Field label="비고">최종확정 시 강사 변경됨</Field>
            )}
          </dl>
          {assignment.assignment_type === "provisional" && (
            <p className="mt-2 text-xs text-green-700">
              강의 1개월 전(마감일 {assignment.confirm_due_date})부터{" "}
              <Link
                href="/staff/assignments/final"
                className="font-medium underline"
              >
                최종확정
              </Link>{" "}
              탭에 노출됩니다.
            </p>
          )}
        </div>
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
