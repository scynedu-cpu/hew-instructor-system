"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getInstructorContext } from "@/lib/auth";
import { DOC_TYPES, type DocType } from "@/lib/documents";

const BUCKET = "instructor-documents";

export interface ActionResult {
  error?: string;
}

const READ_ONLY: ActionResult = {
  error: "담당자 미리보기 모드에서는 수정할 수 없습니다.",
};

async function ctx() {
  const c = await getInstructorContext();
  const supabase = await createClient();
  return { supabase, instructorId: c.instructorId, readOnly: c.readOnly };
}

function safeName(name: string) {
  // Supabase Storage 키는 ASCII 안전문자만 — 한글 등은 '_' 로 치환
  const cleaned = name.replace(/[^A-Za-z0-9._-]/g, "_").replace(/_+/g, "_");
  return cleaned.slice(-60) || "file";
}

export async function uploadDocument(formData: FormData): Promise<ActionResult> {
  const { supabase, instructorId, readOnly } = await ctx();
  if (readOnly) return READ_ONLY;

  const docType = String(formData.get("doc_type") ?? "") as DocType;
  const issuedAtRaw = String(formData.get("issued_at") ?? "").trim();
  const issuedAt = issuedAtRaw || null;
  const file = formData.get("file");

  if (!DOC_TYPES.includes(docType)) return { error: "서류 종류가 올바르지 않습니다." };
  if (!(file instanceof File) || file.size === 0)
    return { error: "파일을 선택하세요." };
  if (file.size > 10 * 1024 * 1024)
    return { error: "파일은 10MB 이하만 가능합니다." };

  // 경로에 한글(doc_type)을 넣으면 Storage 가 "Invalid key" 를 낸다 → ASCII 만 사용
  const path = `${instructorId}/${crypto.randomUUID()}-${safeName(file.name)}`;
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (upErr) return { error: `업로드 실패: ${upErr.message}` };

  // 같은 종류의 기존 서류(+파일) 정리 → 종류별 1건 유지
  const { data: old } = await supabase
    .from("instructor_documents")
    .select("id,file_url")
    .eq("instructor_id", instructorId)
    .eq("doc_type", docType);

  if (old && old.length > 0) {
    const oldPaths = old
      .map((o) => o.file_url)
      .filter((u): u is string => !!u);
    if (oldPaths.length > 0) await supabase.storage.from(BUCKET).remove(oldPaths);
    await supabase
      .from("instructor_documents")
      .delete()
      .in(
        "id",
        old.map((o) => o.id),
      );
  }

  const { error } = await supabase.from("instructor_documents").insert({
    instructor_id: instructorId,
    doc_type: docType,
    file_url: path,
    issued_at: issuedAt,
  });
  if (error) {
    await supabase.storage.from(BUCKET).remove([path]);
    return { error: error.message };
  }

  revalidatePath("/instructor/documents");
  return {};
}

export async function deleteDocument(id: string): Promise<ActionResult> {
  const { supabase, instructorId, readOnly } = await ctx();
  if (readOnly) return READ_ONLY;

  const { data: row } = await supabase
    .from("instructor_documents")
    .select("file_url")
    .eq("id", id)
    .eq("instructor_id", instructorId)
    .maybeSingle<{ file_url: string | null }>();

  const { error } = await supabase
    .from("instructor_documents")
    .delete()
    .eq("id", id)
    .eq("instructor_id", instructorId);
  if (error) return { error: error.message };

  if (row?.file_url) await supabase.storage.from(BUCKET).remove([row.file_url]);

  revalidatePath("/instructor/documents");
  return {};
}
