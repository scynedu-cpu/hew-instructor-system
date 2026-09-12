"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import type {
  AssignmentHistoryRow,
  ScheduleHistoryRow,
  TimeConflict,
} from "@/lib/types";

export interface CalActionResult {
  error?: string;
  ok?: string;
}

async function conflictsFor(
  instructorId: string,
  date: string,
  timeSlot: string | null,
  excludeSessionId: string,
): Promise<TimeConflict[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("instructor_time_conflicts", {
    p_instructor_id: instructorId,
    p_date: date,
    p_time_slot: timeSlot,
    p_exclude_session_id: excludeSessionId,
  });
  return (data ?? []) as TimeConflict[];
}

/** 드래그/편집으로 옮기려는 (날짜,시간)에 현재 배정 강사의 다른 배정이 있는지 */
export async function checkRescheduleConflict(
  sessionId: string,
  newDate: string,
  newTimeSlot: string | null,
): Promise<TimeConflict[]> {
  await requireRole("staff");
  const supabase = await createClient();
  const { data: assignment } = await supabase
    .from("assignments")
    .select("instructor_id")
    .eq("session_id", sessionId)
    .maybeSingle<{ instructor_id: string }>();

  if (!assignment) return [];
  return conflictsFor(assignment.instructor_id, newDate, newTimeSlot, sessionId);
}

export async function reschedule(
  sessionId: string,
  newDate: string,
  newTimeSlot: string | null,
  reason?: string,
): Promise<CalActionResult> {
  const { account } = await requireRole("staff");
  if (!newDate) return { error: "이동할 날짜가 없습니다." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("reschedule_session", {
    p_session_id: sessionId,
    p_new_date: newDate,
    p_new_time_slot: newTimeSlot,
    p_changed_by: account.display_name ?? "담당자",
    p_reason: reason || null,
  });

  if (error) return { error: error.message };
  revalidatePath("/staff/calendar");
  return { ok: "일정을 변경했습니다." };
}

/** 교체하려는 강사가 이 세션의 (날짜,시간)에 다른 배정이 있는지 */
export async function checkSwapConflict(
  sessionId: string,
  newInstructorId: string,
): Promise<TimeConflict[]> {
  await requireRole("staff");
  const supabase = await createClient();
  const { data: session } = await supabase
    .from("class_sessions")
    .select("scheduled_date,time_slot")
    .eq("id", sessionId)
    .maybeSingle<{ scheduled_date: string | null; time_slot: string | null }>();

  if (!session?.scheduled_date) return [];
  return conflictsFor(
    newInstructorId,
    session.scheduled_date,
    session.time_slot,
    sessionId,
  );
}

export async function swapInstructor(
  sessionId: string,
  newInstructorId: string,
  reason?: string,
): Promise<CalActionResult> {
  const { account } = await requireRole("staff");
  if (!newInstructorId) return { error: "강사를 선택하세요." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("swap_session_instructor", {
    p_session_id: sessionId,
    p_new_instructor_id: newInstructorId,
    p_changed_by: account.display_name ?? "담당자",
    p_reason: reason || null,
  });

  if (error) return { error: error.message };
  revalidatePath("/staff/calendar");
  return { ok: "강사를 교체했습니다." };
}

const LECTURE_CONFIRMATIONS_BUCKET = "lecture-confirmations";

function safeFileName(name: string): string {
  // Supabase Storage 키는 ASCII 안전문자만 — 한글 등은 '_' 로 치환
  const cleaned = name.replace(/[^A-Za-z0-9._-]/g, "_").replace(/_+/g, "_");
  return cleaned.slice(-60) || "file";
}

/**
 * 강의 완료 처리 — 작업지시서 #012.
 * confirmed 세션에 실제 강의일/시간 + 강의확인서를 남기고
 * lecture_confirmations 1건 생성 + class_sessions.session_status='completed'.
 * 이 데이터가 있어야 #007 정산 집계가 대상으로 잡는다.
 */
export async function completeSession(formData: FormData): Promise<CalActionResult> {
  await requireRole("staff");

  const sessionId = String(formData.get("session_id") ?? "");
  const actualDate = String(formData.get("actual_date") ?? "").trim();
  const actualHoursRaw = String(formData.get("actual_hours") ?? "").trim();
  const file = formData.get("file");

  if (!sessionId) return { error: "잘못된 요청입니다." };
  if (!actualDate) return { error: "실제 강의일을 입력하세요." };
  const actualHours = Number(actualHoursRaw);
  if (!actualHoursRaw || !Number.isFinite(actualHours) || actualHours <= 0) {
    return { error: "실제 강의 시간을 입력하세요." };
  }
  if (!(file instanceof File) || file.size === 0) {
    return { error: "강의확인서 파일을 첨부하세요." };
  }
  if (file.size > 10 * 1024 * 1024) {
    return { error: "파일은 10MB 이하만 가능합니다." };
  }

  const supabase = await createClient();

  const { data: session } = await supabase
    .from("class_sessions")
    .select("session_status")
    .eq("id", sessionId)
    .maybeSingle<{ session_status: string }>();
  if (!session) return { error: "세션을 찾을 수 없습니다." };
  if (session.session_status !== "confirmed") {
    return { error: "최종확정(confirmed) 상태의 세션만 완료 처리할 수 있습니다." };
  }

  const { data: assignment } = await supabase
    .from("assignments")
    .select("id")
    .eq("session_id", sessionId)
    .maybeSingle<{ id: string }>();
  if (!assignment) return { error: "배정 정보를 찾을 수 없습니다." };

  const path = `${sessionId}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
  const { error: upErr } = await supabase.storage
    .from(LECTURE_CONFIRMATIONS_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (upErr) return { error: `업로드 실패: ${upErr.message}` };

  const { error: insErr } = await supabase.from("lecture_confirmations").insert({
    assignment_id: assignment.id,
    actual_date: actualDate,
    actual_hours: actualHours,
    file_url: path,
  });
  if (insErr) {
    await supabase.storage.from(LECTURE_CONFIRMATIONS_BUCKET).remove([path]);
    return { error: insErr.message };
  }

  const { error: updErr } = await supabase
    .from("class_sessions")
    .update({ session_status: "completed" })
    .eq("id", sessionId);
  if (updErr) return { error: updErr.message };

  revalidatePath("/staff/calendar");
  return { ok: "강의 완료 처리했습니다." };
}

export interface SessionHistory {
  schedule: ScheduleHistoryRow[];
  assignment: AssignmentHistoryRow[];
}

/** 카드 상세 — 해당 세션의 일정변경 / 강사변경 이력 */
export async function getSessionHistory(
  sessionId: string,
): Promise<SessionHistory> {
  await requireRole("staff");
  const supabase = await createClient();

  const { data: schedule } = await supabase
    .from("session_schedule_history")
    .select("*")
    .eq("session_id", sessionId)
    .order("changed_at", { ascending: true })
    .returns<ScheduleHistoryRow[]>();

  const { data: assignment } = await supabase
    .from("assignments")
    .select("id")
    .eq("session_id", sessionId)
    .maybeSingle<{ id: string }>();

  let assignmentHistory: AssignmentHistoryRow[] = [];
  if (assignment) {
    const { data } = await supabase
      .from("assignment_history")
      .select("*")
      .eq("assignment_id", assignment.id)
      .order("changed_at", { ascending: true })
      .returns<AssignmentHistoryRow[]>();
    assignmentHistory = data ?? [];
  }

  return { schedule: schedule ?? [], assignment: assignmentHistory };
}
