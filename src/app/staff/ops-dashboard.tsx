"use client";

// 작업지시서 #018 — 운영 모니터링 대시보드 (프레젠테이션)
// 승인된 목업(ops_monitor_mockup.jsx)의 레이아웃·톤·차트 구성을 그대로 따른다.
// 데이터는 전부 ../page.tsx 에서 실데이터로 계산해 props 로 내려받는다.

import Link from "next/link";
import {
  AlertTriangle,
  Clock,
  Users,
  Wallet,
  MessageSquare,
  TrendingDown,
  ChevronRight,
  CalendarDays,
  FileWarning,
  CheckCircle2,
} from "lucide-react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
} from "recharts";

export type UrgentTone = "critical" | "warning" | "info";
export type TrafficStatus = "red" | "amber" | "green";
export type UrgentIconKey =
  | "overdue"
  | "missing_complete"
  | "unassigned"
  | "rating_drop";
export type SectionIconKey = "schedule" | "instructors" | "payment" | "survey";

export interface UrgentItem {
  id: string;
  tone: UrgentTone;
  iconKey: UrgentIconKey;
  title: string;
  detail: string;
  action: string;
  href: string;
}

export interface SectionRow {
  label: string;
  value: string;
  warn?: boolean;
  ok?: boolean;
}

export interface SectionCard {
  key: string;
  iconKey: SectionIconKey;
  label: string;
  status: TrafficStatus;
  href: string;
  rows: SectionRow[];
}

export interface DashboardData {
  todayLabel: string;
  generatedAtLabel: string;
  urgent: UrgentItem[];
  sections: SectionCard[];
  satisfactionTrend: { week: string; score: number | null }[];
  satisfactionAvgLabel: string;
  sessionStatus: { name: string; count: number; color: string }[];
}

const URGENT_ICON: Record<UrgentIconKey, typeof AlertTriangle> = {
  overdue: AlertTriangle,
  missing_complete: CheckCircle2,
  unassigned: Users,
  rating_drop: TrendingDown,
};

const SECTION_ICON: Record<SectionIconKey, typeof CalendarDays> = {
  schedule: CalendarDays,
  instructors: FileWarning,
  payment: Wallet,
  survey: MessageSquare,
};

const TONE_STYLES: Record<
  UrgentTone,
  { bar: string; chip: string; icon: string }
> = {
  critical: {
    bar: "bg-rose-500",
    chip: "bg-rose-50 text-rose-700 border-rose-200",
    icon: "text-rose-600",
  },
  warning: {
    bar: "bg-amber-500",
    chip: "bg-amber-50 text-amber-800 border-amber-200",
    icon: "text-amber-600",
  },
  info: {
    bar: "bg-slate-400",
    chip: "bg-slate-50 text-slate-700 border-slate-200",
    icon: "text-slate-500",
  },
};

const DOT: Record<TrafficStatus, string> = {
  red: "bg-rose-500",
  amber: "bg-amber-400",
  green: "bg-emerald-500",
};
const DOT_RING: Record<TrafficStatus, string> = {
  red: "ring-rose-100",
  amber: "ring-amber-100",
  green: "ring-emerald-100",
};

function TrafficDot({
  status,
  size = "h-2.5 w-2.5",
}: {
  status: TrafficStatus;
  size?: string;
}) {
  return (
    <span
      className={`inline-block ${size} rounded-full ${DOT[status]} ring-4 ${DOT_RING[status]}`}
    />
  );
}

