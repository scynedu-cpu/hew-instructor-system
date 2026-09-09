import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Assignment, ClassSessionWithRefs, Instructor } from "@/lib/types";
import { AssignmentTabs } from "../tabs";
import { startFinalConfirm } from "../actions";

export default async function FinalConfirmListPage({
  searchParams,
}: PageProps<"/staff/assignments/final">) {
  await requireRole("staff");
  const { confirmed } = await searchParams;
  const supabase = await createClient();

  const { data: pendingData, error } = await supabase.rpc(
    "assignments_pending_final_confirm",
  );
  const pending = (pendingData ?? []) as Assignment[];

  const sessionIds = [...new Set(pending.map((a) => a.session_id))];
  const instructorIds = [...new Set(pending.map((a) => a.instructor_id))];

  const [{ data: sessions }, { data: instructors }] = await Promise.all([
    sessionIds.length
      ? supabase
          .from("class_sessions")
          .select("*, school:schools(id,name,level), program:programs(id,name,category)")
          .in("id", sessionIds)
          .returns<ClassSessionWithRefs[]>()
      : Promise.resolve({ data: [] as ClassSessionWithRefs[] }),
    instructorIds.length
      ? supabase
          .from("instructors")
          .select("id,name")
          .in("id", instructorIds)
          .returns<Pick<Instructor, "id" | "name">[]>()
      : Promise.resolve({ data: [] as Pick<Instructor, "id" | "name">[] }),
  ]);

  const sessionById = new Map((sessions ?? []).map((s) => [s.id, s]));
  const instructorById = new Map((instructors ?? []).map((i) => [i.id, i]));

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-xl font-bold">강사 배정</h1>
      <AssignmentTabs active="final" />

      {confirmed && (
        <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
          최종확정을 완료했습니다.
        </p>
      )}
      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error.message}
        </p>
      )}

      <div>
        <h2 className="mb-2 text-sm font-semibold text-muted">
          최종확정 필요 (마감일 지난 임시배정 {pending.length}건)
        </h2>
        {pending.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border bg-surface px-4 py-10 text-center text-sm text-muted">
            최종확정이 필요한 건이 없습니다.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-zinc-50 text-left text-xs text-muted">
                <tr>
                  <th className="px-3 py-2 font-medium">학교</th>
                  <th className="px-3 py-2 font-medium">프로그램</th>
                  <th className="px-3 py-2 font-medium">예정일</th>
                  <th className="px-3 py-2 font-medium">시간대</th>
                  <th className="px-3 py-2 font-medium">임시배정 강사</th>
                  <th className="px-3 py-2 font-medium">마감일</th>
                  <th className="px-3 py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {pending.map((a) => {
                  const s = sessionById.get(a.session_id);
                  return (
                    <tr key={a.id} className="hover:bg-zinc-50/60">
                      <td className="px-3 py-2">
                        {s?.school?.name ?? "-"}
                        <span className="ml-1 text-xs text-muted">
                          {s?.school?.level}
                        </span>
                      </td>
                      <td className="px-3 py-2">{s?.program?.name ?? "-"}</td>
                      <td className="px-3 py-2">{s?.scheduled_date ?? "-"}</td>
                      <td className="px-3 py-2">{s?.time_slot ?? "-"}</td>
                      <td className="px-3 py-2">
                        {instructorById.get(a.instructor_id)?.name ?? "-"}
                      </td>
                      <td className="px-3 py-2 text-xs text-red-700">
                        {a.confirm_due_date}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <form action={startFinalConfirm}>
                          <input
                            type="hidden"
                            name="assignment_id"
                            value={a.id}
                          />
                          <button
                            type="submit"
                            className="font-medium text-brand hover:underline"
                          >
                            최종확정 진행
                          </button>
                        </form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
