"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import type { QuestionType, SurveyQuestion } from "@/lib/types";

const PATH = "/staff/survey-questions";

export interface QuestionFormState {
  error?: string;
  ok?: string;
}

const QUESTION_TYPES: QuestionType[] = [
  "rating_5",
  "single_choice",
  "short_text",
  "long_text",
];

function parseOptions(formData: FormData): string[] {
  return formData
    .getAll("option")
    .map((s) => String(s).trim())
    .filter(Boolean);
}

/** 문항 추가 — 항상 맨 끝 순서로 추가된다. */
export async function createSurveyQuestion(
  _prev: QuestionFormState,
  formData: FormData,
): Promise<QuestionFormState> {
  await requireRole("staff");

  const questionType = String(formData.get("question_type") ?? "") as QuestionType;
  const questionText = String(formData.get("question_text") ?? "").trim();
  const options = parseOptions(formData);

  if (!QUESTION_TYPES.includes(questionType)) {
    return { error: "문항 유형을 선택하세요." };
  }
  if (!questionText) return { error: "문항 내용을 입력하세요." };
  if (questionType === "single_choice" && options.length < 2) {
    return { error: "단일선택은 선택지를 2개 이상 입력하세요." };
  }

  const supabase = await createClient();

  const { data: maxRow } = await supabase
    .from("survey_questions")
    .select("display_order")
    .order("display_order", { ascending: false })
    .limit(1)
    .maybeSingle<{ display_order: number }>();
  const nextOrder = (maxRow?.display_order ?? 0) + 1;

  const { error } = await supabase.from("survey_questions").insert({
    question_type: questionType,
    question_text: questionText,
    options: questionType === "single_choice" ? options : null,
    display_order: nextOrder,
  });
  if (error) return { error: error.message };

  revalidatePath(PATH);
  return { ok: "문항을 추가했습니다." };
}

/** 문항 수정 — 문항 유형은 응답 데이터와의 정합성을 위해 생성 후 변경 불가, 문구/선택지만 수정 */
export async function updateSurveyQuestion(
  id: string,
  formData: FormData,
): Promise<{ error?: string }> {
  await requireRole("staff");

  const questionText = String(formData.get("question_text") ?? "").trim();
  if (!questionText) return { error: "문항 내용을 입력하세요." };

  const questionType = String(formData.get("question_type") ?? "") as QuestionType;
  const options = parseOptions(formData);
  if (questionType === "single_choice" && options.length < 2) {
    return { error: "단일선택은 선택지를 2개 이상 입력하세요." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("survey_questions")
    .update({
      question_text: questionText,
      options: questionType === "single_choice" ? options : null,
    })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath(PATH);
  return {};
}

/** "삭제" = is_active false 전환. 다시 활성화도 동일 함수로 처리(programs 화면과 동일 패턴) */
export async function toggleQuestionActive(
  id: string,
  nextActive: boolean,
): Promise<{ error?: string }> {
  await requireRole("staff");
  const supabase = await createClient();
  const { error } = await supabase
    .from("survey_questions")
    .update({ is_active: nextActive })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(PATH);
  return {};
}

/** 순서 변경 — 전체 목록(비활성 포함) 기준으로 바로 위/아래 문항과 display_order 를 맞바꾼다. */
export async function moveQuestion(
  id: string,
  direction: "up" | "down",
): Promise<{ error?: string }> {
  await requireRole("staff");
  const supabase = await createClient();

  const { data: rows, error: listErr } = await supabase
    .from("survey_questions")
    .select("id, display_order")
    .order("display_order", { ascending: true })
    .order("id", { ascending: true })
    .returns<{ id: string; display_order: number }[]>();
  if (listErr) return { error: listErr.message };

  const list = rows ?? [];
  const idx = list.findIndex((r) => r.id === id);
  if (idx === -1) return { error: "문항을 찾을 수 없습니다." };

  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= list.length) return {}; // 맨 위/아래 — 변화 없음

  const a = list[idx];
  const b = list[swapIdx];

  const { error: err1 } = await supabase
    .from("survey_questions")
    .update({ display_order: b.display_order })
    .eq("id", a.id);
  if (err1) return { error: err1.message };

  const { error: err2 } = await supabase
    .from("survey_questions")
    .update({ display_order: a.display_order })
    .eq("id", b.id);
  if (err2) return { error: err2.message };

  revalidatePath(PATH);
  return {};
}

export async function listSurveyQuestions(): Promise<SurveyQuestion[]> {
  await requireRole("staff");
  const supabase = await createClient();
  const { data } = await supabase
    .from("survey_questions")
    .select("*")
    .order("display_order", { ascending: true })
    .order("id", { ascending: true })
    .returns<SurveyQuestion[]>();
  return data ?? [];
}
