"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getInstructorContext } from "@/lib/auth";

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

/* ---------------- 기본 프로필 ---------------- */

export interface ProfileInput {
  name: string;
  mobile_phone: string;
  birth_date: string;
  address: string;
  home_phone: string;
  email: string;
  bank_account: string;
}

export async function saveProfile(input: ProfileInput): Promise<ActionResult> {
  const { supabase, instructorId, readOnly } = await ctx();
  if (readOnly) return READ_ONLY;

  const name = input.name.trim();
  const mobile = input.mobile_phone.trim();
  if (!name) return { error: "성명은 필수입니다." };
  if (!mobile) return { error: "휴대전화는 필수입니다." };

  const { error } = await supabase
    .from("instructors")
    .update({
      name,
      mobile_phone: mobile,
      birth_date: input.birth_date || null,
      address: input.address.trim() || null,
      home_phone: input.home_phone.trim() || null,
      email: input.email.trim() || null,
      bank_account: input.bank_account.trim() || null,
    })
    .eq("id", instructorId);

  if (error) return { error: error.message };
  revalidatePath("/instructor");
  return {};
}

export async function uploadPhoto(formData: FormData): Promise<ActionResult> {
  const { supabase, instructorId, readOnly } = await ctx();
  if (readOnly) return READ_ONLY;
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "파일을 선택하세요." };
  }
  if (file.size > 5 * 1024 * 1024) return { error: "사진은 5MB 이하만 가능합니다." };

  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${instructorId}/photo-${Date.now()}.${ext}`;

  const { error: upErr } = await supabase.storage
    .from("instructor-photos")
    .upload(path, file, { upsert: true, contentType: file.type });
  if (upErr) return { error: `업로드 실패: ${upErr.message}` };

  const { data } = supabase.storage.from("instructor-photos").getPublicUrl(path);
  const { error } = await supabase
    .from("instructors")
    .update({ photo_url: data.publicUrl })
    .eq("id", instructorId);
  if (error) return { error: error.message };

  revalidatePath("/instructor");
  return {};
}

/* ---------------- 경력 ---------------- */

export interface CareerInput {
  year_month: string;
  description: string;
  issuing_org: string;
}

export async function addCareer(input: CareerInput): Promise<ActionResult> {
  const { supabase, instructorId, readOnly } = await ctx();
  if (readOnly) return READ_ONLY;
  if (!input.description.trim()) return { error: "내용을 입력하세요." };
  const { error } = await supabase.from("instructor_career_history").insert({
    instructor_id: instructorId,
    year_month: input.year_month.trim() || null,
    description: input.description.trim(),
    issuing_org: input.issuing_org.trim() || null,
  });
  if (error) return { error: error.message };
  revalidatePath("/instructor");
  return {};
}

export async function updateCareer(
  id: string,
  input: CareerInput,
): Promise<ActionResult> {
  const { supabase, instructorId, readOnly } = await ctx();
  if (readOnly) return READ_ONLY;
  if (!input.description.trim()) return { error: "내용을 입력하세요." };
  const { error } = await supabase
    .from("instructor_career_history")
    .update({
      year_month: input.year_month.trim() || null,
      description: input.description.trim(),
      issuing_org: input.issuing_org.trim() || null,
    })
    .eq("id", id)
    .eq("instructor_id", instructorId);
  if (error) return { error: error.message };
  revalidatePath("/instructor");
  return {};
}

export async function deleteCareer(id: string): Promise<ActionResult> {
  const { supabase, instructorId, readOnly } = await ctx();
  if (readOnly) return READ_ONLY;
  const { error } = await supabase
    .from("instructor_career_history")
    .delete()
    .eq("id", id)
    .eq("instructor_id", instructorId);
  if (error) return { error: error.message };
  revalidatePath("/instructor");
  return {};
}

/* ---------------- 자격증 ---------------- */

export interface CertInput {
  cert_name: string;
  issued_date: string;
  issuing_org: string;
}

export async function addCert(input: CertInput): Promise<ActionResult> {
  const { supabase, instructorId, readOnly } = await ctx();
  if (readOnly) return READ_ONLY;
  if (!input.cert_name.trim()) return { error: "자격증명을 입력하세요." };
  const { error } = await supabase.from("instructor_certifications").insert({
    instructor_id: instructorId,
    cert_name: input.cert_name.trim(),
    issued_date: input.issued_date || null,
    issuing_org: input.issuing_org.trim() || null,
  });
  if (error) return { error: error.message };
  revalidatePath("/instructor");
  return {};
}

export async function updateCert(
  id: string,
  input: CertInput,
): Promise<ActionResult> {
  const { supabase, instructorId, readOnly } = await ctx();
  if (readOnly) return READ_ONLY;
  if (!input.cert_name.trim()) return { error: "자격증명을 입력하세요." };
  const { error } = await supabase
    .from("instructor_certifications")
    .update({
      cert_name: input.cert_name.trim(),
      issued_date: input.issued_date || null,
      issuing_org: input.issuing_org.trim() || null,
    })
    .eq("id", id)
    .eq("instructor_id", instructorId);
  if (error) return { error: error.message };
  revalidatePath("/instructor");
  return {};
}

export async function deleteCert(id: string): Promise<ActionResult> {
  const { supabase, instructorId, readOnly } = await ctx();
  if (readOnly) return READ_ONLY;
  const { error } = await supabase
    .from("instructor_certifications")
    .delete()
    .eq("id", id)
    .eq("instructor_id", instructorId);
  if (error) return { error: error.message };
  revalidatePath("/instructor");
  return {};
}

/* ---------------- 전문분야 ---------------- */

export async function addSpecialty(specialty: string): Promise<ActionResult> {
  const { supabase, instructorId, readOnly } = await ctx();
  if (readOnly) return READ_ONLY;
  const s = specialty.trim();
  if (!s) return { error: "전문분야를 입력하세요." };

  const { data: existing } = await supabase
    .from("instructor_specialties")
    .select("id")
    .eq("instructor_id", instructorId)
    .eq("specialty", s)
    .maybeSingle();
  if (existing) return { error: "이미 추가된 전문분야입니다." };

  const { error } = await supabase
    .from("instructor_specialties")
    .insert({ instructor_id: instructorId, specialty: s });
  if (error) return { error: error.message };
  revalidatePath("/instructor");
  return {};
}

export async function removeSpecialty(id: string): Promise<ActionResult> {
  const { supabase, instructorId, readOnly } = await ctx();
  if (readOnly) return READ_ONLY;
  const { error } = await supabase
    .from("instructor_specialties")
    .delete()
    .eq("id", id)
    .eq("instructor_id", instructorId);
  if (error) return { error: error.message };
  revalidatePath("/instructor");
  return {};
}

/* ---------------- 강의 불가기간 (작업지시서 #015) ---------------- */

export interface UnavailableInput {
  start_date: string;
  end_date: string;
  reason: string;
}

function validateUnavailable(input: UnavailableInput): string | null {
  if (!input.start_date || !input.end_date) return "시작일과 종료일을 입력하세요.";
  if (input.end_date < input.start_date) return "종료일은 시작일보다 빠를 수 없습니다.";
  return null;
}

export async function addUnavailable(input: UnavailableInput): Promise<ActionResult> {
  const { supabase, instructorId, readOnly } = await ctx();
  if (readOnly) return READ_ONLY;
  const invalid = validateUnavailable(input);
  if (invalid) return { error: invalid };
  const { error } = await supabase.from("instructor_unavailable_periods").insert({
    instructor_id: instructorId,
    start_date: input.start_date,
    end_date: input.end_date,
    reason: input.reason.trim() || null,
  });
  if (error) return { error: error.message };
  revalidatePath("/instructor");
  return {};
}

export async function updateUnavailable(
  id: string,
  input: UnavailableInput,
): Promise<ActionResult> {
  const { supabase, instructorId, readOnly } = await ctx();
  if (readOnly) return READ_ONLY;
  const invalid = validateUnavailable(input);
  if (invalid) return { error: invalid };
  const { error } = await supabase
    .from("instructor_unavailable_periods")
    .update({
      start_date: input.start_date,
      end_date: input.end_date,
      reason: input.reason.trim() || null,
    })
    .eq("id", id)
    .eq("instructor_id", instructorId);
  if (error) return { error: error.message };
  revalidatePath("/instructor");
  return {};
}

export async function deleteUnavailable(id: string): Promise<ActionResult> {
  const { supabase, instructorId, readOnly } = await ctx();
  if (readOnly) return READ_ONLY;
  const { error } = await supabase
    .from("instructor_unavailable_periods")
    .delete()
    .eq("id", id)
    .eq("instructor_id", instructorId);
  if (error) return { error: error.message };
  revalidatePath("/instructor");
  return {};
}
