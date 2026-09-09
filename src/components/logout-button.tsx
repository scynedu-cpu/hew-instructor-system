"use client";

import { useTransition } from "react";
import { logout } from "@/app/login/actions";

export function LogoutButton() {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      onClick={() => startTransition(() => logout())}
      disabled={pending}
      className="text-sm text-muted hover:text-foreground disabled:opacity-60"
    >
      로그아웃
    </button>
  );
}
