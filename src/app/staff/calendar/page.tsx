import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type {
  CalendarSession,
  InstructorWithSpecialties,
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
  school: { name: string } | null;
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

  const days = view === "week" ? weekGrid(anchor) : monthGrid(year, month);
  const rangeStart = days[0];
  const rangeEnd = days[days.length - 1];

  const supabase = await createClient();

  const [{ data: rawSessions, error }, { data: rawInstructors }] =
    await Promise.all([
      supabase
        .from("class_sessions")
        .select(
          "id,scheduled_date,time_slot,session_status, school:schools(name), program:programs(name), assignments(instructor_id,assignment_type, instructor:instructors(name))",
        )
        .gte("scheduled_date", rangeStart)
        .lte("scheduled_date", rangeEnd)
        .in("session_status", ["provisional", "confirmed", "completed"])
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
    ]);

  const sessions: CalendarSession[] = (rawSessions ?? []).map((r) => {
    const a = r.assignments;
    return {
      id: r.id,
      scheduled_date: r.scheduled_date,
      time_slot: r.time_slot,
      session_status: r.session_status,
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
        instructors={instructors}
      />
    </div>
  );
}
