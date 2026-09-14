"use server";

// 작업지시서 #019 (2-1) — 기관 설정. org_settings 는 항상 1행(id=true).

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const SEAL_BUCKET = "org-assets";
const PATH = "/staff/settings";

export interface ActionResult {
  error?: string;
  ok?: boolean;
}

export async function saveOrgSettings(formData: FormData): Promise<ActionResult> {
  const { account } = await requireRole("staff");
  const orgName = String(formData.get("org_name") ?? "").trim();
  const ceoName = String(formData.get("ceo_name") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();
  if (!orgName) return { error: "기관명을 입력하세요." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("org_settings")
    .update({
      org_name: orgName,
      ceo_name: ceoName,
      address,
      updated_by: account.display_name ?? "담당자",
      updated_at: new Date().toISOString(),
    })
    .eq("id", true);
  if (error) return { error: error.message };

  revalidatePath(PATH);
  return { ok: true };
}

export async function uploadSealImage(formData: FormData): Promise<ActionResult> {
  const { account } = await requireRole("staff");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "파일을 선택하세요." };
  }
  if (file.size > 3 * 1024 * 1024) return { error: "이미지는 3MB 이하만 가능합니다." };

  const supabase = await createClient();
  const ext = file.name.split(".").pop()?.toLowerCase() || "png";
  const path = `seal-${Date.now()}.${ext}`;

  const { error: upErr } = await supabase.storage
    .from(SEAL_BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type });
  if (upErr) return { error: `업로드 실패: ${upErr.message}` };

  const { error } = await supabase
    .from("org_settings")
    .update({
      seal_image_path: path,
      updated_by: account.display_name ?? "담당자",
      updated_at: new Date().toISOString(),
    })
    .eq("id", true);
  if (error) return { error: error.message };

  revalidatePath(PATH);
  return { ok: true };
}
