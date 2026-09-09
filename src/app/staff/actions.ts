"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";

export interface ReviewState {
  error?: string;
  ok?: string;
}

export async function startReviewing(requestId: string): Promise<ReviewState> {
  await requireRole("staff");
  const supabase = await createClient();
  const { error } = await supabase
    .from("session_requests")
    .update({ request_status: "reviewing" })
    .eq("id", requestId)
    .eq("request_status", "submitted");

  if (error) return { error: error.message };
  revalidatePath(`/staff/requests/${requestId}`);
  revalidatePath("/staff/requests");
  return { ok: "검토중으로 변경했습니다." };
}

export async function approveRequest(
  _prev: ReviewState,
  formData: FormData,
): Promise<ReviewState> {
  const { account } = await requireRole("staff");
  const requestId = String(formData.get("request_id") ?? "");
  if (!requestId) return { error: "잘못된 요청입니다." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("approve_session_request", {
    p_request_id: requestId,
    p_reviewer: account.display_name ?? "담당자",
  });

  if (error) return { error: error.message };

  revalidatePath(`/staff/requests/${requestId}`);
  revalidatePath("/staff/requests");
  return { ok: "승인 완료 — 수업 일정이 생성되었습니다." };
}

export async function rejectRequest(
  _prev: ReviewState,
  formData: FormData,
): Promise<ReviewState> {
  const { account } = await requireRole("staff");
  const requestId = String(formData.get("request_id") ?? "");
  const reason = String(formData.get("rejection_reason") ?? "").trim();
  if (!requestId) return { error: "잘못된 요청입니다." };
  if (!reason) return { error: "반려 사유는 필수입니다." };

  const supabase = await createClient();

  // 이미 처리된 건인지 확인
  const { data: existing } = await supabase
    .from("session_requests")
    .select("request_status")
    .eq("id", requestId)
    .maybeSingle<{ request_status: string }>();

  if (!existing) return { error: "신청서를 찾을 수 없습니다." };
  if (existing.request_status === "approved" || existing.request_status === "rejected") {
    return { error: `이미 처리된 신청입니다 (현재 상태: ${existing.request_status}).` };
  }

  const { error } = await supabase
    .from("session_requests")
    .update({
      request_status: "rejected",
      rejection_reason: reason,
      reviewed_by: account.display_name ?? "담당자",
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", requestId);

  if (error) return { error: error.message };

  revalidatePath(`/staff/requests/${requestId}`);
  revalidatePath("/staff/requests");
  return { ok: "반려 처리했습니다." };
}
