import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { AccountRole, AppAccount } from "@/lib/types";

export const PREVIEW_SCHOOL_COOKIE = "hew_preview_school";
export const PREVIEW_INSTRUCTOR_COOKIE = "hew_preview_instructor";
/** 담당자 대리입력 모드 — 이 강사의 /instructor 화면을 staff 가 직접 편집 (작업지시서 #008) */
export const PROXY_INSTRUCTOR_COOKIE = "hew_proxy_instructor";

export interface CurrentUser {
  userId: string;
  email: string | null;
  account: AppAccount;
}

/**
 * 로그인 사용자 + app_accounts 매핑을 가져온다.
 * 로그인 안 했으면 /login, 계정 매핑이 없으면 /login?error=no_account 로 보낸다.
 */
export async function requireUser(): Promise<CurrentUser> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: account } = await supabase
    .from("app_accounts")
    .select("*")
    .eq("id", user.id)
    .maybeSingle<AppAccount>();

  if (!account) redirect("/login?error=no_account");

  return { userId: user.id, email: user.email ?? null, account };
}

/** 특정 역할만 허용. 아니면 본인 역할의 홈으로 돌려보낸다. */
export async function requireRole(role: AccountRole): Promise<CurrentUser> {
  const current = await requireUser();
  if (current.account.role !== role) redirect(roleHome(current.account.role));
  return current;
}

export function roleHome(role: AccountRole): string {
  switch (role) {
    case "staff":
      // 작업지시서 #018 — staff 로그인 후 랜딩은 운영 모니터링 대시보드
      return "/staff";
    case "school":
      return "/school";
    case "instructor":
      return "/instructor";
  }
}

/* ------------------------------------------------------------------
 * 담당자(staff) 미리보기 컨텍스트
 * - school/instructor 역할: 본인 소속으로 정상 진입 (readOnly=false)
 * - staff: 쿠키에 담긴 대상(school_id / instructor_id)으로 진입 (readOnly=true).
 *   대상이 없으면 /staff/preview 로 보낸다.
 * ------------------------------------------------------------------ */

export interface SchoolContext {
  viewer: CurrentUser;
  schoolId: string;
  schoolName: string;
  readOnly: boolean;
}

export interface InstructorContext {
  viewer: CurrentUser;
  instructorId: string;
  instructorName: string;
  readOnly: boolean;
  /** staff 가 대리입력 모드로 편집 중 (readOnly=false, 하지만 본인 강사가 아님) */
  proxy: boolean;
}

export async function getSchoolContext(): Promise<SchoolContext> {
  const viewer = await requireUser();
  const supabase = await createClient();

  if (viewer.account.role === "school") {
    if (!viewer.account.school_id) redirect("/login?error=no_account");
    const { data } = await supabase
      .from("schools")
      .select("name")
      .eq("id", viewer.account.school_id)
      .maybeSingle<{ name: string }>();
    return {
      viewer,
      schoolId: viewer.account.school_id,
      schoolName: data?.name ?? "우리 학교",
      readOnly: false,
    };
  }

  if (viewer.account.role === "staff") {
    // 학교화면 미리보기는 당분간 비활성화 — 쿠키가 있어도 더 이상 설정될 길이
    // 없으므로 사실상 항상 이 경로. staff 홈으로 되돌린다.
    const jar = await cookies();
    const schoolId = jar.get(PREVIEW_SCHOOL_COOKIE)?.value;
    if (!schoolId) redirect(roleHome("staff"));
    const { data } = await supabase
      .from("schools")
      .select("name")
      .eq("id", schoolId)
      .maybeSingle<{ name: string }>();
    if (!data) redirect(roleHome("staff"));
    return { viewer, schoolId: schoolId!, schoolName: data.name, readOnly: true };
  }

  redirect(roleHome(viewer.account.role));
}

export async function getInstructorContext(): Promise<InstructorContext> {
  const viewer = await requireUser();
  const supabase = await createClient();

  if (viewer.account.role === "instructor") {
    if (!viewer.account.instructor_id) redirect("/login?error=no_account");
    const { data } = await supabase
      .from("instructors")
      .select("name")
      .eq("id", viewer.account.instructor_id)
      .maybeSingle<{ name: string }>();
    return {
      viewer,
      instructorId: viewer.account.instructor_id,
      instructorName: data?.name ?? viewer.account.display_name ?? "강사",
      readOnly: false,
      proxy: false,
    };
  }

  if (viewer.account.role === "staff") {
    const jar = await cookies();
    // 대리입력 모드가 우선 (편집 가능)
    const proxyId = jar.get(PROXY_INSTRUCTOR_COOKIE)?.value;
    if (proxyId) {
      const { data } = await supabase
        .from("instructors")
        .select("name")
        .eq("id", proxyId)
        .maybeSingle<{ name: string }>();
      if (data) {
        return {
          viewer,
          instructorId: proxyId,
          instructorName: data.name,
          readOnly: false,
          proxy: true,
        };
      }
    }
    // 강사화면 미리보기도 당분간 비활성화 — 쿠키가 있어도 더 이상 설정될
    // 길이 없으므로 사실상 항상 이 경로. staff 홈으로 되돌린다.
    const instructorId = jar.get(PREVIEW_INSTRUCTOR_COOKIE)?.value;
    if (!instructorId) redirect(roleHome("staff"));
    const { data } = await supabase
      .from("instructors")
      .select("name")
      .eq("id", instructorId)
      .maybeSingle<{ name: string }>();
    if (!data) redirect(roleHome("staff"));
    return {
      viewer,
      instructorId: instructorId!,
      instructorName: data.name,
      readOnly: true,
      proxy: false,
    };
  }

  redirect(roleHome(viewer.account.role));
}
