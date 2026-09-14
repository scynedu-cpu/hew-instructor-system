"use client";

// 작업지시서 #019 (2-2, 2-3) — 강의이력 조회 + 증명서 발급 화면

import { useEffect, useState } from "react";
import type { CareerCertificateIssuance, LectureHistoryRow } from "@/lib/types";
import { getIssuances, getLectureHistory, issueCertificate } from "./actions";

interface RefInstructor {
  id: string;
  name: string;
}

export function CareerClient({ instructors }: { instructors: RefInstructor[] }) {
  const [instructorId, setInstructorId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const [rows, setRows] = useState<LectureHistoryRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [totalHours, setTotalHours] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const [issuances, setIssuances] = useState<(CareerCertificateIssuance & { downloadUrl: string | null })[]>([]);
  const [issuing, setIssuing] = useState(false);
  const [issueMsg, setIssueMsg] = useState<{ ok?: boolean; text: string } | null>(null);

  async function load() {
    if (!instructorId) return;
    setLoading(true);
    setError(null);
    setIssueMsg(null);
    const [history, issued] = await Promise.all([
      getLectureHistory(instructorId, from || null, to || null),
      getIssuances(instructorId),
    ]);
    if (history.error) setError(history.error);
    setRows(history.rows);
    setTotalCount(history.totalCount);
    setTotalHours(history.totalHours);
    setIssuances(issued.issuances);
    setLoading(false);
    setLoaded(true);
  }

  useEffect(() => {
    if (instructorId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 강사 선택 시 1회 조회
      load();
    } else {
      setRows([]);
      setTotalCount(0);
      setTotalHours(0);
      setIssuances([]);
      setLoaded(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instructorId]);

  async function onIssue() {
    if (!instructorId) return;
    setIssuing(true);
    setIssueMsg(null);
    const res = await issueCertificate(instructorId, from || null, to || null);
    if (res.error) {
      setIssueMsg({ text: res.error });
    } else {
      setIssueMsg({ ok: true, text: `발급 완료 (문서번호 ${res.documentNo})` });
      const issued = await getIssuances(instructorId);
      setIssuances(issued.issuances);
    }
    setIssuing(false);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface p-4">
        <label className="flex flex-col gap-1 text-sm font-medium">
          강사
          <select
            value={instructorId}
            onChange={(e) => setInstructorId(e.target.value)}
            className="w-44 rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand"
          >
            <option value="">강사 선택…</option>
            {instructors.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          시작일
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          종료일
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand"
          />
        </label>
        <span className="text-xs text-muted">비워두면 전체기간</span>
        <button
          type="button"
          onClick={load}
          disabled={!instructorId || loading}
          className="ml-auto rounded-md bg-brand px-4 py-2 text-sm font-semibold text-brand-fg hover:bg-brand-hover disabled:opacity-50"
        >
          {loading ? "조회 중…" : "조회"}
        </button>
      </div>

      {!instructorId ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted">
          위에서 강사를 선택하세요.
        </p>
      ) : (
        <>
          {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

          {loaded && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface p-4">
              <div className="flex gap-6 text-sm">
                <span>
                  총 강의 건수 <b className="ml-1">{totalCount}건</b>
                </span>
                <span>
                  총 강의시간 <b className="ml-1">{totalHours}시간</b>
                </span>
              </div>
              <button
                type="button"
                onClick={onIssue}
                disabled={issuing || rows.length === 0}
                className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-brand-fg hover:bg-brand-hover disabled:opacity-50"
              >
                {issuing ? "발급 중…" : "증명서 발급"}
              </button>
            </div>
          )}

          {issueMsg && (
            <p className={`text-sm ${issueMsg.ok ? "text-green-700" : "text-red-700"}`}>{issueMsg.text}</p>
          )}

          {loaded &&
            (rows.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted">
                이 기간에 완료된 강의 이력이 없습니다.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full min-w-[600px] text-sm">
                  <thead className="bg-zinc-50 text-left text-xs text-muted">
                    <tr>
                      <th className="px-3 py-2 font-medium">일자</th>
                      <th className="px-3 py-2 font-medium">학교명</th>
                      <th className="px-3 py-2 font-medium">프로그램명</th>
                      <th className="px-3 py-2 font-medium">강의시간</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {rows.map((r) => (
                      <tr key={r.id}>
                        <td className="px-3 py-2 text-xs text-muted">{r.actualDate ?? "-"}</td>
                        <td className="px-3 py-2">{r.schoolName}</td>
                        <td className="px-3 py-2 text-xs">{r.programLabel}</td>
                        <td className="px-3 py-2">{r.actualHours !== null ? `${r.actualHours}시간` : "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}

          <section>
            <h2 className="mb-2 text-sm font-semibold">발급 이력</h2>
            {issuances.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-xs text-muted">
                발급 이력이 없습니다.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full min-w-[600px] text-sm">
                  <thead className="bg-zinc-50 text-left text-xs text-muted">
                    <tr>
                      <th className="px-3 py-2 font-medium">문서번호</th>
                      <th className="px-3 py-2 font-medium">대상 기간</th>
                      <th className="px-3 py-2 font-medium">건수/시간</th>
                      <th className="px-3 py-2 font-medium">발급일시</th>
                      <th className="px-3 py-2 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {issuances.map((row) => (
                      <tr key={row.id}>
                        <td className="px-3 py-2 font-medium">{row.document_no}</td>
                        <td className="px-3 py-2 text-xs text-muted">
                          {row.period_from || row.period_to
                            ? `${row.period_from ?? "전체"} ~ ${row.period_to ?? "현재"}`
                            : "전체기간"}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {row.total_count}건 / {row.total_hours}시간
                        </td>
                        <td className="px-3 py-2 text-xs text-muted">
                          {new Date(row.issued_at).toLocaleString("ko-KR")} · {row.issued_by ?? "담당자"}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {row.downloadUrl ? (
                            <a
                              href={row.downloadUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="font-medium text-link hover:underline"
                            >
                              다운로드
                            </a>
                          ) : (
                            <span className="text-xs text-muted">링크 없음</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
