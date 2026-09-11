// 제출 서류 목록 + 서명 URL 조회 — 강사 본인 화면(/instructor/documents)과
// 담당자 전용 화면(/staff/instructors/[id]/documents, 작업지시서 #008-3)에서
// 공용으로 쓴다.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { DocumentRow } from "@/lib/types";
import type { DocView } from "@/app/instructor/documents/documents-client";

const BUCKET = "instructor-documents";

export async function loadInstructorDocuments(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  instructorId: string,
): Promise<DocView[]> {
  const { data: rows } = await supabase
    .from("instructor_documents")
    .select("*")
    .eq("instructor_id", instructorId)
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
  return docs;
}
