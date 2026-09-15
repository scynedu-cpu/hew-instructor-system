// 신청서 자동승인(제출 즉시 스케줄 반영) 판단에 쓰는 "다른 학교 일정 겹침" 검사.
// 서버 전용 — session_requests 제출 처리(school/actions.ts)와 신청 목록/상세
// 화면(staff/requests)의 겹침 경고 표시 양쪽에서 재사용한다.
//
// 판정 기준(작업지시서 논의 결과): 시간대는 학교마다 자유 텍스트라 정확 비교가
// 어려우므로, 같은 날짜면 시간대와 무관하게 "겹침"으로 본다(보수적 기준).

import type { SupabaseClient } from "@supabase/supabase-js";
import { programLabel } from "@/lib/types";

/** 자동승인 시 reviewed_by 에 남기는 표시 — 담당자 수동 승인과 구분 */
export const AUTO_APPROVE_REVIEWER = "시스템(자동승인)";

export interface ScheduleOverlapMatch {
  date: string;
  schoolName: string;
  programLabel: string;
}

interface ItemDateInput {
  dates_tbd: boolean;
  requested_dates: string[] | null;
}

/**
 * 신청서 항목들의 "대표 희망일자"(각 항목의 첫 희망일자)를 모은다.
 * 날짜 미정 항목이 하나라도 있으면 비교 자체가 불가능하므로 allDatesKnown=false.
 */
export function collectPrimaryDates(items: ItemDateInput[]): {
  allDatesKnown: boolean;
  dates: string[];
} {
  const dates: string[] = [];
  for (const it of items) {
    const first = !it.dates_tbd ? it.requested_dates?.[0] : undefined;
    if (!first) return { allDatesKnown: false, dates: [] };
    dates.push(first);
  }
  return { allDatesKnown: true, dates: [...new Set(dates)] };
}

/**
 * 주어진 날짜들에 대해 "다른 학교"(excludeSchoolId 제외)의 기존 수업 일정
 * (class_sessions, 취소 제외)이 이미 있는지 찾는다.
 */
export async function findScheduleOverlaps(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  excludeSchoolId: string,
  dates: string[],
): Promise<ScheduleOverlapMatch[]> {
  if (dates.length === 0) return [];

  const { data } = await supabase
    .from("class_sessions")
    .select(
      "scheduled_date, school:schools(name), program:programs(name,category,sub_program)",
    )
    .in("scheduled_date", dates)
    .neq("school_id", excludeSchoolId)
    .neq("session_status", "cancelled")
    .returns<
      {
        scheduled_date: string;
        school: { name: string } | null;
        program: { name: string; category: string | null; sub_program: string | null } | null;
      }[]
    >();

  return (data ?? []).map((row) => ({
    date: row.scheduled_date,
    schoolName: row.school?.name ?? "다른 학교",
    programLabel: row.program ? programLabel(row.program) : "프로그램",
  }));
}
