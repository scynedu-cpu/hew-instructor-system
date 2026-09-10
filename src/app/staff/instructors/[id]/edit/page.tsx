import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type {
  CareerRow,
  CertRow,
  Instructor,
  SpecialtyRow,
} from "@/lib/types";
import { InstructorProxyForm } from "./instructor-proxy-form";
import { stopProxyEdit } from "../../actions";

export default async function InstructorProxyEditPage({
  params,
}: PageProps<"/staff/instructors/[id]/edit">) {
  await requireRole("staff");
  const { id } = await params;
  const supabase = await createClient();

  const { data: instructor } = await supabase
    .from("instructors")
    .select("*")
    .eq("id", id)
    .maybeSingle<Instructor>();
  if (!instructor) notFound();

  const [{ data: career }, { data: certs }, { data: specialties }] =
    await Promise.all([
      supabase
        .from("instructor_career_history")
        .select("*")
        .eq("instructor_id", id)
        .returns<CareerRow[]>(),
      supabase
        .from("instructor_certifications")
        .select("*")
        .eq("instructor_id", id)
        .returns<CertRow[]>(),
      supabase
        .from("instructor_specialties")
        .select("*")
        .eq("instructor_id", id)
        .order("specialty")
        .returns<SpecialtyRow[]>(),
    ]);

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <div>
        <Link
          href="/staff/instructors"
          className="text-sm text-muted hover:underline"
        >
          ← 강사 계정
        </Link>
        <div className="mt-1 flex items-center justify-between gap-2">
          <h1 className="text-xl font-bold">
            {instructor.name || "강사"} 정보 대리입력
          </h1>
          <form action={stopProxyEdit}>
            <button
              type="submit"
              className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-zinc-50"
            >
              대리입력 종료
            </button>
          </form>
        </div>
        <p className="mt-1 text-sm text-muted">
          기본정보·경력·자격증·전문분야를 입력하고 <b>저장</b>을 누르면 반영됩니다.
          사진·제출서류는 아래 링크에서 관리하세요.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 text-sm">
        <Link
          href="/instructor"
          className="rounded-md border border-border px-3 py-1.5 hover:bg-zinc-50"
        >
          사진 업로드 화면 →
        </Link>
        <Link
          href="/instructor/documents"
          className="rounded-md border border-border px-3 py-1.5 hover:bg-zinc-50"
        >
          제출 서류 입력 화면 →
        </Link>
      </div>

      <InstructorProxyForm
        instructor={instructor}
        career={career ?? []}
        certs={certs ?? []}
        specialties={(specialties ?? []).map((s) => s.specialty)}
      />
    </div>
  );
}
