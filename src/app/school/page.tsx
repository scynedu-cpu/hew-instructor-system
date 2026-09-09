import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { SessionRequestWithRefs } from "@/lib/types";
import { StatusBadge } from "@/components/status-badge";

export default async function SchoolRequestsPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("session_requests")
    .select("*, program:programs(id,name,category)")
    .order("submitted_at", { ascending: false })
    .returns<SessionRequestWithRefs[]>();

  const requests = data ?? [];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">교육 프로그램 신청</h1>
        <Link
          href="/school/new"
          className="rounded-md bg-brand px-3 py-2 text-sm font-semibold text-brand-fg hover:bg-blue-800"
        >
          신규 신청
        </Link>
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
                  {r.program?.name ?? "프로그램 미상"}
                </span>
                {r.program?.category && (
                  <span className="text-xs text-muted">
                    {r.program.category}
                  </span>
                )}
                <span className="ml-auto text-xs text-muted">
                  {new Date(r.submitted_at).toLocaleDateString("ko-KR")} 제출
                </span>
              </div>

              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
                <div>
                  <dt className="text-xs text-muted">희망일자</dt>
                  <dd>{(r.requested_dates ?? []).join(", ") || "-"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">희망 시간대</dt>
                  <dd>{r.preferred_time_slot || "-"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">예상 인원</dt>
                  <dd>{r.expected_student_count || "-"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">필요 전문분야 / 강사수</dt>
                  <dd>
                    {r.required_specialty || "-"} / {r.required_instructor_count}명
                  </dd>
                </div>
              </dl>

              {r.request_status === "rejected" && (
                <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                  <span className="font-semibold">반려 사유:</span>{" "}
                  {r.rejection_reason || "(사유 미기재)"}
                </p>
              )}

              {r.request_status === "approved" && (
                <p className="mt-3 text-sm text-green-700">
                  승인되었습니다. 수업 일정이 생성되어 강사 배정이 진행됩니다.
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
