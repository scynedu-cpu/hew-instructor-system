import Link from "next/link";
import type { ReactNode } from "react";
import { LogoutButton } from "./logout-button";

export interface NavItem {
  href: string;
  label: string;
}

export function AppShell({
  roleLabel,
  userName,
  nav,
  children,
}: {
  roleLabel: string;
  userName: string;
  nav?: NavItem[];
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-sm font-bold">
              HEW 강사·스케줄 관리
            </Link>
            <span className="badge bg-zinc-100 text-zinc-600">{roleLabel}</span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-muted">{userName}</span>
            <LogoutButton />
          </div>
        </div>
        {nav && nav.length > 0 && (
          <nav className="mx-auto flex w-full max-w-5xl gap-1 px-4">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="border-b-2 border-transparent px-3 py-2 text-sm text-muted hover:text-foreground"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        )}
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
