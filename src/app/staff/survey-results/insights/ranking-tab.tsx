"use client";

// 작업지시서 #014-1 (2-2) — 다차원 비교. 학교별/프로그램그룹별/강사별(상·하위)
// 순위 막대그래프 + 강사 선택 시 학교×프로그램 교차표.

import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { CrossTabCell, RankingRow } from "@/lib/types";
import { getInstructorCrossTab, getRankings } from "./actions";
import type { RefInstructor } from "./insights-client";
import { DateRangeFilter } from "./date-range-filter";
import { CylinderBar, type CylinderBarProps } from "./cylinder-bar";

const BRAND = "#2563eb";
const LOW_SAMPLE = "#dc2626";

function RankingChart({ rows, height = 220 }: { rows: RankingRow[]; height?: number }) {
  if (rows.length === 0) return <p className="text-sm text-muted">데이터가 없습니다.</p>;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={rows} margin={{ top: 8, right: 8, left: -12, bottom: 24 }} barCategoryGap="30%">
        <CartesianGrid vertical={false} stroke="#eef0f3" />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          angle={-30}
          textAnchor="end"
          interval={0}
        />
        <YAxis domain={[0, 5]} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
        <Tooltip
          formatter={(v, _n, p) => [
            `${v}점 (${p?.payload?.count}건${p?.payload?.lowSample ? " · 표본 부족" : ""})`,
            p?.payload?.label,
          ]}
        />
        <Bar
          dataKey="avg"
          isAnimationActive={false}
          shape={(props) => <CylinderBar {...(props as unknown as CylinderBarProps)} />}
        >
          {rows.map((r, i) => (
            <Cell key={i} fill={r.lowSample ? LOW_SAMPLE : BRAND} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function CrossTabView({
  schools,
  programs,
  cells,
}: {
  schools: string[];
  programs: string[];
  cells: Record<string, Record<string, CrossTabCell>>;
}) {
  if (schools.length === 0 || programs.length === 0) {
    return <p className="text-sm text-muted">이 강사의 강사평가 응답이 없습니다.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[480px] text-sm">
        <thead className="bg-zinc-50 text-left text-xs text-muted">
          <tr>
            <th className="px-3 py-2 font-medium">학교 \ 프로그램</th>
            {programs.map((p) => (
              <th key={p} className="px-3 py-2 font-medium">
                {p}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {schools.map((s) => (
            <tr key={s}>
              <td className="px-3 py-2 font-medium">{s}</td>
              {programs.map((p) => {
                const cell = cells[s]?.[p];
                return (
                  <td key={p} className="px-3 py-2">
                    {!cell ? (
                      <span className="text-muted">-</span>
                    ) : cell.lowSample ? (
                      <span className="text-xs text-amber-700">표본 부족 ({cell.count}건)</span>
                    ) : (
                      <span className={cell.avg < 3.5 ? "font-semibold text-red-700" : ""}>
                        {cell.avg}점 ({cell.count}건)
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function RankingTab({ instructors }: { instructors: RefInstructor[] }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [bySchool, setBySchool] = useState<RankingRow[]>([]);
  const [byGroup, setByGroup] = useState<RankingRow[]>([]);
  const [instructorsTop, setInstructorsTop] = useState<RankingRow[]>([]);
  const [instructorsBottom, setInstructorsBottom] = useState<RankingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedInstructor, setSelectedInstructor] = useState("");
  const [crossTab, setCrossTab] = useState<{
    schools: string[];
    programs: string[];
    cells: Record<string, Record<string, CrossTabCell>>;
  } | null>(null);
  const [crossTabLoading, setCrossTabLoading] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    const res = await getRankings(from || null, to || null);
    if (res.error) setError(res.error);
    setBySchool(res.bySchool);
    setByGroup(res.byGroup);
    setInstructorsTop(res.instructorsTop);
    setInstructorsBottom(res.instructorsBottom);
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 최초 진입 시 1회 조회
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadCrossTab(instructorId: string) {
    setSelectedInstructor(instructorId);
    setCrossTab(null);
    if (!instructorId) return;
    setCrossTabLoading(true);
    const res = await getInstructorCrossTab(instructorId);
    setCrossTab(res);
    setCrossTabLoading(false);
  }

  return (
    <div className="flex flex-col gap-6">
      <DateRangeFilter from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} onApply={load} busy={loading} />
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <section className="rounded-lg border border-border bg-surface p-4">
        <h2 className="mb-3 text-sm font-semibold">학교별 순위</h2>
        {loading ? <p className="text-sm text-muted">불러오는 중…</p> : <RankingChart rows={bySchool} />}
      </section>

      <section className="rounded-lg border border-border bg-surface p-4">
        <h2 className="mb-3 text-sm font-semibold">프로그램그룹별 순위</h2>
        {loading ? <p className="text-sm text-muted">불러오는 중…</p> : <RankingChart rows={byGroup} />}
      </section>

      <section className="rounded-lg border border-border bg-surface p-4">
        <h2 className="mb-3 text-sm font-semibold">강사별 순위</h2>
        {loading ? (
          <p className="text-sm text-muted">불러오는 중…</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-1 text-xs font-medium text-muted">상위 10명</p>
              <RankingChart rows={instructorsTop} height={200} />
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-muted">하위 10명</p>
              <RankingChart rows={instructorsBottom} height={200} />
            </div>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-border bg-surface p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">강사별 교차표 — 학교 × 프로그램</h2>
          <select
            value={selectedInstructor}
            onChange={(e) => loadCrossTab(e.target.value)}
            className="rounded-md border border-border bg-white px-3 py-1.5 text-sm outline-none focus:border-brand"
          >
            <option value="">강사 선택…</option>
            {instructors.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
        </div>
        {!selectedInstructor ? (
          <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted">
            위에서 강사를 선택하면 학교·프로그램별 점수를 볼 수 있습니다.
          </p>
        ) : crossTabLoading ? (
          <p className="text-sm text-muted">불러오는 중…</p>
        ) : crossTab ? (
          <CrossTabView schools={crossTab.schools} programs={crossTab.programs} cells={crossTab.cells} />
        ) : null}
      </section>
    </div>
  );
}
