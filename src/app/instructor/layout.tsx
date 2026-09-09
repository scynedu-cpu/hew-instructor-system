import { requireRole } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";

export default async function InstructorLayout({
  children,
}: LayoutProps<"/instructor">) {
  const { account } = await requireRole("instructor");

  return (
    <AppShell
      roleLabel="강사"
      userName={account.display_name ?? "강사"}
      nav={[
        { href: "/instructor", label: "기본 정보" },
        { href: "/instructor/documents", label: "제출 서류" },
      ]}
    >
      {children}
    </AppShell>
  );
}
