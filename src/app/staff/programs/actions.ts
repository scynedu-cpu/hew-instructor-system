"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import type { SurveyGroupCode } from "@/lib/types";

export interface ProgramFormState {
  error?: string;
  ok?: string;
}

const GROUP_CODES: SurveyGroupCode[] = ["A", "B", "C", "D", "E"];

/**
 * 대분류 1개 + 세부항목 0개 이상 → programs row 생성.
 * 세부항목 없으면 대분류만 1건, 있으면 세부항목마다 1건.
 * matching_keyword 는 DB 가 자동계산(sub_program ?? category).
 * survey_group(설문 문항 그룹, #013-1) 은 대분류 단위로 하나 지정해 세부항목
 * 전체에 동일하게 적용 — DB 컬럼이 NOT NULL 이라 필수 입력.
 */
export async function createProgram(
  _prev: ProgramFormState,
  formData: FormData,
): Promise<ProgramFormState> {
  await requireRole("staff");

  const category = String(formData.get("category") ?? "").trim();
  const surveyGroup = String(formData.get("survey_group") ?? "");
  const subs = formData
    .getAll("sub_program")
    .map((s) => String(s).trim())
    .filter(Boolean);

  if (!category) return { error: "대분류를 입력하세요." };
  if (!GROUP_CODES.includes(surveyGroup as SurveyGroupCode)) {
    return { error: "설문 문항 그룹을 선택하세요." };
  }

  const rows: {
    name: string;
    category: string;
    sub_program: string | null;
    survey_group: string;
  }[] =
    subs.length === 0
      ? [{ name: category, category, sub_program: null, survey_group: surveyGroup }]
      : subs.map((sub) => ({
          name: `${category} · ${sub}`,
          category,
          sub_program: sub,
          survey_group: surveyGroup,
        }));

  const supabase = await createClient();
  const { error } = await supabase.from("programs").insert(rows);
  if (error) return { error: error.message };

  revalidatePath("/staff/programs");
  return {
    ok:
      subs.length === 0
        ? `"${category}" 프로그램을 추가했습니다.`
        : `"${category}" 대분류에 세부항목 ${subs.length}개를 추가했습니다.`,
  };
}

export async function toggleProgramActive(
  id: string,
  nextActive: boolean,
): Promise<{ error?: string }> {
  await requireRole("staff");
  const supabase = await createClient();
  const { error } = await supabase
    .from("programs")
    .update({ is_active: nextActive })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/staff/programs");
  return {};
}
