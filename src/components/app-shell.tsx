import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { LogoutButton } from "./logout-button";

export interface NavItem {
  href?: string;
  label: string;
  /** 있으면 href 대신 드롭다운 그룹으로 렌더링(호버 시 하위 메뉴 표시) */
  children?: NavItem[];
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
            <Link href="/" className="flex items-center gap-2">
              <Image
                src="/hew-logo.png"
                alt="HEW"
                width={320}
                height={57}
                priority
                className="h-7 w-auto"
              />
              <span className="text-sm font-bold text-muted">강사·스케줄 관리</span>
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
            {nav.map((item) =>
              item.children && item.children.length > 0 ? (
                <div key={item.label} className="group relative">
                  <button
                    type="button"
                    className="flex items-center gap-1 border-b-2 border-transparent px-3 py-2 text-sm text-muted hover:text-foreground"
                  >
                    {item.label}
                    <span className="text-xs">▾</span>
                  </button>
                  <div className="absolute left-0 top-full z-10 hidden min-w-[10rem] flex-col rounded-md border border-border bg-surface py-1 shadow-md group-hover:flex">
                    {item.children.map((child) => (
                      <Link
                        key={child.href}
                        href={child.href ?? "#"}
                        className="px-3 py-2 text-sm text-muted hover:bg-zinc-50 hover:text-foreground"
                      >
                        {child.label}
                      </Link>
                    ))}
                  </div>
                </div>
              ) : (
                <Link
                  key={item.href}
                  href={item.href ?? "#"}
                  className="border-b-2 border-transparent px-3 py-2 text-sm text-muted hover:text-foreground"
                >
                  {item.label}
                </Link>
              ),
            )}
          </nav>
        )}
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
