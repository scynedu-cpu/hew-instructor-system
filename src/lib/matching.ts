// 작업지시서 #004-1 — 강사 배정 후보 계산(specialty_match 를 유사도 기반으로).
// 하드필터(스케줄 중복 제외)는 DB 함수 get_matching_candidate_pool() 에 그대로
// 남아있고, 이 파일은 그 후보 풀에 대해 전문분야 유사도 점수를 Claude API 로
// 세션당 1회 배치 계산한 뒤 최종 match_score(80/20) 로 상위 3명을 뽑아
// assignment_candidates 에 저장한다. 초기 임시배정·최종확정 재계산 양쪽에서
// 이 함수 하나를 공용으로 부른다(#004 의 최종 공식·상위3 로직은 변경 없음).
// #017: 평점 점수는 rating_avg(설문 자동점수) 대신 effective_rating(설문
// 70%+담당자 조정 30%, 조정 꺼지면 rating_avg 와 동일)을 쓴다 —
// get_matching_candidate_pool() 이 이미 그 값을 반환하므로 이 파일은 그대로 사용.

import Anthropic from "@anthropic-ai/sdk";
import type { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5";

interface CandidatePoolRow {
  instructor_id: string;
  name: string;
  effective_rating: number | null; // 설문 자동점수+담당자 조정을 합친 값(#017) — 매칭 점수 계산은 이 값을 씀
  specialties: string[];
}

export interface MatchingResult {
  error?: string;
}

const SIMILARITY_SYSTEM_PROMPT = [
  "너는 한국의 교육지원센터에서 강사와 프로그램의 전문분야 적합도를 판정하는",
  "도우미다. '필요 전문분야' 하나와, 번호가 매겨진 강사별 전문분야 목록을 보고",
  "강사마다 0~100 점 유사도 점수를 매긴다(그 강사가 가진 여러 전문분야 중",
  "가장 높은 유사도를 그 강사의 점수로 사용).",
  "",
  "판정 기준:",
  "- 완전히 동일하거나 사실상 같은 의미 → 100",
  "- 같은 상위 분야의 유사 전문분야(예: '직업상담'↔'진로상담') → 70~90",
  "- 관련은 있으나 다른 분야(예: 'AI교육'↔'드론전문가') → 20~40",
  "- 전혀 무관 → 0~10",
  "- 전문분야가 하나도 없는 강사는 0",
  "",
  "반드시 JSON 객체만 출력(설명·코드펜스 금지). 키는 강사 번호(문자열),",
  "값은 0~100 정수. 예: {\"1\": 85, \"2\": 30, \"3\": 0}",
].join("\n");

function parseScoreMap(raw: string): Record<string, number> {
  let s = raw.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("AI 응답에서 점수를 찾지 못했습니다.");
  }
  const parsed = JSON.parse(s.slice(start, end + 1)) as Record<string, unknown>;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(parsed)) {
    const n = Number(v);
    if (Number.isFinite(n)) out[k] = Math.max(0, Math.min(100, n));
  }
  return out;
}

/** 문자열 완전 일치 폴백(키 미설정·AI 호출 실패 시) — #004 원래 규칙 */
function exactMatchFallback(
  requiredSpecialty: string | null,
  pool: CandidatePoolRow[],
): Map<string, number> {
  const scores = new Map<string, number>();
  for (const p of pool) {
    const hit =
      !!requiredSpecialty && p.specialties.some((s) => s === requiredSpecialty);
    scores.set(p.instructor_id, hit ? 100 : 0);
  }
  return scores;
}

/**
 * required_specialty 하나 + 후보 강사들의 전문분야를 세션당 1회 배치로
 * Claude 에 넘겨 강사별 유사도(0~100)를 받는다. 전문분야가 아예 없는
 * 강사는 API 호출 없이 0점 처리(비용 절감). 키 미설정이거나 호출 실패 시
 * 완전일치 방식으로 안전하게 폴백 — 매칭 자체가 멈추지 않도록 함.
 */
