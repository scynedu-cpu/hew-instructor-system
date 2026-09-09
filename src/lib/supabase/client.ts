import { createBrowserClient } from "@supabase/ssr";

/** 클라이언트 컴포넌트용 Supabase 클라이언트 (로그인 폼 등). */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
