"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";

export interface ActionState {
  error?: string;
  ok?: string;
}

/** 예정일/시간대 확정 → 매칭 함수 실행 (초기 배정 화면) */
export async function confirmSchedule(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireRole("staff");

  const sessionId = String(formData.get("session_id") ?? "");
  const scheduledDate = String(formData.get("scheduled_date") ?? "").trim();
  const timeSlot = String(formData.get("time_slot") ?? "").trim();

  if (!sessionId) return { error: "잘못된 요청입니다." };
  if (!scheduledDate) return { error: "예정일을 선택하거나 입력하세요." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_session_schedule", {
    p_session_id: sessionId,
    p_scheduled_date: scheduledDate,
    p_time_slot: timeSlot || null,
  });

  if (error) return { error: error.message };

  revalidatePath(`/staff/assignments/${sessionId}`);
  revalidatePath("/staff/assignments");
  return { ok: "예정일을 확정하고 추천 후보를 계산했습니다." };
}

/** 후보 3명 중 1명 선택 → 임시배정 생성 */
export async function selectProvisional(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { account } = await requireRole("staff");

  const sessionId = String(formData.get("session_id") ?? "");
  const instructorId = String(formData.get("instructor_id") ?? "");
  const candidateId = String(formData.get("candidate_id") ?? "");

  if (!sessionId || !instructorId || !candidateId) {
    return { error: "잘못된 요청입니다." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("assign_provisional", {
    p_session_id: sessionId,
    p_instructor_id: instructorId,
    p_candidate_id: candidateId,
    p_assigned_by: account.display_name ?? "담당자",
  });

  if (error) return { error: error.message };

  revalidatePath(`/staff/assignments/${sessionId}`);
  revalidatePath("/staff/assignments");
  redirect("/staff/assignments?assigned=1");
}

/** 최종확정 목록에서 한 건 선택 → 후보 재계산 후 상세로 이동 */
export async function startFinalConfirm(formData: FormData): Promise<void> {
  await requireRole("staff");
  const assignmentId = String(formData.get("assignment_id") ?? "");
  if (!assignmentId) redirect("/staff/assignments/final");

  const supabase = await createClient();
  const { data: assignment } = await supabase
    .from("assignments")
    .select("session_id, assignment_type")
    .eq("id", assignmentId)
    .maybeSingle<{ session_id: string; assignment_type: string }>();

  if (assignment?.assignment_type === "provisional") {
    await supabase.rpc("generate_assignment_candidates", {
      p_session_id: assignment.session_id,
    });
  }

  revalidatePath(`/staff/assignments/final/${assignmentId}`);
  redirect(`/staff/assignments/final/${assignmentId}`);
}

/** 최종확정 — 유지 또는 강사 변경 */
export async function confirmFinal(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { account } = await requireRole("staff");

  const assignmentId = String(formData.get("assignment_id") ?? "");
  const instructorId = String(formData.get("instructor_id") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();

  if (!assignmentId || !instructorId) return { error: "잘못된 요청입니다." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("confirm_assignment", {
    p_assignment_id: assignmentId,
    p_instructor_id: instructorId,
    p_changed_by: account.display_name ?? "담당자",
    p_reason: reason || null,
  });

  if (error) return { error: error.message };

  revalidatePath(`/staff/assignments/final/${assignmentId}`);
  revalidatePath("/staff/assignments/final");
  redirect("/staff/assignments/final?confirmed=1");
}
