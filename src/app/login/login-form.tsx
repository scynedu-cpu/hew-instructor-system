"use client";

import { useActionState } from "react";
import { login, type LoginState } from "./actions";

const initial: LoginState = {};

export function LoginForm() {
  const [state, formAction, pending] = useActionState(login, initial);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        이메일
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          className="rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand"
        />
      </label>

      <label className="flex flex-col gap-1.5 text-sm font-medium">
        비밀번호
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand"
        />
      </label>

      {state.error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="mt-1 rounded-md bg-brand px-3 py-2.5 text-sm font-semibold text-brand-fg transition-colors hover:bg-blue-800 disabled:opacity-60"
      >
        {pending ? "로그인 중…" : "로그인"}
      </button>
    </form>
  );
}
