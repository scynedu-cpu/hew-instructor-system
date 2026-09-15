"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import type { SchoolLevel } from "@/lib/types";

export interface SchoolFormState {
  error?: string;
  ok?: string;
}

const LEVELS: SchoolLevel[] = ["초등학교", "중학교", "고등학교"];

export async function createSchool(
  _prev: SchoolFormState,
  formData: FormData,
): Promise<SchoolFormState> {
  await requireRole("staff");

  const name = String(formData.get("name") ?? "").trim();
  const level = String(formData.get("level") ?? "");
  const district = String(formData.get("district") ?? "").trim();
  const teacherName = String(formData.get("teacher_name") ?? "").trim();
  const teacherPhone = String(formData.get("teacher_phone") ?? "").trim();
  const teacherEmail = String(formData.get("teacher_email") ?? "").trim();

  if (!name) return { error: "학교명을 입력하세요." };
  if (!LEVELS.includes(level as SchoolLevel)) {
    return { error: "학교급을 선택하세요." };
  }

  const supabase = await createClient();

  // 같은 이름으로 이미 등록돼 있으면 중복 생성 대신 안내(자동채움 매칭이 이름
  // 기준이라 같은 학교가 여러 레코드로 흩어지면 곤란함).
  const { data: existing } = await supabase
    .from("schools")
    .select("id")
    .eq("name", name)
    .maybeSingle<{ id: string }>();
  if (existing) return { error: `"${name}"은(는) 이미 등록되어 있습니다.` };

  const { error } = await supabase.from("schools").insert({
    name,
    level,
    district: district || null,
    teacher_name: teacherName || null,
    teacher_phone: teacherPhone || null,
    teacher_email: teacherEmail || null,
  });
  if (error) return { error: error.message };

  revalidatePath("/staff/schools");
  return { ok: `"${name}"을(를) 등록했습니다.` };
}
