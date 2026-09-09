import { createClient } from "@supabase/supabase-js";

/**
 * 서비스 롤 클라이언트 — RLS 를 우회하고 Auth 관리자 API(inviteUserByEmail 등)를 쓴다.
 * ⚠ 서버(서버 액션/라우트 핸들러)에서만 import 할 것. 절대 클라이언트로 새어나가면 안 됨.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY 가 설정되지 않았습니다 (.env.local).",
    );
  }
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
