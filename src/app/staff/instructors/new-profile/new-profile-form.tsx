"use client";

import { useActionState } from "react";
import Link from "next/link";
import { createInstructorProfile, type NewProfileState } from "../actions";

const initial: NewProfileState = {};

export function NewProfileForm() {
  const [state, formAction, pending] = useActionState(
    createInstructorProfile,
    initial,
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        성명 <span className="text-red-600">*</span>
        <input
          name="name"
          required
          className="rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand"
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        휴대전화 <span className="font-normal text-muted">선택</span>
        <input
          name="mobile_phone"
          placeholder="010-0000-0000"
          className="rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand"
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        이메일 <span className="font-normal text-muted">선택</span>
        <input
          name="email"
          type="email"
          className="rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand"
        />
      </label>

      {state.error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-brand px-4 py-2.5 text-sm font-semibold text-brand-fg hover:bg-blue-800 disabled:opacity-60"
        >
          {pending ? "생성 중…" : "생성하고 대리입력 계속"}
        </button>
        <Link
          href="/staff/instructors"
          className="rounded-md border border-border px-4 py-2.5 text-sm font-medium hover:bg-zinc-50"
        >
          취소
        </Link>
      </div>
    </form>
  );
}
