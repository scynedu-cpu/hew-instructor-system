import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getSchoolContext } from "@/lib/auth";
import type { SessionRequestWithRefs } from "@/lib/types";
import { programLabel } from "@/lib/types";
import { StatusBadge } from "@/components/status-badge";

export default async function SchoolRequestsPage() {
  const ctx = await getSchoolContext();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("session_requests")
    .select(
      "*, session_request_items(*, program:programs(id,name,category,sub_program,matching_keyword))",
    )
    .eq("school_id", ctx.schoolId)
    .order("submitted_at", { ascending: false })
    .returns<SessionRequestWithRefs[]>();

  const requests = data ?? [];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">교육 프로그램 신청</h1>
        {!ctx.readOnly && (
          <Link
            href="/school/new"
            className="rounded-md bg-brand px-3 py-2 text-sm font-semibold text-brand-fg hover:bg-blue-800"
          >
            신규 신청
          </Link>
        )}
      </div>

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          목록을 불러오지 못했습니다: {error.message}
        </p>
      )}

      {requests.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border bg-surface px-4 py-10 text-center text-sm text-muted">
          아직 신청 내역이 없습니다. “신규 신청”으로 프로그램을 신청하세요.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {requests.map((r) => (
            <li
              key={r.id}
              className="rounded-lg border border-border bg-surface p-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={r.request_status} />
                <span className="font-semibold">
                  프로그램 {r.session_request_items?.length ?? 0}건
                </span>
                {r.teacher_name && (
                  <span className="text-xs text-muted">
                    담당교사 {r.teacher_name}
                  </span>
                )}
                <span className="ml-auto text-xs text-muted">
                  {new Date(r.submitted_at).toLocaleDateString("ko-KR")} 제출
                </span>
              </div>

              <ul className="mt-3 flex flex-col gap-2">
                {(r.session_request_items ?? []).map((it) => (
                  <li
                    key={it.id}
                    className="rounded-md border border-border bg-zinc-50/50 p-2 text-sm"
                  >
                    <span className="font-medium">
                      {it.program ? programLabel(it.program) : "프로그램"}
                    </span>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted">
                      <span>
                        희망일자:{" "}
                        {it.dates_tbd
                          ? "미정"
                          : (it.requested_dates ?? []).join(", ") || "-"}
                      </span>
                      <span>시간: {it.preferred_time_slot || "-"}</span>
                      <span>인원: {it.expected_student_count || "-"}</span>
                      {it.note && <span>비고: {it.note}</span>}
                    </div>
                  </li>
                ))}
              </ul>

              {r.request_status === "rejected" && (
                <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                  <span className="font-semibold">반려 사유:</span>{" "}
                  {r.rejection_reason || "(사유 미기재)"}
                </p>
              )}
              {r.request_status === "approved" && (
                <p className="mt-3 text-sm text-green-700">
                  승인되었습니다. 프로그램별 수업 일정이 생성되어 강사 배정이
                  진행됩니다.
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
