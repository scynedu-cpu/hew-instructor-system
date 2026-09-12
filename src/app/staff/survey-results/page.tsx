import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Program, School } from "@/lib/types";
import { programLabel } from "@/lib/types";

interface SessionRow {
  id: string;
  scheduled_date: string | null;
  school: { name: string } | null;
  program: { name: string; category: string | null; sub_program: string | null } | null;
}

function sessionProgramLabel(p: SessionRow["program"]): string {
  if (!p) return "-";
  const cat = p.category ?? p.name;
  return p.sub_program ? `${cat} · ${p.sub_program}` : cat;
}

export default async function SurveyResultsPage({
  searchParams,
}: PageProps<"/staff/survey-results">) {
  await requireRole("staff");
  const { school, program, from, to } = await searchParams;
  const schoolFilter = typeof school === "string" ? school : "";
  const programFilter = typeof program === "string" ? program : "";
  const fromFilter = typeof from === "string" ? from : "";
  const toFilter = typeof to === "string" ? to : "";

  const supabase = await createClient();

  const [{ data: schools }, { data: programs }] = await Promise.all([
    supabase.from("schools").select("id,name,level").order("name").returns<School[]>(),
    supabase
      .from("programs")
      .select("id,name,category,sub_program")
      .order("category", { ascending: true })
      .order("sub_program", { ascending: true, nullsFirst: true })
      .returns<Program[]>(),
  ]);

  let query = supabase
    .from("class_sessions")
    .select(
      "id, scheduled_date, school:schools(name), program:programs(name,category,sub_program)",
    )
    .order("scheduled_date", { ascending: false, nullsFirst: false });

  if (schoolFilter) query = query.eq("school_id", schoolFilter);
  if (programFilter) query = query.eq("program_id", programFilter);
  if (fromFilter) query = query.gte("scheduled_date", fromFilter);
  if (toFilter) query = query.lte("scheduled_date", toFilter);

  const { data: sessions, error } = await query.returns<SessionRow[]>();

  // 응답 수는 화면 진입 시마다 실시간 집계(#014 지시서 2-3 — 별도 캐싱 없음)
  const { data: responses } = await supabase
    .from("survey_responses")
    .select("session_id")
    .returns<{ session_id: string }[]>();

  const countMap = new Map<string, number>();
  for (const r of responses ?? []) {
    countMap.set(r.session_id, (countMap.get(r.session_id) ?? 0) + 1);
  }

  const rows = sessions ?? [];

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-bold">만족도 설문 결과</h1>
        <p className="mt-1 text-sm text-muted">
          세션(강의)별로 QR 설문 응답 수를 확인하고, 상세에서 문항별 집계를
          볼 수 있습니다.
        </p>
      </div>

      <form
        action="/staff/survey-results"
        className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface p-4"
      >
        <label className="flex flex-col gap-1 text-sm font-medium">
          학교
          <select
            name="school"
            defaultValue={schoolFilter}
            className="w-40 rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand"
          >
            <option value="">전체</option>
            {(schools ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm font-medium">
          프로그램
          <select
            name="program"
            defaultValue={programFilter}
            className="w-48 rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand"
          >
            <option value="">전체</option>
            {(programs ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {programLabel(p)}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm font-medium">
          시작일
          <input
            type="date"
            name="from"
            defaultValue={fromFilter}
            className="rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm font-medium">
          종료일
          <input
            type="date"
            name="to"
            defaultValue={toFilter}
            className="rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand"
          />
        </label>

        <button
          type="submit"
          className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-brand-fg hover:bg-brand-hover"
        >
          조회
        </button>
        {(schoolFilter || programFilter || fromFilter || toFilter) && (
          <Link
            href="/staff/survey-results"
            className="text-sm text-muted hover:underline"
          >
            필터 초기화
          </Link>
        )}
      </form>

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error.message}
        </p>
      )}

      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border bg-surface px-4 py-10 text-center text-sm text-muted">
          조건에 맞는 세션이 없습니다.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-zinc-50 text-left text-xs text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">학교</th>
                <th className="px-3 py-2 font-medium">프로그램</th>
                <th className="px-3 py-2 font-medium">강의일자</th>
                <th className="px-3 py-2 font-medium">응답 수</th>
                <th className="px-3 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((s) => {
                const count = countMap.get(s.id) ?? 0;
                return (
                  <tr key={s.id} className="hover:bg-zinc-50/60">
                    <td className="px-3 py-2">{s.school?.name ?? "-"}</td>
                    <td className="px-3 py-2 text-xs">
                      {sessionProgramLabel(s.program)}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted">
                      {s.scheduled_date ?? "미정"}
                    </td>
                    <td className="px-3 py-2">
                      {count > 0 ? (
                        <span className="font-semibold">{count}건</span>
                      ) : (
                        <span className="text-muted">응답 없음</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Link
                        href={`/staff/survey-results/${s.id}`}
                        className="font-medium text-link hover:underline"
                      >
                        상세
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
