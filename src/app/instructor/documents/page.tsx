import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { DocumentRow } from "@/lib/types";
import { DocumentsClient, type DocView } from "./documents-client";

const BUCKET = "instructor-documents";

export default async function InstructorDocumentsPage() {
  const { account } = await requireRole("instructor");
  const supabase = await createClient();

  const { data: rows } = await supabase
    .from("instructor_documents")
    .select("*")
    .eq("instructor_id", account.instructor_id!)
    .order("created_at", { ascending: false })
    .returns<DocumentRow[]>();

  const docs: DocView[] = [];
  for (const r of rows ?? []) {
    let signedUrl: string | null = null;
    if (r.file_url) {
      const { data } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(r.file_url, 60 * 60);
      signedUrl = data?.signedUrl ?? null;
    }
    docs.push({
      id: r.id,
      doc_type: r.doc_type,
      issued_at: r.issued_at,
      expires_at: r.expires_at,
      signedUrl,
      fileName: r.file_url?.split("/").pop() ?? null,
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-bold">제출 서류</h1>
        <p className="mt-1 text-sm text-muted">
          서류 종류별로 파일을 업로드하세요. 성범죄경력조회동의서(1년)·이력서(3년)는
          발급일 기준으로 만료일이 자동 계산되고, 만료 30일 전부터 “임박”으로
          표시됩니다.
        </p>
      </div>
      <DocumentsClient docs={docs} />
    </div>
  );
}
