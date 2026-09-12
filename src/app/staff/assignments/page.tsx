import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ClassSessionWithRefs } from "@/lib/types";
import { AssignmentTabs } from "./tabs";

export default async function StaffAssignmentsPage({
  searchParams,
}: PageProps<"/staff/assignments">) {
  await requireRole("staff");
  const { assigned } = await searchParams;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("class_sessions")
    .select(
      "*, school:schools(id,name,level), program:programs(id,name,category), request_item:session_request_items(requested_dates,preferred_time_slot,dates_tbd)",
    )
    .eq("session_status", "unassigned")
    .order("created_at", { ascending: true })
    .returns<ClassSessionWithRefs[]>();

  const sessions = data ?? [];

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-xl font-bold">강사 배정</h1>
      <AssignmentTabs active="initial" />

      {assigned && (
        <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
          임시배정을 완료했습니다.
        </p>
      )}
      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error.message}
        </p>
      )}

      <div>
        <h2 className="mb-2 text-sm font-semibold text-muted">
          초기 배정 대기 (미배정 세션 {sessions.length}건)
        </h2>
        {sessions.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border bg-surface px-4 py-10 text-center text-sm text-muted">
            미배정 세션이 없습니다.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-zinc-50 text-left text-xs text-muted">
                <tr>
                  <th className="px-3 py-2 font-medium">학교</th>
                  <th className="px-3 py-2 font-medium">프로그램</th>
                  <th className="px-3 py-2 font-medium">필요 전문분야</th>
                  <th className="px-3 py-2 font-medium">예정일</th>
                  <th className="px-3 py-2 font-medium">희망일자</th>
                  <th className="px-3 py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sessions.map((s) => (
                  <tr key={s.id} className="hover:bg-zinc-50/60">
                    <td className="px-3 py-2">
                      {s.school?.name ?? "-"}
                      <span className="ml-1 text-xs text-muted">
                        {s.school?.level}
                      </span>
                    </td>
                    <td className="px-3 py-2">{s.program?.name ?? "-"}</td>
                    <td className="px-3 py-2">{s.required_specialty || "-"}</td>
                    <td className="px-3 py-2">
                      {s.scheduled_date ? (
                        s.scheduled_date
                      ) : (
                        <span className="text-amber-700">미확정</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted">
                      {(s.request_item?.requested_dates ?? []).join(", ") || "-"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Link
                        href={`/staff/assignments/${s.id}`}
                        className="font-medium text-link hover:underline"
                      >
                        배정 진행
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
