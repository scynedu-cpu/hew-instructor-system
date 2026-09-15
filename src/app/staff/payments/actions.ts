"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";

export interface RateState {
  error?: string;
  ok?: string;
}

export async function setRate(
  _prev: RateState,
  formData: FormData,
): Promise<RateState> {
  const { account } = await requireRole("staff");

  const rate = Number(formData.get("rate"));
  const effectiveFrom = String(formData.get("effective_from") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();
  const programId = String(formData.get("program_id") ?? "").trim() || null;

  if (!Number.isFinite(rate) || rate < 0) {
    return { error: "단가를 올바르게 입력하세요." };
  }
  if (!effectiveFrom) return { error: "적용 시작일을 입력하세요." };

  const supabase = await createClient();
  const { error } = await supabase.from("payment_rate_settings").insert({
    rate,
    effective_from: effectiveFrom,
    program_id: programId,
    note: note || null,
    created_by: account.display_name ?? "담당자",
  });
  if (error) return { error: error.message };

  revalidatePath("/staff/payments");
  return { ok: "새 단가를 등록했습니다. 기존 정산 기록은 그대로 유지됩니다." };
}

export interface SettleState {
  error?: string;
  ok?: string;
}

export async function settlePeriod(
  _prev: SettleState,
  formData: FormData,
): Promise<SettleState> {
  const { account } = await requireRole("staff");

  const start = String(formData.get("period_start") ?? "").trim();
  const end = String(formData.get("period_end") ?? "").trim();
  if (!start || !end) return { error: "정산 기간을 지정하세요." };
  if (end < start) return { error: "종료일이 시작일보다 빠릅니다." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("settle_lecture_payments", {
    p_period_start: start,
    p_period_end: end,
    p_settled_by: account.display_name ?? "담당자",
  });
  if (error) return { error: error.message };

  const created = typeof data === "number" ? data : 0;
  revalidatePath("/staff/payments");
  return {
    ok:
      created === 0
        ? "이 기간에 새로 정산할 완료 강의가 없습니다."
        : `${created}명분 정산 내역을 생성했습니다.`,
  };
}

export interface PreviewRow {
  instructor_id: string;
  instructor_name: string;
  quantity: number;
  total_hours: number;
  estimated_amount: number;
}

export async function previewSettle(
  start: string,
  end: string,
): Promise<{ rows?: PreviewRow[]; error?: string }> {
  await requireRole("staff");
  if (!start || !end) return { error: "기간을 지정하세요." };
  if (end < start) return { error: "종료일이 시작일보다 빠릅니다." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("preview_lecture_payments", {
    p_period_start: start,
    p_period_end: end,
  });
  if (error) return { error: error.message };

  const rows = (
    (data ?? []) as {
      instructor_id: string;
      instructor_name: string;
      quantity: number;
      total_hours: number | string | null;
      estimated_amount: number | string | null;
    }[]
  ).map((r) => ({
    instructor_id: r.instructor_id,
    instructor_name: r.instructor_name,
    quantity: Number(r.quantity),
    total_hours: Number(r.total_hours ?? 0),
    estimated_amount: Number(r.estimated_amount ?? 0),
  }));
  return { rows };
}

export async function markPaid(paymentId: string): Promise<{ error?: string }> {
  const { account } = await requireRole("staff");
  if (!paymentId) return { error: "잘못된 요청입니다." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_payment_paid", {
    p_payment_id: paymentId,
    p_paid_by: account.display_name ?? "담당자",
  });
  if (error) return { error: error.message };

  revalidatePath("/staff/payments");
  revalidatePath(`/staff/payments/${paymentId}`);
  return {};
}
