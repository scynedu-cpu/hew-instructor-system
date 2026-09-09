"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Phase = "loading" | "ready" | "invalid" | "done";

export default function SetPasswordPage() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const supabase = createClient();

    async function establishSession() {
      // 1) 이미 세션이 있으면 그대로
      const existing = await supabase.auth.getSession();
      if (existing.data.session) return true;

      const url = new URL(window.location.href);

      // 2) 해시(implicit): #access_token=...&refresh_token=...
      const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
      const accessToken = hash.get("access_token");
      const refreshToken = hash.get("refresh_token");
      if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        window.history.replaceState(null, "", url.pathname);
        return !error;
      }

      // 3) 쿼리(pkce): ?code=...
      const code = url.searchParams.get("code");
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        window.history.replaceState(null, "", url.pathname);
        return !error;
      }

      return false;
    }

    establishSession().then((ok) => setPhase(ok ? "ready" : "invalid"));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (pw.length < 8) return setError("비밀번호는 8자 이상이어야 합니다.");
    if (pw !== pw2) return setError("비밀번호가 일치하지 않습니다.");

    setSubmitting(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password: pw });
    setSubmitting(false);
    if (error) return setError(error.message);
    setPhase("done");
    // 세션이 잡혀 있으므로 홈으로 가면 역할(instructor)에 맞는 화면으로 분기
    setTimeout(() => (window.location.href = "/"), 800);
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-background px-4 py-16">
      <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-8 shadow-sm">
        <h1 className="text-lg font-bold">비밀번호 설정</h1>
        <p className="mt-1 text-sm text-muted">HEW 강사·스케줄 관리</p>

        {phase === "loading" && (
          <p className="mt-6 text-sm text-muted">초대 링크 확인 중…</p>
        )}

        {phase === "invalid" && (
          <p className="mt-6 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            초대 링크가 유효하지 않거나 만료되었습니다. 담당자에게 재발송을
            요청하세요.
          </p>
        )}

        {phase === "done" && (
          <p className="mt-6 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
            비밀번호가 설정되었습니다. 이동 중…
          </p>
        )}

        {phase === "ready" && (
          <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              새 비밀번호
              <input
                type="password"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                autoComplete="new-password"
                className="rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              비밀번호 확인
              <input
                type="password"
                value={pw2}
                onChange={(e) => setPw2(e.target.value)}
                autoComplete="new-password"
                className="rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand"
              />
            </label>
            {error && (
              <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={submitting}
              className="rounded-md bg-brand px-3 py-2.5 text-sm font-semibold text-brand-fg hover:bg-blue-800 disabled:opacity-60"
            >
              {submitting ? "설정 중…" : "비밀번호 설정하고 시작하기"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
