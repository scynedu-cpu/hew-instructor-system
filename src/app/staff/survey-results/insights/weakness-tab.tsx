"use client";

// 작업지시서 #014-1 (2-1) — 문항별 약점 진단. 공통 평점형 문항 5개 + 그룹별
// 문항 5개(그룹 선택 시)를 각각 막대그래프로, 최저 문항은 색으로 강조.

import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { QuestionAverage, SurveyGroupCode } from "@/lib/types";
import { getQuestionAverages } from "./actions";
import type { RefGroup } from "./insights-client";
import { DateRangeFilter } from "./date-range-filter";

const BRAND = "#1e2a44";
const LOWEST = "#dc2626";

function QuestionBarChart({ rows }: { rows: QuestionAverage[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted">해당 기간에 응답이 없습니다.</p>;
  }
  const withData = rows.filter((r) => r.avg !== null);
  const minAvg = withData.length > 0 ? Math.min(...withData.map((r) => r.avg as number)) : null;
  const chartData = rows.map((r, i) => ({
    ...r,
    label: `Q${i + 1}`,
    value: r.avg ?? 0,
  }));

  return (
    <div className="flex flex-col gap-3">
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={chartData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="#eef0f3" />
          <XAxis dataKey="label" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
          <YAxis domain={[0, 5]} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
          <Tooltip
            formatter={(v, _n, p) => [
              p?.payload?.avg === null ? "응답 없음" : `${v}점 (${p.payload.count}건)`,
              p?.payload?.text,
            ]}
          />
          <Bar dataKey="value" radius={[4, 4, 0, 0]}>
            {chartData.map((r, i) => (
              <Cell key={i} fill={minAvg !== null && r.avg === minAvg ? LOWEST : BRAND} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <ol className="grid grid-cols-1 gap-1 text-xs text-muted sm:grid-cols-2">
        {rows.map((r, i) => (
          <li key={r.id} className={r.avg !== null && r.avg === minAvg ? "font-semibold text-red-700" : ""}>
            Q{i + 1}. {r.text} — {r.avg !== null ? `${r.avg}점 (${r.count}건)` : "응답 없음"}
          </li>
        ))}
      </ol>
    </div>
  );
}

export function WeaknessTab({ groups }: { groups: RefGroup[] }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [common, setCommon] = useState<QuestionAverage[]>([]);
  const [byGroup, setByGroup] = useState<Record<SurveyGroupCode, QuestionAverage[]>>(
    {} as Record<SurveyGroupCode, QuestionAverage[]>,
  );
  const [selectedGroup, setSelectedGroup] = useState<SurveyGroupCode | "">("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    const res = await getQuestionAverages(from || null, to || null);
    if (res.error) setError(res.error);
    setCommon(res.common);
    setByGroup(res.byGroup);
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 최초 진입 시 1회 조회
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <DateRangeFilter from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} onApply={load} busy={loading} />

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <section className="rounded-lg border border-border bg-surface p-4">
        <h2 className="mb-3 text-sm font-semibold">공통 문항 (5개)</h2>
        {loading ? <p className="text-sm text-muted">불러오는 중…</p> : <QuestionBarChart rows={common} />}
      </section>

      <section className="rounded-lg border border-border bg-surface p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">그룹별 문항 (5개)</h2>
          <select
            value={selectedGroup}
            onChange={(e) => setSelectedGroup(e.target.value as SurveyGroupCode | "")}
            className="rounded-md border border-border bg-white px-3 py-1.5 text-sm outline-none focus:border-brand"
          >
            <option value="">그룹 선택…</option>
            {groups.map((g) => (
              <option key={g.code} value={g.code}>
                {g.label}
              </option>
            ))}
          </select>
        </div>
        {!selectedGroup ? (
          <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted">
            위에서 프로그램 그룹을 선택하세요.
          </p>
        ) : loading ? (
          <p className="text-sm text-muted">불러오는 중…</p>
        ) : (
          <QuestionBarChart rows={byGroup[selectedGroup] ?? []} />
        )}
      </section>
    </div>
  );
}
