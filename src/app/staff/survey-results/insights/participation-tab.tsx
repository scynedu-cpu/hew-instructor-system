"use client";

// 작업지시서 #014-1 (2-4) — 세션별 응답 참여율. 참여율 낮은(30% 미만)
// 세션이 이미 정렬(actions.ts)로 상단에 오도록 되어 있어 그대로 나열한다.

import { useEffect, useState } from "react";
import type { ParticipationRow } from "@/lib/types";
import { getParticipation } from "./actions";

const LOW_THRESHOLD = 30;

export function ParticipationTab() {
  const [rows, setRows] = useState<ParticipationRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getParticipation().then((res) => {
      if (res.error) setError(res.error);
      setRows(res.rows);
    });
  }, []);

  if (error) return <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>;
  if (!rows) return <p className="text-sm text-muted">불러오는 중…</p>;
  if (rows.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted">
        설문 QR을 발급한 세션이 아직 없습니다.
      </p>
    );
  }

  const lowCount = rows.filter((r) => r.rate !== null && r.rate < LOW_THRESHOLD).length;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted">
        참여율 = 응답 수 ÷ 신청서의 예상 인원(숫자 추출). 참여율이 낮은 세션이 위에 모여 있습니다
        {lowCount > 0 && (
          <span className="ml-1 font-semibold text-amber-700">
            (30% 미만 {lowCount}건)
          </span>
        )}
        .
      </p>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-zinc-50 text-left text-xs text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">학교</th>
              <th className="px-3 py-2 font-medium">프로그램</th>
              <th className="px-3 py-2 font-medium">강의일자</th>
              <th className="px-3 py-2 font-medium">응답 수</th>
              <th className="px-3 py-2 font-medium">예상 인원</th>
              <th className="px-3 py-2 font-medium">참여율</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => {
              const low = r.rate !== null && r.rate < LOW_THRESHOLD;
              return (
                <tr key={r.sessionId} className={low ? "bg-amber-50/50" : ""}>
                  <td className="px-3 py-2">{r.schoolName}</td>
                  <td className="px-3 py-2 text-xs">{r.programLabel}</td>
                  <td className="px-3 py-2 text-xs text-muted">{r.scheduledDate ?? "미정"}</td>
                  <td className="px-3 py-2">{r.responseCount}건</td>
                  <td className="px-3 py-2">{r.expectedCount ?? "-"}</td>
                  <td className="px-3 py-2">
                    {r.rate === null ? (
                      <span className="text-muted">참여율 계산 불가</span>
                    ) : (
                      <span className={low ? "font-semibold text-amber-700" : ""}>{r.rate}%</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
