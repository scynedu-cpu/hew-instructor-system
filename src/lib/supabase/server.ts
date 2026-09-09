import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * 서버 컴포넌트 / 서버 액션 / 라우트 핸들러에서 쓰는 Supabase 클라이언트.
 * 로그인 사용자의 세션(쿠키)을 그대로 물고 가므로 RLS 가 사용자 기준으로 적용된다.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // 서버 컴포넌트에서 호출된 경우 set 이 막힌다 — proxy 가 세션을 갱신하므로 무시해도 됨.
          }
        },
      },
    },
  );
}
