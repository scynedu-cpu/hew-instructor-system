"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import type {
  AssignmentHistoryRow,
  ScheduleHistoryRow,
  SurveyQuestion,
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

/**
 * 세션별 설문 QR — 작업지시서 #013 / #013-1(문항 그룹화·확정 방식으로 확장).
 * survey_links 는 session_id 에 UNIQUE 라 세션당 1개만 존재. 처음 생성할
 * 때는 문항 선택(공통+그룹 자동조합, 제외만 가능) → confirmSurveyLink() 로
 * 확정해야 링크가 만들어지고, 이후엔 getSurveyLink() 로 그대로 재사용한다.
 * 반환하는 url 은 NEXT_PUBLIC_SITE_URL 이 설정돼 있으면 절대경로, 아니면
 * 상대경로(/survey/{token})만 주고 클라이언트에서 현재 origin 을 붙인다.
 */
export interface SurveyLinkResult {
  token?: string;
  url?: string;
  error?: string;
}

function surveyUrl(token: string): string {
  const site = (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/+$/, "");
  return site ? `${site}/survey/${token}` : `/survey/${token}`;
}

/**
 * 이미 확정된 링크가 있으면 그대로 반환(재선택 불가 — 작업지시서 #013-1
 * 3-3 "한 번 확정되면 고정"). 없으면 token 없이 반환해 호출부(QR 다이얼로그)가
 * 문항 선택 화면을 띄우게 한다.
 */
export async function getSurveyLink(sessionId: string): Promise<SurveyLinkResult> {
  await requireRole("staff");
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("survey_links")
    .select("token")
    .eq("session_id", sessionId)
    .maybeSingle<{ token: string }>();
  if (error) return { error: error.message };
  if (!data) return {};
  return { token: data.token, url: surveyUrl(data.token) };
}

/**
 * QR 최초 생성 시 미리보기에 띄울 문항 후보 — 그 세션 프로그램의
 * survey_group 을 기준으로 공통 문항 전체 + 해당 그룹 문항 전체(활성만)를
 * scope, display_order 순으로 반환. 담당자는 이 중 제외만 할 수 있다.
 */
export async function getSuggestedSurveyQuestions(
  sessionId: string,
): Promise<{ questions?: SurveyQuestion[]; error?: string }> {
  await requireRole("staff");
  const supabase = await createClient();

  const { data: session, error: sessErr } = await supabase
    .from("class_sessions")
    .select("program:programs(survey_group)")
    .eq("id", sessionId)
    .maybeSingle<{ program: { survey_group: string } | null }>();
  if (sessErr) return { error: sessErr.message };
  const group = session?.program?.survey_group;
  if (!group) return { error: "이 세션의 프로그램에 설문 그룹이 지정되어 있지 않습니다." };

  const { data, error } = await supabase
    .from("survey_questions")
    .select("*")
    .eq("is_active", true)
    .or(`scope.eq.common,survey_group.eq.${group}`)
    .order("scope", { ascending: true }) // 'common' < 'group' 알파벳순 — 공통이 먼저
    .order("display_order", { ascending: true })
    .returns<SurveyQuestion[]>();
  if (error) return { error: error.message };
  return { questions: data ?? [] };
}

/**
 * 문항 선택 확정 — survey_links 1건 생성 + survey_link_questions 로 그
 * 시점의 선택 결과를 고정 저장한다. 이후 survey_questions 나
 * programs.survey_group 이 바뀌어도 이 세션의 구성은 그대로 유지된다.
 */
export async function confirmSurveyLink(
  sessionId: string,
  questionIds: string[],
): Promise<SurveyLinkResult> {
  const { account } = await requireRole("staff");
  if (questionIds.length === 0) return { error: "문항을 1개 이상 선택하세요." };

  const supabase = await createClient();

  const token = crypto.randomUUID();
  const { data: link, error: insErr } = await supabase
    .from("survey_links")
    .insert({
      session_id: sessionId,
      token,
      created_by: account.display_name ?? "담당자",
    })
    .select("id, token")
    .single<{ id: string; token: string }>();

  if (insErr) {
    // session_id UNIQUE 라 동시 클릭 등으로 이미 생성된 경우 — 기존 것 재조회
    if (insErr.code === "23505") {
      const { data: retry } = await supabase
        .from("survey_links")
        .select("token")
        .eq("session_id", sessionId)
        .maybeSingle<{ token: string }>();
      if (retry?.token) return { token: retry.token, url: surveyUrl(retry.token) };
    }
    return { error: insErr.message };
  }

  const rows = questionIds.map((question_id, idx) => ({
    survey_link_id: link.id,
    question_id,
    display_order: idx + 1,
  }));
  const { error: qErr } = await supabase.from("survey_link_questions").insert(rows);
  if (qErr) {
    await supabase.from("survey_links").delete().eq("id", link.id);
    return { error: qErr.message };
  }

  return { token: link.token, url: surveyUrl(link.token) };
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
