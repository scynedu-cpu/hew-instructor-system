"use server";

// 공개 설문 응답 제출 — 작업지시서 #013.
// 로그인 필요 없음(익명). requireRole 등 인증 체크를 절대 넣지 말 것 —
// 이 라우트는 QR을 스캔한 누구나 접근할 수 있어야 한다.
import { createClient } from "@/lib/supabase/server";

export interface SurveyAnswerInput {
  question_id: string;
  answer_rating?: number;
  answer_text?: string;
}

export interface SubmitSurveyState {
  error?: string;
  ok?: boolean;
}

/**
 * DB 함수 submit_survey_response() 호출 — 응답 1건 + 답변 N건을
 * 하나의 트랜잭션으로 저장한다(SECURITY DEFINER, anon 실행 허용).
 * 이름 등 개인 식별정보는 애초에 이 함수에 넘어가지 않는다(완전 익명).
 */
export async function submitSurveyResponse(
  token: string,
  answers: SurveyAnswerInput[],
): Promise<SubmitSurveyState> {
  if (!token) return { error: "잘못된 접근입니다." };
  if (!answers || answers.length === 0) {
    return { error: "응답 내용이 없습니다." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_survey_response", {
    p_token: token,
    p_answers: answers,
  });
  if (error) return { error: error.message };
  return { ok: true };
}
