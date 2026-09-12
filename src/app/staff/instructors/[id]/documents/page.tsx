import Link from "next/link";
import { getInstructorContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadInstructorDocuments } from "@/lib/instructor-documents";
import { DocumentsClient } from "@/app/instructor/documents/documents-client";
import { stopProxyEdit } from "../../actions";

/** 작업지시서 #008-3 — 제출 서류 입력, staff 전용 화면(강사용 #003 화면 경유 없음).
 *  업로드·만료 계산 로직(#003)은 그대로 재사용, 화면만 담당자 전용으로 새로 연결. */
export default async function InstructorProxyDocumentsPage({
  params,
}: PageProps<"/staff/instructors/[id]/documents">) {
  const { id } = await params;
  const ctx = await getInstructorContext();
  const supabase = await createClient();

  const [{ data: instructor }, docs] = await Promise.all([
    supabase
      .from("instructors")
      .select("name")
      .eq("id", ctx.instructorId)
      .maybeSingle<{ name: string }>(),
    loadInstructorDocuments(supabase, ctx.instructorId),
  ]);

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <div>
        <Link
          href={`/staff/instructors/${id}/edit`}
          className="text-sm text-link hover:underline"
        >
          ← {instructor?.name ?? "강사"} 정보 수정
        </Link>
        <div className="mt-1 flex items-center justify-between gap-2">
          <h1 className="text-xl font-bold">
            {instructor?.name ?? "강사"} 제출 서류
          </h1>
          <form action={stopProxyEdit}>
            <button
              type="submit"
              className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-zinc-50"
            >
              수정 종료
            </button>
          </form>
        </div>
        <p className="mt-1 text-sm text-muted">
          서류 종류별로 파일을 업로드하세요. 성범죄경력조회동의서(1년)·이력서(3년)는
          발급일 기준으로 만료일이 자동 계산되고, 만료 30일 전부터 “임박”으로
          표시됩니다.
        </p>
      </div>
      <DocumentsClient docs={docs} readOnly={ctx.readOnly} />
    </div>
  );
}
