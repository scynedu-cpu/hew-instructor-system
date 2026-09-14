// 작업지시서 #014-1 (2-3) — 서술형 설문 응답 AI 분석 공통 로직. 서버 전용.
// 반복되는 주제를 "주제명 + 언급 횟수 + 대표 예시 문장" 5~8개로 정리한다.

import Anthropic from "@anthropic-ai/sdk";
import type { SurveyTextInsightTopic } from "@/lib/types";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
const MAX_ANSWERS_IN_PROMPT = 300; // 과도한 토큰 사용 방지(응답이 매우 많을 때)

function buildSystem(): string {
  return [
    "너는 한국의 교육지원센터 담당자를 돕는 설문 응답 분석기다.",
    "학생들이 남긴 서술형 설문 응답 목록을 읽고, 반복적으로 등장하는 주제를",
    "5~8개로 정리한다.",
    "",
    "규칙:",
    "- 반드시 JSON 배열 하나만 출력. 설명·코드펜스 금지.",
    "- 각 원소: { \"topic\": string, \"count\": number, \"examples\": string[] }",
    "- topic 은 5~15자 내외의 짧은 한글 주제명(예: \"드론 조작 체험이 재미있었다\").",
    "- count 는 그 주제와 관련된 응답 건수(대략적인 추정치도 괜찮음).",
    "- examples 는 그 주제를 가장 잘 보여주는 실제 응답 문장 1~2개를 원문 그대로 인용.",
    "- 응답이 너무 적거나 뚜렷한 주제가 없으면 5개보다 적어도 된다.",
    "- 개인을 특정할 수 있는 표현(실명 등)이 있으면 요약에서 제외한다.",
  ].join("\n");
}

function parseJsonArray(raw: string): SurveyTextInsightTopic[] {
  let s = raw.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const start = s.indexOf("[");
  const end = s.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("AI 응답에서 결과 목록을 찾지 못했습니다.");
  }
  const parsed = JSON.parse(s.slice(start, end + 1)) as unknown;
  if (!Array.isArray(parsed)) throw new Error("AI 응답 형식이 올바르지 않습니다.");
  return parsed.map((t) => {
    const o = t as Record<string, unknown>;
    return {
      topic: String(o.topic ?? "").trim() || "(제목 없음)",
      count: Number(o.count) || 0,
      examples: Array.isArray(o.examples)
        ? o.examples.map((e) => String(e)).filter(Boolean).slice(0, 3)
        : [],
    };
  });
}

/**
 * 서술형 응답 목록 → 주제별 요약. 응답이 하나도 없으면 호출하지 않고
 * 상위(actions.ts)에서 "분석할 응답이 없습니다" 로 처리한다.
 */
export async function analyzeSurveyTexts(
  questionText: string,
  texts: string[],
): Promise<SurveyTextInsightTopic[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "AI 분석을 사용하려면 ANTHROPIC_API_KEY 를 설정하세요 (.env.local).",
    );
  }

  const sample = texts.slice(0, MAX_ANSWERS_IN_PROMPT);
  const list = sample.map((t, i) => `${i + 1}. ${t.replace(/\s+/g, " ").trim()}`).join("\n");

  const client = new Anthropic();
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: buildSystem(),
    messages: [
      {
        role: "user",
        content: `문항: "${questionText}"\n\n아래는 이 문항에 대한 학생들의 응답 ${sample.length}건입니다.\n\n${list}\n\n주제별로 정리해 JSON 배열만 출력하세요.`,
      },
    ],
  });

  const out = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  return parseJsonArray(out);
}
