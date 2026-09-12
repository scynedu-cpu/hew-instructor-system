"use server";

import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";

// 학교·강사 화면 미리보기 — 당분간 미사용으로 비활성화(page.tsx 참고).
// 쿠키를 세팅하던 기존 로직은 제거하고, 혹시 남아있는 호출부가 있어도
// 아무 화면도 열지 못하도록 미리보기 화면으로만 되돌린다.
export async function pickSchool() {
  await requireRole("staff");
  redirect("/staff/preview");
}

export async function pickInstructor() {
  await requireRole("staff");
  redirect("/staff/preview");
}
