"use client";

import { useActionState } from "react";
import Link from "next/link";
import { inviteInstructor, type InviteState } from "./actions";

const initial: InviteState = {};

export function InviteForm() {
  const [state, formAction, pending] = useActionState(inviteInstructor, initial);

  return (
    <form action={formAction} className="flex max-w-md flex-col gap-4">
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        성명 <span className="text-red-600">*</span>
        <input
          name="name"
          required
          className="rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand"
        />
      </label>

      <label className="flex flex-col gap-1.5 text-sm font-medium">
        이메일 <span className="text-red-600">*</span>
        <input
          name="email"
          type="email"
          required
          placeholder="teacher@example.com"
          className="rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand"
        />
      </label>

      <p className="text-xs text-muted">
        입력한 이메일로 초대 링크가 발송됩니다. 강사가 링크에서 비밀번호를
        설정하면 바로 로그인해 나머지 정보(경력·자격증·전문분야·서류)를 직접
        입력합니다.
      </p>

      {state.error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}
      {state.ok && (
        <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
          {state.ok}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-brand px-4 py-2.5 text-sm font-semibold text-brand-fg hover:bg-blue-800 disabled:opacity-60"
        >
          {pending ? "초대 발송 중…" : "초대 메일 발송"}
        </button>
        <Link
          href="/staff/instructors"
          className="rounded-md border border-border px-4 py-2.5 text-sm font-medium hover:bg-zinc-50"
        >
          목록
        </Link>
      </div>
    </form>
  );
}
