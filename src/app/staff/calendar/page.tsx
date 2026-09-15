import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type {
  CalendarSession,
  InstructorWithSpecialties,
  PendingCalendarItem,
  RequestStatus,
} from "@/lib/types";
import {
  monthGrid,
  weekGrid,
  todayYmd,
  parseYmd,
} from "@/lib/calendar";
import { CalendarClient } from "./calendar-client";

type Row = {
  id: string;
  scheduled_date: string;
  time_slot: string | null;
  session_status: CalendarSession["session_status"];
  school: { id: string; name: string } | null;
  program: { name: string } | null;
  // assignments.session_id 가 UNIQUE 라 PostgREST 는 1:1 로 보고 객체(또는 null)로 임베드한다
  assignments: {
    instructor_id: string;
    assignment_type: CalendarSession["assignment_type"];
    instructor: { name: string } | null;
  } | null;
};

export default async function StaffCalendarPage({
  searchParams,
}: PageProps<"/staff/calendar">) {
  await requireRole("staff");
  const sp = await searchParams;

  const view = sp.view === "week" ? "week" : "month";
  const today = todayYmd();
  const t = parseYmd(today);
  const year = Number(sp.y) || t.y;
  const month = Number(sp.m) || t.m;
  const anchor =
    typeof sp.d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.d) ? sp.d : today;
  // 작업지시서 #018 — 운영 대시보드의 "완료 처리하기" 버튼이 특정 세션을
  // 바로 열어볼 수 있도록 하는 딥링크(?sessionId=...)
  const initialSelectedId = typeof sp.sessionId === "string" ? sp.sessionId : null;

  const days = view === "week" ? weekGrid(anchor) : monthGrid(year, month);
  const rangeStart = days[0];
  const rangeEnd = days[days.length - 1];

  const supabase = await createClient();

  const [{ data: rawSessions, error }, { data: rawInstructors }, { data: rawPendingRequests }] =
    await Promise.all([
      supabase
        .from("class_sessions")
        .select(
          "id,scheduled_date,time_slot,session_status, school:schools(id,name), program:programs(name), assignments(instructor_id,assignment_type, instructor:instructors(name))",
        )
        .gte("scheduled_date", rangeStart)
        .lte("scheduled_date", rangeEnd)
        // 'unassigned' 포함 — 학교 신청 자동승인(#019)으로 강사 배정 전에도
        // 예정일이 잡힌 세션이 바로 생길 수 있어, 캘린더에도 즉시 노출한다.
        .in("session_status", ["unassigned", "provisional", "confirmed", "completed"])
        .returns<Row[]>(),
      supabase
        .from("instructors")
        .select("id,name,status,rating_avg, instructor_specialties(specialty)")
        .eq("status", "active")
        .order("name")
        .returns<
          {
            id: string;
            name: string;
            status: "active" | "inactive";
            rating_avg: number;
            instructor_specialties: { specialty: string }[];
          }[]
        >(),
      // 아직 승인 안 된(제출됨/검토중) 신청서 — 담당자가 승인하기 전에
      // 같은 날짜 다른 학교 일정과 겹치는지 캘린더에서 미리 볼 수 있게 함.
      // 날짜별 필터가 어려운 배열 컬럼(requested_dates)이라 우선 전체를
      // 가져와 아래에서 대표 희망일자가 조회 범위 안인 것만 추린다.
      supabase
        .from("session_requests")
        .select(
          "id,request_status,school:schools(id,name), session_request_items(id,requested_dates,dates_tbd,preferred_time_slot,expected_student_count,note, program:programs(name))",
        )
        .in("request_status", ["submitted", "reviewing"])
        .returns<
          {
            id: string;
            request_status: RequestStatus;
            school: { id: string; name: string } | null;
            session_request_items: {
              id: string;
              requested_dates: string[] | null;
              dates_tbd: boolean;
              preferred_time_slot: string | null;
              expected_student_count: string | null;
              note: string | null;
              program: { name: string } | null;
            }[];
          }[]
        >(),
    ]);

  const sessions: CalendarSession[] = (rawSessions ?? []).map((r) => {
    const a = r.assignments;
    return {
      id: r.id,
      scheduled_date: r.scheduled_date,
      time_slot: r.time_slot,
      session_status: r.session_status,
      school_id: r.school?.id ?? null,
      school_name: r.school?.name ?? "-",
      program_name: r.program?.name ?? "-",
      instructor_id: a?.instructor_id ?? null,
      instructor_name: a?.instructor?.name ?? null,
      assignment_type: a?.assignment_type ?? null,
    };
  });

  const instructors: InstructorWithSpecialties[] = (rawInstructors ?? []).map(
    (i) => ({
      id: i.id,
      name: i.name,
      status: i.status,
      rating_avg: i.rating_avg,
      specialties: (i.instructor_specialties ?? []).map((s) => s.specialty),
    }),
  );

  const pendingItems: PendingCalendarItem[] = [];
  for (const r of rawPendingRequests ?? []) {
    if (!r.school) continue;
    for (const it of r.session_request_items ?? []) {
      // 대표 희망일자(첫 번째) 기준 — approve_session_request/겹침 판정과 동일 규칙.
      // 날짜 미정 항목은 표시할 날짜가 없으므로 제외(신청 관리 화면에서만 확인 가능).
      const date = !it.dates_tbd ? it.requested_dates?.[0] : undefined;
      if (!date || date < rangeStart || date > rangeEnd) continue;
      pendingItems.push({
        itemId: it.id,
        requestId: r.id,
        scheduled_date: date,
        time_slot: it.preferred_time_slot,
        school_id: r.school.id,
        school_name: r.school.name,
        program_name: it.program?.name ?? "-",
        request_status: r.request_status,
        student_count: it.expected_student_count,
        note: it.note,
      });
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold">수업 캘린더</h1>
      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error.message}
        </p>
      )}
      <CalendarClient
        view={view}
        year={year}
        month={month}
        anchor={anchor}
        days={days}
        sessions={sessions}
        pendingItems={pendingItems}
        instructors={instructors}
        initialSelectedId={initialSelectedId}
      />
    </div>
  );
}
