"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSchoolContext } from "@/lib/auth";
import {
  parseRequestItems,
  type RequestItemInput,
} from "@/lib/session-request";
import {
  AUTO_APPROVE_REVIEWER,
  collectPrimaryDates,
  findScheduleOverlaps,
} from "@/lib/schedule-overlap";

export interface RequestFormState {
  error?: string;
}

/**
 * 공용 저장 — 학교 본인(#002) / 관리자 대리입력(#008·#009) 공통.
 *
 * 작업지시서: "학교 신청서 제출 즉시 스케줄 반영" — 신청서의 모든 항목에
 * 희망일자가 있고(미정 항목 없음), 그 날짜들이 다른 학교의 기존 일정과
 * 하나도 겹치지 않으면 담당자 승인 없이 바로 자동승인해 class_sessions
 * (미배정)를 생성한다. 하나라도 날짜 미정이거나 겹치면 기존과 동일하게
 * '제출됨' 상태로 남겨 담당자가 검토하게 한다(겹침 정보는 신청 목록/상세
 * 화면에서 findScheduleOverlaps 로 다시 계산해 보여줌).
 */
export async function saveRequestWithItems(opts: {
  schoolId: string;
  submittedBy: string;
  teacherName: string;
  proxyNote?: string;
  items: RequestItemInput[];
}): Promise<{ error?: string; requestId?: string; autoApproved?: boolean }> {
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

  // 자동승인 판단 — 모든 항목에 희망일자가 있고 다른 학교 일정과 안 겹치면
  // 즉시 승인(실패해도 신청 자체는 이미 저장됐으니 조용히 수동검토로 남김)
  const { allDatesKnown, dates } = collectPrimaryDates(opts.items);
  let autoApproved = false;
  if (allDatesKnown) {
    const overlaps = await findScheduleOverlaps(supabase, opts.schoolId, dates);
    if (overlaps.length === 0) {
      // approve_session_request 는 class_sessions 에 INSERT 하는데, 그
      // 테이블 RLS 는 staff 전용이라 학교 계정(RLS 컨텍스트)으로는 실행이
      // 막힌다. 여기서는 이미 위에서 opts.schoolId 소유의 신청서(header.id)
      // 라는 게 검증됐으므로, 이 한 건의 승인만 서비스 롤로 우회 실행한다.
      const admin = createAdminClient();
      const { error: approveErr } = await admin.rpc("approve_session_request", {
        p_request_id: header.id,
        p_reviewer: AUTO_APPROVE_REVIEWER,
      });
      autoApproved = !approveErr;
    }
  }

  return { requestId: header.id, autoApproved };
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
  redirect(res.autoApproved ? "/school?approved=1" : "/school");
}
