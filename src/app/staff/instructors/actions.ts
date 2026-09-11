"use server";

import { headers, cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole, PROXY_INSTRUCTOR_COOKIE } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export interface InviteState {
  error?: string;
  ok?: string;
}

const PROXY_COOKIE_OPTS = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 8,
};

/** 대리입력 모드 진입 — 이 강사의 /instructor 화면을 staff 가 직접 편집 */
export async function pickInstructorForEdit(formData: FormData) {
  await requireRole("staff");
  const id = String(formData.get("id") ?? "");
  if (!id) redirect("/staff/instructors");
  const jar = await cookies();
  jar.set(PROXY_INSTRUCTOR_COOKIE, id, PROXY_COOKIE_OPTS);
  redirect(`/staff/instructors/${id}/edit`);
}

/** 대리입력 모드 종료 */
export async function stopProxyEdit() {
  await requireRole("staff");
  const jar = await cookies();
  jar.delete(PROXY_INSTRUCTOR_COOKIE);
  redirect("/staff/instructors");
}

export interface NewProfileState {
  error?: string;
}

/** 계정·초대 없이 강사 프로필(instructors row)만 생성 → 바로 대리입력 편집으로 */
export async function createInstructorProfile(
  _prev: NewProfileState,
  formData: FormData,
): Promise<NewProfileState> {
  await requireRole("staff");
  const name = String(formData.get("name") ?? "").trim();
  const mobile = String(formData.get("mobile_phone") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!name) return { error: "성명을 입력하세요." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("instructors")
    .insert({
      name,
      mobile_phone: mobile || null,
      email: email || null,
    })
    .select("id")
    .single();

  if (error || !data) return { error: `생성 실패: ${error?.message ?? ""}` };

  const jar = await cookies();
  jar.set(PROXY_INSTRUCTOR_COOKIE, data.id, PROXY_COOKIE_OPTS);
  revalidatePath("/staff/instructors");
  redirect(`/staff/instructors/${data.id}/edit`);
}

export interface SaveProfileState {
  error?: string;
  ok?: string;
}

interface CareerItem {
  year_month: string;
  description: string;
  issuing_org: string;
}
interface CertItem {
  cert_name: string;
  issued_date: string;
  issuing_org: string;
}

/** 대리입력 통합 저장 — 기본정보 + 경력/자격증/전문분야 전체 교체 */
export async function saveInstructorProfile(
  instructorId: string,
  payload: {
    name: string;
    birth_date: string;
    address: string;
    home_phone: string;
    mobile_phone: string;
    email: string;
    career: CareerItem[];
    certs: CertItem[];
    specialties: string[];
  },
): Promise<SaveProfileState> {
  await requireRole("staff");
  if (!instructorId) return { error: "잘못된 요청입니다." };
  const name = payload.name.trim();
  if (!name) return { error: "성명은 필수입니다." };

  const supabase = await createClient();

  const { error: baseErr } = await supabase
    .from("instructors")
    .update({
      name,
      birth_date: payload.birth_date || null,
      address: payload.address.trim() || null,
      home_phone: payload.home_phone.trim() || null,
      mobile_phone: payload.mobile_phone.trim() || null,
      email: payload.email.trim() || null,
    })
    .eq("id", instructorId);
  if (baseErr) return { error: baseErr.message };

  // 경력 전체 교체
  await supabase
    .from("instructor_career_history")
    .delete()
    .eq("instructor_id", instructorId);
  const career = payload.career
    .filter((c) => c.description.trim())
    .map((c) => ({
      instructor_id: instructorId,
      year_month: c.year_month.trim() || null,
      description: c.description.trim(),
      issuing_org: c.issuing_org.trim() || null,
    }));
  if (career.length > 0) {
    const { error } = await supabase
      .from("instructor_career_history")
      .insert(career);
    if (error) return { error: error.message };
  }

  // 자격증 전체 교체
  await supabase
    .from("instructor_certifications")
    .delete()
    .eq("instructor_id", instructorId);
  const certs = payload.certs
    .filter((c) => c.cert_name.trim())
    .map((c) => ({
      instructor_id: instructorId,
      cert_name: c.cert_name.trim(),
      issued_date: c.issued_date || null,
      issuing_org: c.issuing_org.trim() || null,
    }));
  if (certs.length > 0) {
    const { error } = await supabase
      .from("instructor_certifications")
      .insert(certs);
    if (error) return { error: error.message };
  }

  // 전문분야 전체 교체
  await supabase
    .from("instructor_specialties")
    .delete()
    .eq("instructor_id", instructorId);
  const specs = [...new Set(payload.specialties.map((s) => s.trim()).filter(Boolean))].map(
    (specialty) => ({ instructor_id: instructorId, specialty }),
  );
  if (specs.length > 0) {
    const { error } = await supabase
      .from("instructor_specialties")
      .insert(specs);
    if (error) return { error: error.message };
  }

  revalidatePath(`/staff/instructors/${instructorId}/edit`);
  revalidatePath("/staff/instructors");
  return { ok: "저장했습니다." };
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

async function appOrigin() {
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}

/**
 * 강사 초대 — 작업지시서 #003-2.
 * `instructor_id` 가 넘어오면(강사 목록의 "계정 초대" 버튼) 대리입력으로 이미
 * 등록해둔 그 `instructors` row 에 계정을 연결한다(새 row 를 만들지 않음) —
 * 그래야 이미 입력해둔 경력·자격증·전문분야·서류가 강사 본인 로그인 후에도
 * 그대로 보인다. `instructor_id` 없이(완전 신규 강사) 호출되면 기존처럼
 * `instructors` row 를 새로 만든다.
 */
export async function inviteInstructor(
  _prev: InviteState,
  formData: FormData,
): Promise<InviteState> {
  await requireRole("staff");

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const instructorId = String(formData.get("instructor_id") ?? "").trim() || null;

  if (!name) return { error: "성명을 입력하세요." };
  if (!EMAIL_RE.test(email)) return { error: "올바른 이메일 주소를 입력하세요." };

  const admin = createAdminClient();

  if (instructorId) {
    // 기존 프로필에 계정 연결 ------------------------------------------------
    const { data: target } = await admin
      .from("instructors")
      .select("id")
      .eq("id", instructorId)
      .maybeSingle();
    if (!target) return { error: "대상 강사를 찾을 수 없습니다." };

    const { data: existingAcc } = await admin
      .from("app_accounts")
      .select("id")
      .eq("instructor_id", instructorId)
      .maybeSingle();
    if (existingAcc) return { error: "이미 계정이 발급된 강사입니다." };

    const { data: dupe } = await admin
      .from("instructors")
      .select("id")
      .ilike("email", email)
      .neq("id", instructorId)
      .limit(1);
    if (dupe && dupe.length > 0) {
      return { error: "이미 등록되었거나 초대된 이메일입니다." };
    }
  } else {
    // 완전 신규 강사 ---------------------------------------------------------
    // 이메일 중복
    const { data: dupe } = await admin
      .from("instructors")
      .select("id")
      .ilike("email", email)
      .limit(1);
    if (dupe && dupe.length > 0) {
      return { error: "이미 등록되었거나 초대된 이메일입니다." };
    }
    // 동명(同名) 계정 없는 프로필이 이미 있으면 중복 생성 방지 — 강사 목록에서
    // "계정 초대"로 진행하도록 안내
    const { data: sameName } = await admin
      .from("instructors")
      .select("id")
      .eq("name", name);
    if (sameName && sameName.length > 0) {
      const ids = sameName.map((r) => r.id);
      const { data: accs } = await admin
        .from("app_accounts")
        .select("instructor_id")
        .in("instructor_id", ids);
      const linkedIds = new Set((accs ?? []).map((a) => a.instructor_id));
      if (sameName.some((r) => !linkedIds.has(r.id))) {
        return {
          error: `이미 '${name}' 강사가 프로필로 등록되어 있습니다. 강사 목록에서 이 강사의 "계정 초대" 버튼으로 진행하세요.`,
        };
      }
    }
  }

  // 기존 프로필이면 초대 전에 이름·이메일을 먼저 반영(안전한 메타데이터 수정 —
  // 이후 단계가 실패해도 굳이 되돌릴 필요 없음)
  if (instructorId) {
    const { error: updErr } = await admin
      .from("instructors")
      .update({ name, email })
      .eq("id", instructorId);
    if (updErr) return { error: `강사 정보 갱신 실패: ${updErr.message}` };
  }

  const redirectTo = `${await appOrigin()}/auth/set-password`;

  // 1) Auth 초대 메일 발송 (+ auth user 생성)
  const { data: invited, error: inviteErr } =
    await admin.auth.admin.inviteUserByEmail(email, {
      data: { name, role: "instructor" },
      redirectTo,
    });

  if (inviteErr || !invited?.user) {
    const msg = inviteErr?.message ?? "";
    if (
      inviteErr?.status === 422 ||
      /registered|already|exists/i.test(msg)
    ) {
      return { error: "이미 등록되었거나 초대된 이메일입니다." };
    }
    return { error: `초대 실패: ${msg || "알 수 없는 오류"}` };
  }

  const userId = invited.user.id;

  // 2) instructors row — 기존 프로필이면 재사용, 아니면 새로 생성(성명·이메일만)
  let targetInstructorId: string;
  if (instructorId) {
    targetInstructorId = instructorId;
  } else {
    const { data: ins, error: insErr } = await admin
      .from("instructors")
      .insert({ name, email })
      .select("id")
      .single();
    if (insErr || !ins) {
      await admin.auth.admin.deleteUser(userId);
      return { error: `강사 등록 실패: ${insErr?.message ?? ""}` };
    }
    targetInstructorId = ins.id;
  }

  // 3) app_accounts 매핑
  const { error: accErr } = await admin.from("app_accounts").insert({
    id: userId,
    role: "instructor",
    instructor_id: targetInstructorId,
    display_name: name,
  });

  if (accErr) {
    // 기존 프로필(instructorId 있음)은 강사가 미리 입력해둔 실제 데이터라
    // 지우지 않는다 — auth user 만 롤백
    if (!instructorId) {
      await admin.from("instructors").delete().eq("id", targetInstructorId);
    }
    await admin.auth.admin.deleteUser(userId);
    return { error: `계정 연결 실패: ${accErr.message}` };
  }

  revalidatePath("/staff/instructors");
  return { ok: `${name} 님에게 초대 메일을 보냈습니다. (${email})` };
}
