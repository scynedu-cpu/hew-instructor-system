"use client";

import { useState } from "react";
import type { SurveyGroupCode } from "@/lib/types";
import { WeaknessTab } from "./weakness-tab";
import { RankingTab } from "./ranking-tab";
import { TextAnalysisTab } from "./text-analysis-tab";
import { ParticipationTab } from "./participation-tab";
import { ReportTab } from "./report-tab";

export interface RefSchool {
  id: string;
  name: string;
  level: string;
}
export interface RefInstructor {
  id: string;
  name: string;
}
export interface RefGroup {
  code: SurveyGroupCode;
  label: string;
}

const TABS = [
  { key: "weakness", label: "문항별 약점진단" },
  { key: "ranking", label: "다차원 비교" },
  { key: "text", label: "AI 서술분석" },
  { key: "participation", label: "참여율" },
  { key: "report", label: "보고서 생성" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export function InsightsClient({
  schools,
  instructors,
  groups,
}: {
  schools: RefSchool[];
  instructors: RefInstructor[];
  groups: RefGroup[];
}) {
  const [tab, setTab] = useState<TabKey>("weakness");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`border-b-2 px-3 py-2 text-sm font-medium ${
              tab === t.key
                ? "border-brand text-foreground"
                : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "weakness" && <WeaknessTab groups={groups} />}
      {tab === "ranking" && <RankingTab instructors={instructors} />}
      {tab === "text" && <TextAnalysisTab schools={schools} groups={groups} instructors={instructors} />}
      {tab === "participation" && <ParticipationTab />}
      {tab === "report" && <ReportTab schools={schools} groups={groups} />}
    </div>
  );
}
