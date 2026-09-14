// 작업지시서 #014-1 — 만족도설문 심화분석
// 5가지 분석 관점(문항별 약점진단/다차원비교/AI서술분석/참여율/보고서)을
// 탭으로 묶은 화면. 무거운 집계는 각 탭이 마운트될 때 서버 액션으로
// 그때그때 계산해 가져온다(이 페이지는 필터용 참조 목록만 미리 내려줌).

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { School } from "@/lib/types";
import { SURVEY_GROUP_LABEL, type SurveyGroupCode } from "@/lib/types";
import { InsightsClient } from "./insights-client";

export default async function SurveyInsightsPage() {
  await requireRole("staff");
  const supabase = await createClient();

  const [{ data: schools }, { data: instructors }] = await Promise.all([
    supabase.from("schools").select("id,name,level").order("name").returns<School[]>(),
    supabase
      .from("instructors")
      .select("id,name")
      .order("name")
      .returns<{ id: string; name: string }[]>(),
  ]);

  const groups = (Object.keys(SURVEY_GROUP_LABEL) as SurveyGroupCode[]).map((code) => ({
    code,
    label: SURVEY_GROUP_LABEL[code],
  }));

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-bold">만족도설문 심화분석</h1>
        <p className="mt-1 text-sm text-muted">
          쌓인 설문 응답에서 문항별 약점, 학교·프로그램·강사 비교, 서술형 응답
          주제, 참여율을 확인하고 제출용 보고서를 만듭니다.
        </p>
      </div>

      <InsightsClient
        schools={schools ?? []}
        instructors={instructors ?? []}
        groups={groups}
      />
    </div>
  );
}
