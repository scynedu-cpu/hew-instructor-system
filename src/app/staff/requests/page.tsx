import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { RequestStatus, SessionRequestWithRefs } from "@/lib/types";
import { REQUEST_STATUS_LABEL, programLabel } from "@/lib/types";
import { StatusBadge } from "@/components/status-badge";

const FILTERS: { key: RequestStatus | "all"; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "submitted", label: REQUEST_STATUS_LABEL.submitted },
  { key: "reviewing", label: REQUEST_STATUS_LABEL.reviewing },
  { key: "approved", label: REQUEST_STATUS_LABEL.approved },
  { key: "rejected", label: REQUEST_STATUS_LABEL.rejected },
];

export default async function StaffRequestsPage({
  searchParams,
}: PageProps<"/staff/requests">) {
  const { status, proxy } = await searchParams;
  const active = (
    FILTERS.some((f) => f.key === status) ? status : "all"
  ) as RequestStatus | "all";

  const supabase = await createClient();
  let query = supabase
    .from("session_requests")
    .select(
      "*, school:schools(id,name,level), session_request_items(*, program:programs(id,name,category,sub_program,matching_keyword)), class_sessions(id,session_status)",
    )
    .order("submitted_at", { ascending: false });

  if (active !== "all") query = query.eq("request_status", active);

  const { data, error } = await query.returns<SessionRequestWithRefs[]>();
  const requests = data ?? [];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">교육 신청 관리</h1>
        <Link
          href="/staff/requests/new"
          className="rounded-md bg-brand px-3 py-2 text-sm font-semibold text-brand-fg hover:bg-brand-hover"
        >
          + 대리입력
        </Link>
      </div>

      {proxy && (
        <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
          대리입력한 신청서를 저장했습니다. 아래 목록에서 검토·승인하세요.
        </p>
      )}

      <div className="flex flex-wrap gap-1 border-b border-border">
        {FILTERS.map((f) => {
          const isActive = f.key === active;
          const href =
            f.key === "all"
              ? "/staff/requests"
              : `/staff/requests?status=${f.key}`;
          return (
            <Link
              key={f.key}
              href={href}
              className={`-mb-px border-b-2 px-3 py-2 text-sm ${
                isActive
                  ? "border-brand font-semibold text-brand"
                  : "border-transparent text-muted hover:text-foreground"
              }`}
            >
              {f.label}
            </Link>
          );
        })}
      </div>

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error.message}
        </p>
      )}

      {requests.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border bg-surface px-4 py-10 text-center text-sm text-muted">
          해당 상태의 신청이 없습니다.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-zinc-50 text-left text-xs text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">상태</th>
                <th className="px-3 py-2 font-medium">학교</th>
                <th className="px-3 py-2 font-medium">프로그램</th>
                <th className="px-3 py-2 font-medium">매칭 키워드</th>
                <th className="px-3 py-2 font-medium">제출</th>
                <th className="px-3 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {requests.map((r) => (
                <tr key={r.id} className="hover:bg-zinc-50/60">
                  <td className="px-3 py-2">
                    <StatusBadge status={r.request_status} />
                  </td>
                  <td className="px-3 py-2">
                    {r.school?.name ?? "-"}
                    <span className="ml-1 text-xs text-muted">
                      {r.school?.level}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {(r.session_request_items ?? [])
                      .map((it) =>
                        it.program ? programLabel(it.program) : "프로그램",
                      )
                      .join(", ") || "-"}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {[
                      ...new Set(
                        (r.session_request_items ?? [])
                          .map((it) => it.program?.matching_keyword)
                          .filter(Boolean),
                      ),
                    ].join(", ") || "-"}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted">
                    {new Date(r.submitted_at).toLocaleDateString("ko-KR")}
                    {r.submitted_by ? ` · ${r.submitted_by}` : ""}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Link
                      href={`/staff/requests/${r.id}`}
                      className="font-medium text-link hover:underline"
                    >
                      상세
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