async function computeSpecialtySimilarity(
  requiredSpecialty: string | null,
  pool: CandidatePoolRow[],
): Promise<Map<string, number>> {
  if (!requiredSpecialty) {
    return new Map(pool.map((p) => [p.instructor_id, 0]));
  }

  const withSpecs = pool.filter((p) => p.specialties.length > 0);
  const scores = new Map<string, number>();
  for (const p of pool) {
    if (p.specialties.length === 0) scores.set(p.instructor_id, 0);
  }
  if (withSpecs.length === 0) return scores;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    const fallback = exactMatchFallback(requiredSpecialty, withSpecs);
    for (const [k, v] of fallback) scores.set(k, v);
    return scores;
  }

  const listText = withSpecs
    .map((p, idx) => `${idx + 1}: ${p.specialties.join(", ")}`)
    .join("\n");
  const userText = `필요 전문분야: "${requiredSpecialty}"\n\n강사 목록(번호: 등록된 전문분야):\n${listText}`;

  try {
    const client = new Anthropic();
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: SIMILARITY_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userText }],
    });
    const out = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    const byIndex = parseScoreMap(out);
    withSpecs.forEach((p, idx) => {
      const score = byIndex[String(idx + 1)];
      scores.set(p.instructor_id, Number.isFinite(score) ? score : 0);
    });
  } catch {
    // AI 호출/파싱 실패 — 완전일치로 안전하게 폴백(매칭이 아예 멈추지 않도록)
    const fallback = exactMatchFallback(requiredSpecialty, withSpecs);
    for (const [k, v] of fallback) scores.set(k, v);
  }
  return scores;
}

/**
 * 세션 1건에 대해 후보 상위 3명을 다시 계산해 assignment_candidates 에
 * 저장한다(#004 확정: specialty80% + 평점20%, 상위 3명). 초기 임시배정
 * 화면(예정일 확정 시)과 최종확정 재계산 양쪽에서 이 함수를 공용으로 쓴다.
 */
export async function generateAssignmentCandidates(
  supabase: SupabaseServerClient,
  sessionId: string,
): Promise<MatchingResult> {
  const { data: session, error: sessErr } = await supabase
    .from("class_sessions")
    .select("required_specialty")
    .eq("id", sessionId)
    .maybeSingle<{ required_specialty: string | null }>();
  if (sessErr) return { error: sessErr.message };
  if (!session) return { error: "세션을 찾을 수 없습니다." };

  const { data: pool, error: poolErr } = await supabase.rpc(
    "get_matching_candidate_pool",
    { p_session_id: sessionId },
  );
  if (poolErr) return { error: poolErr.message };

  const candidates = (pool ?? []) as CandidatePoolRow[];

  await supabase.from("assignment_candidates").delete().eq("session_id", sessionId);
  if (candidates.length === 0) return {};

  const similarity = await computeSpecialtySimilarity(
    session.required_specialty,
    candidates,
  );

  const scored = candidates.map((c) => {
    const specialtyMatch = similarity.get(c.instructor_id) ?? 0;
    const ratingNorm = ((c.effective_rating ?? 0) / 5) * 100;
    const matchScore = specialtyMatch * 0.8 + ratingNorm * 0.2;
    return { ...c, matchScore };
  });

  scored.sort((a, b) => {
    if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
    const ra = a.effective_rating ?? 0;
    const rb = b.effective_rating ?? 0;
    if (rb !== ra) return rb - ra;
    return a.name.localeCompare(b.name, "ko");
  });

  const top3 = scored.slice(0, 3);
  const { error: insErr } = await supabase.from("assignment_candidates").insert(
    top3.map((c, idx) => ({
      session_id: sessionId,
      instructor_id: c.instructor_id,
      rank: idx + 1,
      match_score: Math.round(c.matchScore * 100) / 100,
    })),
  );
  if (insErr) return { error: insErr.message };

  return {};
}
