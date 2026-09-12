"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { DOC_STATUS_LABEL, DOC_STATUS_STYLE, type DocStatus } from "@/lib/documents";

/** 임박/만료 서류 1건 — 작업지시서 #010-1 */
export interface DocDetail {
  docType: string;
  status: "expiring_soon" | "expired";
  /** expiring_soon: 남은 일수(D-day) / expired: 지난 일수. 항상 양수 */
  days: number;
}

export interface InstructorDashboardRow {
  id: string;
  name: string;
  specialties: string[];
  /** 서류 여러 건 중 가장 급한 상태. 서류가 하나도 없으면 null */
  docStatus: DocStatus | null;
  /** 정형 서류 7종 중 아직 제출 안 한 종류 */
  missingDocTypes: string[];
  /** 임박·만료 서류별 상세(D-day/경과일) */
  docDetails: DocDetail[];
  /** 경력·자격증·전문분야가 전부 0건 */
  infoIncomplete: boolean;
  /** app_accounts 매핑 없음(#003-1 초대 전) */
  noAccount: boolean;
}

function needsUpdate(r: InstructorDashboardRow): boolean {
  return (
    r.docStatus === "expiring_soon" ||
    r.docStatus === "expired" ||
    r.infoIncomplete ||
    r.noAccount
  );
}

function SummaryCard({
  label,
  count,
  tone,
}: {
  label: string;
  count: number;
  tone: "red" | "amber" | "zinc";
}) {
  const toneCls =
    tone === "red"
      ? "border-red-200 bg-red-50"
      : tone === "amber"
        ? "border-amber-200 bg-amber-50"
        : "border-border bg-surface";
  const numberCls =
    tone === "red" ? "text-red-700" : tone === "amber" ? "text-amber-800" : "text-foreground";
  return (
    <div className={`flex flex-col gap-1 rounded-lg border p-4 ${toneCls}`}>
      <span className="text-sm text-muted">{label}</span>
      <span className={`text-2xl font-bold ${numberCls}`}>{count}명</span>
    </div>
  );
}

export function InstructorDashboardClient({
  rows,
}: {
  rows: InstructorDashboardRow[];
}) {
  const [onlyNeedsUpdate, setOnlyNeedsUpdate] = useState(true);
  const [query, setQuery] = useState("");

  const docIssueCount = rows.filter(
    (r) => r.docStatus === "expiring_soon" || r.docStatus === "expired",
  ).length;
  const infoIncompleteCount = rows.filter((r) => r.infoIncomplete).length;
  const noAccountCount = rows.filter((r) => r.noAccount).length;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (onlyNeedsUpdate && !needsUpdate(r)) return false;
      if (!q) return true;
      const hay = `${r.name} ${r.specialties.join(" ")}`.toLowerCase();
      return hay.includes(q);
    });
  }, [rows, onlyNeedsUpdate, query]);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <SummaryCard label="서류 만료임박·만료" count={docIssueCount} tone="red" />
        <SummaryCard label="정보 미비" count={infoIncompleteCount} tone="amber" />
        <SummaryCard label="계정 미발급" count={noAccountCount} tone="zinc" />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={onlyNeedsUpdate}
            onChange={(e) => setOnlyNeedsUpdate(e.target.checked)}
          />
          업데이트 필요만 보기
        </label>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="이름·전문분야 검색"
          className="ml-auto w-56 rounded-md border border-border bg-white px-3 py-1.5 text-sm outline-none focus:border-brand"
        />
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-zinc-50 text-left text-xs text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">성명</th>
              <th className="px-3 py-2 font-medium">전문분야</th>
              <th className="px-3 py-2 font-medium">서류상태</th>
              <th className="px-3 py-2 font-medium">정보완성도</th>
              <th className="px-3 py-2 font-medium">계정상태</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-muted">
                  {onlyNeedsUpdate
                    ? "조치가 필요한 강사가 없습니다."
                    : "강사가 없습니다."}
                </td>
              </tr>
            )}
            {filtered.map((r) => (
              <tr key={r.id} className="hover:bg-zinc-50">
                <td className="px-3 py-2 font-medium">
                  <Link
                    href={`/staff/instructors/${r.id}/edit`}
                    className="text-brand hover:underline"
                  >
                    {r.name}
                  </Link>
                </td>
                <td className="px-3 py-2 text-muted">
                  {r.specialties.length > 0 ? r.specialties.join(", ") : "-"}
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-col gap-1">
                    {r.docStatus ? (
                      <span
                        className={`badge w-fit ${DOC_STATUS_STYLE[r.docStatus]}`}
                      >
                        {DOC_STATUS_LABEL[r.docStatus]}
                      </span>
                    ) : (
                      <span className="badge w-fit bg-zinc-100 text-zinc-500">
                        서류없음
                      </span>
                    )}
                    {r.docDetails.length > 0 && (
                      <div className="flex flex-col text-xs">
                        {r.docDetails.map((d) => (
                          <span
                            key={d.docType}
                            className={
                              d.status === "expired"
                                ? "text-red-700"
                                : "text-amber-800"
                            }
                          >
                            {d.docType}{" "}
                            {d.status === "expiring_soon"
                              ? `D-${d.days}`
                              : `만료 ${d.days}일 경과`}
                          </span>
                        ))}
                      </div>
                    )}
                    {r.missingDocTypes.length > 0 && (
                      <span className="text-xs text-muted">
                        {r.missingDocTypes.join(" · ")} 누락
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2">
                  {r.infoIncomplete ? (
                    <span className="badge bg-amber-50 text-amber-800">미비</span>
                  ) : (
                    <span className="badge bg-green-50 text-green-700">완료</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {r.noAccount ? (
                    <span className="badge bg-zinc-100 text-zinc-500">미발급</span>
                  ) : (
                    <span className="badge bg-green-50 text-green-700">발급됨</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
