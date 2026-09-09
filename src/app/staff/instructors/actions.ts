"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export interface InviteState {
  error?: string;
  ok?: string;
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

async function appOrigin() {
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}

export async function inviteInstructor(
  _prev: InviteState,
  formData: FormData,
): Promise<InviteState> {
  await requireRole("staff");

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();

  if (!name) return { error: "성명을 입력하세요." };
  if (!EMAIL_RE.test(email)) return { error: "올바른 이메일 주소를 입력하세요." };

  const admin = createAdminClient();

  // 중복 확인 — 이미 이 이메일의 강사가 등록/초대돼 있는지
  const { data: dupe } = await admin
    .from("instructors")
    .select("id")
    .ilike("email", email)
    .limit(1);
  if (dupe && dupe.length > 0) {
    return { error: "이미 등록되었거나 초대된 이메일입니다." };
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

  // 2) instructors row (성명·이메일만)
  const { data: ins, error: insErr } = await admin
    .from("instructors")
    .insert({ name, email })
    .select("id")
    .single();

  if (insErr || !ins) {
    await admin.auth.admin.deleteUser(userId);
    return { error: `강사 등록 실패: ${insErr?.message ?? ""}` };
  }

  // 3) app_accounts 매핑
  const { error: accErr } = await admin.from("app_accounts").insert({
    id: userId,
    role: "instructor",
    instructor_id: ins.id,
    display_name: name,
  });

  if (accErr) {
    await admin.from("instructors").delete().eq("id", ins.id);
    await admin.auth.admin.deleteUser(userId);
    return { error: `계정 연결 실패: ${accErr.message}` };
  }

  revalidatePath("/staff/instructors");
  return { ok: `${name} 님에게 초대 메일을 보냈습니다. (${email})` };
}
