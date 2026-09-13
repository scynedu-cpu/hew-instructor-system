"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import type {
  QuestionScope,
  QuestionType,
  SurveyGroupCode,
  SurveyQuestion,
  SurveyQuestionGroup,
} from "@/lib/types";

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
const GROUP_CODES: SurveyGroupCode[] = ["A", "B", "C", "D", "E"];

function parseOptions(formData: FormData): string[] {
  return formData
    .getAll("option")
    .map((s) => String(s).trim())
    .filter(Boolean);
}

/** scope/survey_group 조합 검증 — common 이면 group 없음, group 이면 A~E 중 하나 */
function resolveScope(
  formData: FormData,
): { scope: QuestionScope; surveyGroup: string | null } | { error: string } {
  const scope = String(formData.get("scope") ?? "") as QuestionScope;
  if (scope !== "common" && scope !== "group") {
    return { error: "문항 범위(공통/그룹)를 선택하세요." };
  }
  if (scope === "common") return { scope, surveyGroup: null };

  const group = String(formData.get("survey_group") ?? "");
  if (!GROUP_CODES.includes(group as SurveyGroupCode)) {
    return { error: "그룹을 선택하세요." };
  }
  return { scope, surveyGroup: group };
}

/** 문항 추가 — 같은 scope/그룹 내에서 항상 맨 끝 순서로 추가된다. */
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

  const resolved = resolveScope(formData);
  if ("error" in resolved) return { error: resolved.error };
  const { scope, surveyGroup } = resolved;

  const supabase = await createClient();

  // 같은 scope(+그룹) 안에서만 맨 끝 순서를 계산 — 그룹별로 순서가 독립적
  let maxQuery = supabase
    .from("survey_questions")
    .select("display_order")
    .eq("scope", scope)
    .order("display_order", { ascending: false })
    .limit(1);
  maxQuery = surveyGroup
    ? maxQuery.eq("survey_group", surveyGroup)
    : maxQuery.is("survey_group", null);
  const { data: maxRow } = await maxQuery.maybeSingle<{ display_order: number }>();
  const nextOrder = (maxRow?.display_order ?? 0) + 1;

  const { error } = await supabase.from("survey_questions").insert({
    question_type: questionType,
    question_text: questionText,
    options: questionType === "single_choice" ? options : null,
    display_order: nextOrder,
    scope,
    survey_group: surveyGroup,
  });
  if (error) return { error: error.message };

  revalidatePath(PATH);
  return { ok: "문항을 추가했습니다." };
}

/** 문항 수정 — 문항 유형·범위(공통/그룹)는 응답 데이터와의 정합성을 위해
 *  생성 후 변경 불가, 문구/선택지만 수정 */
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

/** 섹션(공통 또는 특정 그룹) 전체를 한 번에 활성화/비활성화 — 개별 토글과
 *  동일한 is_active 컬럼을 그대로 쓰므로 응답 연결에는 영향 없다. */
export async function bulkToggleQuestions(
  ids: string[],
  nextActive: boolean,
): Promise<{ error?: string }> {
  await requireRole("staff");
  if (ids.length === 0) return {};
  const supabase = await createClient();
  const { error } = await supabase
    .from("survey_questions")
    .update({ is_active: nextActive })
    .in("id", ids);
  if (error) return { error: error.message };
  revalidatePath(PATH);
  return {};
}

/** 순서 변경 — 같은 scope(+그룹) 안에서만 바로 위/아래 문항과 display_order
 *  를 맞바꾼다(공통/그룹별로 화면이 구분돼 있으므로 순서도 그 안에서만 의미있음). */
export async function moveQuestion(
  id: string,
  direction: "up" | "down",
): Promise<{ error?: string }> {
  await requireRole("staff");
  const supabase = await createClient();

  const { data: target, error: targetErr } = await supabase
    .from("survey_questions")
    .select("id, scope, survey_group")
    .eq("id", id)
    .maybeSingle<{ id: string; scope: QuestionScope; survey_group: string | null }>();
  if (targetErr) return { error: targetErr.message };
  if (!target) return { error: "문항을 찾을 수 없습니다." };

  let listQuery = supabase
    .from("survey_questions")
    .select("id, display_order")
    .eq("scope", target.scope)
    .order("display_order", { ascending: true })
    .order("id", { ascending: true });
  listQuery = target.survey_group
    ? listQuery.eq("survey_group", target.survey_group)
    : listQuery.is("survey_group", null);

  const { data: rows, error: listErr } = await listQuery.returns<
    { id: string; display_order: number }[]
  >();
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

export async function listSurveyGroups(): Promise<SurveyQuestionGroup[]> {
  await requireRole("staff");
  const supabase = await createClient();
  const { data } = await supabase
    .from("survey_question_groups")
    .select("*")
    .order("display_order", { ascending: true })
    .returns<SurveyQuestionGroup[]>();
  return data ?? [];
}
