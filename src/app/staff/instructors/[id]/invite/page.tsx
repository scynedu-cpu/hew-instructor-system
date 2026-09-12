import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Instructor } from "@/lib/types";
import { InviteForm } from "../../invite-form";

/** 작업지시서 #003-2 — 대리입력으로 이미 등록해둔 강사에게 계정 발급(연결) */
export default async function InviteExistingInstructorPage({
  params,
}: PageProps<"/staff/instructors/[id]/invite">) {
  await requireRole("staff");
  const { id } = await params;
  const supabase = await createClient();

  const { data: instructor } = await supabase
    .from("instructors")
    .select("id,name,email")
    .eq("id", id)
    .maybeSingle<Pick<Instructor, "id" | "name" | "email">>();
  if (!instructor) notFound();

  const { data: account } = await supabase
    .from("app_accounts")
    .select("id")
    .eq("instructor_id", id)
    .maybeSingle<{ id: string }>();
  if (account) redirect("/staff/instructors");

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link
          href="/staff/instructors"
          className="text-sm text-link hover:underline"
        >
          ← 강사 계정
        </Link>
        <h1 className="mt-1 text-xl font-bold">
          {instructor.name} 계정 초대
        </h1>
        <p className="mt-1 text-sm text-muted">
          대리입력으로 등록해둔 이 강사 프로필에 로그인 계정을 연결합니다.
        </p>
      </div>
      <InviteForm
        instructorId={instructor.id}
        defaultName={instructor.name}
        defaultEmail={instructor.email ?? ""}
      />
    </div>
  );
}
