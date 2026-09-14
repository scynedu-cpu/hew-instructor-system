"use client";

// 작업지시서 #014-1 (2-5) — 구청·교육청 제출용 보고서(PDF) 생성.
// 범위(학교/기간/프로그램그룹)를 지정해 /api/survey/report 를 호출하고,
// 받은 PDF를 바로 다운로드한다.

import { useState } from "react";
import type { RefGroup, RefSchool } from "./insights-client";

export function ReportTab({ schools, groups }: { schools: RefSchool[]; groups: RefGroup[] }) {
  const [schoolId, setSchoolId] = useState("");
  const [group, setGroup] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (schoolId) params.set("school", schoolId);
      if (group) params.set("group", group);
      if (from) params.set("from", from);
      if (to) params.set("to", to);

      const res = await fetch(`/api/survey/report?${params.toString()}`);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "보고서 생성에 실패했습니다.");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `만족도설문_보고서_${new Date().toISOString().slice(0, 10)}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "보고서 생성에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">
        범위를 지정하면 전체 평균 만족도, 문항별·비교 그래프, 서술형 분석
        요약(이미 실행한 것만), 참여율 통계를 담은 PDF 보고서를 만듭니다.
        비워두면 전체 기준으로 생성합니다.
      </p>

      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface p-4">
        <label className="flex flex-col gap-1 text-sm font-medium">
          학교
          <select
            value={schoolId}
            onChange={(e) => setSchoolId(e.target.value)}
            className="w-44 rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand"
          >
            <option value="">전체</option>
            {schools.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm font-medium">
          프로그램그룹
          <select
            value={group}
            onChange={(e) => setGroup(e.target.value)}
            className="w-48 rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand"
          >
            <option value="">전체</option>
            {groups.map((g) => (
              <option key={g.code} value={g.code}>
                {g.label}
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

        <button
          type="button"
          disabled={busy}
          onClick={generate}
          className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-brand-fg hover:bg-brand-hover disabled:opacity-50"
        >
          {busy ? "생성 중…" : "보고서 생성(PDF)"}
        </button>
      </div>

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}
