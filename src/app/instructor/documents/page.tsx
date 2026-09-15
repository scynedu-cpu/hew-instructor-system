import { getInstructorContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadInstructorDocuments } from "@/lib/instructor-documents";
import { DocumentsClient } from "./documents-client";

export default async function InstructorDocumentsPage() {
  const ctx = await getInstructorContext();
  const supabase = await createClient();
  const docs = await loadInstructorDocuments(supabase, ctx.instructorId);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-bold">제출 서류</h1>
        <p className="mt-1 text-sm text-muted">
          서류 종류별로 파일을 업로드하세요. 성범죄경력조회동의서(1년)·강사카드(3년)는
          발급일 기준으로 만료일이 자동 계산되고, 만료 30일 전부터 “임박”으로
          표시됩니다.
        </p>
      </div>
      <DocumentsClient docs={docs} readOnly={ctx.readOnly} />
    </div>
  );
}
