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
import { ConfirmPanel } from "./confirm-panel";

export default async function FinalConfirmDetailPage({
  params,
}: PageProps<"/staff/assignments/final/[assignmentId]">) {
  await requireRole("staff");
  const { assignmentId } = await params;
  const supabase = await createClient();

  const { data: assignment } = await supabase
    .from("assignments")
    .select("*")
    .eq("id", assignmentId)
    .maybeSingle<Assignment>();

  if (!assignment) notFound();

  const { data: session } = await supabase
    .from("class_sessions")
    .select("*, school:schools(id,name,level), program:programs(id,name,category)")
    .eq("id", assignment.session_id)
    .maybeSingle<ClassSessionWithRefs>();

  const { data: currentInstructor } = await supabase
    .from("instructors")
    .select("id,name,rating_avg,status,instructor_specialties(specialty)")
    .eq("id", assignment.instructor_id)
    .maybeSingle<
      Pick<Instructor, "id" | "name" | "rating_avg" | "status"> & {
        instructor_specialties: { specialty: string }[];
      }
    >();

  const { data: candidates } = await supabase
    .from("assignment_candidates")
    .select(
      "*, instructor:instructors(id,name,rating_avg,status,instructor_specialties(specialty))",
    )
    .eq("session_id", assignment.session_id)
    .order("rank", { ascending: true })
    .returns<AssignmentCandidateWithInstructor[]>();

  const alreadyConfirmed = assignment.assignment_type === "confirmed";

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <div>
        <Link
          href="/staff/assignments/final"
          className="text-sm text-link hover:underline"
        >
          ← 최종확정 목록
        </Link>
        <h1 className="mt-1 text-xl font-bold">
          {session?.school?.name} · {session?.program?.name}
        </h1>
        <span className="badge mt-1 inline-block bg-zinc-100 text-zinc-600">
          {session ? SESSION_STATUS_LABEL[session.session_status] : "-"}
        </span>
      </div>

      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 rounded-lg border border-border bg-surface p-4 text-sm sm:grid-cols-2">
        <Field label="예정일">{session?.scheduled_date || "-"}</Field>
        <Field label="시간대">{session?.time_slot || "-"}</Field>
        <Field label="필요 전문분야">{session?.required_specialty || "-"}</Field>
        <Field label="최종확정 마감일">{assignment.confirm_due_date || "-"}</Field>
        <Field label="임시배정 강사">{currentInstructor?.name ?? "-"}</Field>
        <Field label="임시배정 담당자">{assignment.assigned_by}</Field>
      </dl>

      {alreadyConfirmed ? (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-900">
          <p className="font-semibold text-green-800">이미 최종확정된 건입니다.</p>
          <p className="mt-1">
            확정 강사: {currentInstructor?.name ?? "-"}
            {assignment.is_changed_at_final && " (임시배정에서 변경됨)"}
          </p>
        </div>
      ) : (
        <ConfirmPanel
          assignmentId={assignment.id}
          requiredSpecialty={session?.required_specialty ?? null}
          currentInstructorId={assignment.instructor_id}
          currentInstructor={currentInstructor ?? null}
          candidates={candidates ?? []}
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
