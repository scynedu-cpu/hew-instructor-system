"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSchoolContext } from "@/lib/auth";
import {
  parseRequestItems,
  type RequestItemInput,
} from "@/lib/session-request";

export interface RequestFormState {
  error?: string;
}

/** 공용 저장 — 학교 본인(#002) / 관리자 대리입력(#008·#009) 공통 */
export async function saveRequestWithItems(opts: {
  schoolId: string;
  submittedBy: string;
  teacherName: string;
  proxyNote?: string;
  items: RequestItemInput[];
}): Promise<{ error?: string; requestId?: string }> {
  if (!opts.schoolId) return { error: "학교가 지정되지 않았습니다." };
  if (opts.items.length === 0) return { error: "프로그램을 1개 이상 선택하세요." };
  for (const it of opts.items) {
    if (!it.dates_tbd && it.requested_dates.length === 0) {
      return {
        error:
          "각 프로그램은 희망일자를 1개 이상 입력하거나 '일자 미정'을 선택해야 합니다.",
      };
    }
  }

  const supabase = await createClient();
  const { data: header, error: headErr } = await supabase
    .from("session_requests")
    .insert({
      school_id: opts.schoolId,
      academic_year: new Date().getFullYear(),
      request_status: "submitted",
      submitted_by: opts.submittedBy,
      teacher_name: opts.teacherName || null,
      proxy_note: opts.proxyNote || null,
    })
    .select("id")
    .single();

  if (headErr || !header) {
    return { error: `제출 실패: ${headErr?.message ?? ""}` };
  }

  const { error: itemErr } = await supabase.from("session_request_items").insert(
    opts.items.map((it) => ({
      request_id: header.id,
      program_id: it.program_id,
      requested_dates: it.dates_tbd ? null : it.requested_dates,
      dates_tbd: it.dates_tbd,
      preferred_time_slot: it.preferred_time_slot || null,
      expected_student_count: it.expected_student_count || null,
      note: it.note || null,
    })),
  );

  if (itemErr) {
    await supabase.from("session_requests").delete().eq("id", header.id);
    return { error: `제출 실패: ${itemErr.message}` };
  }

  return { requestId: header.id };
}

export async function submitRequest(
  _prev: RequestFormState,
  formData: FormData,
): Promise<RequestFormState> {
  const ctx = await getSchoolContext();
  if (ctx.readOnly) {
    return { error: "담당자 미리보기 모드에서는 신청서를 제출할 수 없습니다." };
  }

  const teacherName = String(formData.get("teacher_name") ?? "").trim();
  const items = parseRequestItems(String(formData.get("items_json") ?? "[]"));

  const res = await saveRequestWithItems({
    schoolId: ctx.schoolId,
    submittedBy: ctx.viewer.account.display_name ?? "학교 담당교사",
    teacherName: teacherName || ctx.viewer.account.display_name || "",
    items,
  });
  if (res.error) return { error: res.error };

  revalidatePath("/school");
  redirect("/school");
}
