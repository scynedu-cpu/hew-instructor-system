import Link from "next/link";

const TABS = [
  { key: "initial", label: "초기 배정", href: "/staff/assignments" },
  { key: "final", label: "최종확정", href: "/staff/assignments/final" },
] as const;

export function AssignmentTabs({ active }: { active: "initial" | "final" }) {
  return (
    <div className="flex flex-wrap gap-1 border-b border-border">
      {TABS.map((t) => {
        const isActive = t.key === active;
        return (
          <Link
            key={t.key}
            href={t.href}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${
              isActive
                ? "border-brand font-semibold text-brand"
                : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
