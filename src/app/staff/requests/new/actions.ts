"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";

export interface ProxyRequestState {
  error?: string;
}

export async function submitProxyRequest(
  _prev: ProxyRequestState,
  formData: FormData,
): Promise<ProxyRequestState> {
  const { account } = await requireRole("staff");

  const schoolId = String(formData.get("school_id") ?? "").trim();
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
  const proxyNote = String(formData.get("proxy_note") ?? "").trim();

  if (!schoolId) return { error: "학교를 선택하세요." };
  if (!programId) return { error: "프로그램을 선택하세요." };
  if (dates.length === 0) return { error: "희망일자를 1개 이상 입력하세요." };
  if (!requiredSpecialty) return { error: "필요 전문분야를 입력하세요." };

  const supabase = await createClient();
  const { error } = await supabase.from("session_requests").insert({
    school_id: schoolId,
    program_id: programId,
    academic_year: new Date().getFullYear(),
    requested_dates: dates,
    preferred_time_slot: preferredTimeSlot || null,
    expected_student_count: expectedStudentCount || null,
    required_specialty: requiredSpecialty,
    required_instructor_count: requiredInstructorCount,
    request_status: "submitted",
    submitted_by: account.display_name ?? "담당자",
    proxy_note: proxyNote || null,
  });

  if (error) return { error: `저장 실패: ${error.message}` };

  revalidatePath("/staff/requests");
  redirect("/staff/requests?proxy=1");
}
