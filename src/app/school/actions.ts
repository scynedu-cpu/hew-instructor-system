"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";

export interface RequestFormState {
  error?: string;
}

export async function submitRequest(
  _prev: RequestFormState,
  formData: FormData,
): Promise<RequestFormState> {
  const { account } = await requireRole("school");
  if (!account.school_id) {
    return { error: "계정에 연결된 학교가 없습니다. 담당자에게 문의하세요." };
  }

  const programId = String(formData.get("program_id") ?? "").trim();
  const dates = formData
    .getAll("requested_dates")
    .map((d) => String(d).trim())
    .filter(Boolean);
  const preferredTimeSlot = String(formData.get("preferred_time_slot") ?? "").trim();
  const expectedStudentCount = String(
    formData.get("expected_student_count") ?? "",
  ).trim();
  const requiredSpecialty = String(formData.get("required_specialty") ?? "").trim();
  const rawCount = Number(formData.get("required_instructor_count") ?? 1);
  const requiredInstructorCount =
    Number.isFinite(rawCount) && rawCount >= 1 ? Math.floor(rawCount) : 1;

  // 필수: 프로그램 / 희망일자(1건 이상) / 필요 전문분야
  if (!programId) return { error: "프로그램을 선택하세요." };
  if (dates.length === 0) return { error: "희망일자를 1개 이상 입력하세요." };
  if (!requiredSpecialty) return { error: "필요 전문분야를 입력하세요." };

  const supabase = await createClient();
  const { error } = await supabase.from("session_requests").insert({
    school_id: account.school_id,
    program_id: programId,
    academic_year: new Date().getFullYear(),
    requested_dates: dates,
    preferred_time_slot: preferredTimeSlot || null,
    expected_student_count: expectedStudentCount || null,
    required_specialty: requiredSpecialty,
    required_instructor_count: requiredInstructorCount,
    request_status: "submitted",
    submitted_by: account.display_name,
  });

  if (error) {
    return { error: `제출 실패: ${error.message}` };
  }

  revalidatePath("/school");
  redirect("/school");
}
