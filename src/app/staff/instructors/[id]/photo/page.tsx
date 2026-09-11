import Link from "next/link";
import { getInstructorContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Instructor } from "@/lib/types";
import { InstructorPhotoSection } from "@/components/instructor-photo-section";
import { stopProxyEdit } from "../../actions";

/** 작업지시서 #008-3 — 사진 업로드, staff 전용 화면(강사용 #003 화면 경유 없음) */
export default async function InstructorProxyPhotoPage({
  params,
}: PageProps<"/staff/instructors/[id]/photo">) {
  const { id } = await params;
  const ctx = await getInstructorContext();
  const supabase = await createClient();

  const { data: instructor } = await supabase
    .from("instructors")
    .select("id,name,photo_url")
    .eq("id", ctx.instructorId)
    .maybeSingle<Pick<Instructor, "id" | "name" | "photo_url">>();

  return (
    <div className="flex max-w-md flex-col gap-5">
      <div>
        <Link
          href={`/staff/instructors/${id}/edit`}
          className="text-sm text-muted hover:underline"
        >
          ← {instructor?.name ?? "강사"} 정보 대리입력
        </Link>
        <div className="mt-1 flex items-center justify-between gap-2">
          <h1 className="text-xl font-bold">
            {instructor?.name ?? "강사"} 사진 업로드
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
      </div>
      <InstructorPhotoSection
        photoUrl={instructor?.photo_url ?? null}
        readOnly={ctx.readOnly}
      />
    </div>
  );
}
