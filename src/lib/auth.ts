import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { AccountRole, AppAccount } from "@/lib/types";

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
      return "/staff/requests";
    case "school":
      return "/school";
    case "instructor":
      return "/instructor";
  }
}