function OverallBanner({ sections }: { sections: SectionCard[] }) {
  const reds = sections.filter((s) => s.status === "red").length;
  const ambers = sections.filter((s) => s.status === "amber").length;
  const overall: TrafficStatus = reds > 0 ? "red" : ambers > 0 ? "amber" : "green";
  const label =
    overall === "red" ? "주의 필요" : overall === "amber" ? "확인 필요" : "정상 운영중";
  const sub =
    overall === "red"
      ? `${reds}개 영역에서 즉시 조치가 필요합니다`
      : overall === "amber"
        ? `${ambers}개 영역에서 확인이 필요합니다`
        : "모든 영역이 정상 범위입니다";

  return (
    <div className="mb-6 flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3">
      <TrafficDot status={overall} size="h-3.5 w-3.5" />
      <div>
        <div className="text-[14px] font-bold text-slate-900">
          전체 상태 · {label}
        </div>
        <div className="text-[12px] text-slate-500">{sub}</div>
      </div>
      <div className="ml-auto flex flex-wrap items-center gap-4">
        {sections.map((s) => (
          <div key={s.key} className="flex items-center gap-1.5">
            <TrafficDot status={s.status} />
            <span className="text-[11.5px] text-slate-500">
              {s.label.replace(" 현황", "")}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function UrgentCard({ item }: { item: UrgentItem }) {
  const tone = TONE_STYLES[item.tone];
  const Icon = URGENT_ICON[item.iconKey];
  return (
    <div className="flex items-stretch gap-0 overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className={`w-1 shrink-0 ${tone.bar}`} />
      <div className="flex flex-1 flex-wrap items-center gap-4 px-4 py-3.5">
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border ${tone.chip}`}
        >
          <Icon className={`h-4.5 w-4.5 ${tone.icon}`} strokeWidth={2} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-semibold text-slate-900">
            {item.title}
          </div>
          <div className="mt-0.5 truncate text-[12.5px] text-slate-500">
            {item.detail}
          </div>
        </div>
        <Link
          href={item.href}
          className="flex shrink-0 items-center gap-1 rounded-md border border-slate-200 px-3 py-1.5 text-[12.5px] font-medium text-slate-700 hover:bg-slate-50"
        >
          {item.action}
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}

function SectionRowView({ row }: { row: SectionRow }) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-[13px] text-slate-500">{row.label}</span>
      <span
        className={
          "text-[13.5px] font-semibold " +
          (row.warn ? "text-amber-700" : row.ok ? "text-emerald-700" : "text-slate-900")
        }
      >
        {row.value}
      </span>
    </div>
  );
}

function SatisfactionChart({
  trend,
  avgLabel,
}: {
  trend: DashboardData["satisfactionTrend"];
  avgLabel: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3.5">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[13px] font-semibold text-slate-700">
          만족도 추이 (최근 6주)
        </span>
        <span className="text-[12px] font-semibold text-emerald-700">
          평균 {avgLabel}
        </span>
      </div>
      <ResponsiveContainer width="100%" height={140}>
        <LineChart data={trend} margin={{ top: 6, right: 8, left: -22, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="#eef0f3" />
          <XAxis
            dataKey="week"
            tick={{ fontSize: 10.5, fill: "#94a3b8" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            domain={[1, 5]}
            tick={{ fontSize: 10.5, fill: "#94a3b8" }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
            formatter={(v) => [v == null ? "응답 없음" : `${v}점`, "평균 만족도"]}
          />
          <Line
            type="monotone"
            dataKey="score"
            stroke="#2563eb"
            strokeWidth={2.25}
            dot={{ r: 3.5 }}
            connectNulls={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function SessionStatusChart({
  data,
}: {
  data: DashboardData["sessionStatus"];
}) {
  const total = data.reduce((s, d) => s + d.count, 0);
  const unassigned = data.find((d) => d.name === "미배정")?.count ?? 0;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3.5">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[13px] font-semibold text-slate-700">
          세션 상태 분포 (전체 {total}건)
        </span>
        <span className="text-[12px] font-semibold text-rose-600">
          미배정 {unassigned}건
        </span>
      </div>
      <ResponsiveContainer width="100%" height={140}>
        <BarChart data={data} margin={{ top: 6, right: 8, left: -22, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="#eef0f3" />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 11, fill: "#94a3b8" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis tick={{ fontSize: 10.5, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }} />
          <Bar dataKey="count" radius={[4, 4, 0, 0]}>
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function OpsDashboard({ data }: { data: DashboardData }) {
  const { urgent, sections } = data;

  return (
    <div className="w-full font-sans">
      {/* header */}
      <div className="mb-5 flex flex-wrap items-end justify-between gap-2 border-b border-slate-200 pb-4">
        <div>
          <div className="text-[12.5px] font-medium text-slate-400">
            양재모 교육지원센터
          </div>
          <h1 className="mt-0.5 text-[22px] font-bold tracking-tight text-slate-900">
            오늘의 운영 현황
          </h1>
        </div>
        <div className="text-right text-[12.5px] text-slate-400">
          {data.todayLabel}
          <br />
          {data.generatedAtLabel} 기준
        </div>
      </div>

      {/* overall traffic-light banner */}
      <OverallBanner sections={sections} />

      {/* urgent */}
      <div className="mb-8">
        <div className="mb-2.5 flex items-center justify-between">
          <h2 className="text-[14px] font-bold text-slate-900">지금 처리해야 할 일</h2>
          {urgent.length > 0 && (
            <span className="rounded-full bg-rose-500 px-2 py-0.5 text-[11px] font-bold text-white">
              {urgent.length}
            </span>
          )}
        </div>
        {urgent.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-200 bg-white px-4 py-10 text-center text-[13px] text-slate-500">
            🎉 지금 처리할 일이 없습니다.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {urgent.map((item) => (
              <UrgentCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </div>

      {/* charts */}
      <div className="mb-8">
        <h2 className="mb-2.5 text-[14px] font-bold text-slate-900">추이 및 분포</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <SatisfactionChart trend={data.satisfactionTrend} avgLabel={data.satisfactionAvgLabel} />
          <SessionStatusChart data={data.sessionStatus} />
        </div>
      </div>

      {/* summary sections */}
      <div>
        <h2 className="mb-2.5 text-[14px] font-bold text-slate-900">영역별 현황</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {sections.map((sec) => {
            const Icon = SECTION_ICON[sec.iconKey];
            return (
              <div
                key={sec.key}
                className="rounded-lg border border-slate-200 bg-white px-4 py-3.5"
              >
                <div className="mb-1 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <TrafficDot status={sec.status} />
                    <Icon className="h-4 w-4 text-slate-400" strokeWidth={2} />
                    <span className="text-[13px] font-semibold text-slate-700">
                      {sec.label}
                    </span>
                  </div>
                  <Link
                    href={sec.href}
                    className="text-[12px] text-slate-400 hover:text-slate-600"
                  >
                    바로가기 →
                  </Link>
                </div>
                <div className="divide-y divide-slate-100">
                  {sec.rows.map((row, i) => (
                    <SectionRowView key={i} row={row} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-8 flex items-center gap-2 text-[11.5px] text-slate-400">
        <Clock className="h-3.5 w-3.5" />
        새로고침하면 최신 데이터로 다시 계산됩니다.
      </div>
    </div>
  );
}
