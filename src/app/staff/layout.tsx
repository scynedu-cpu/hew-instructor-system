import { requireRole } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";

export default async function StaffLayout({ children }: LayoutProps<"/staff">) {
  const { account } = await requireRole("staff");

  return (
    <AppShell
      roleLabel="담당자"
      userName={account.display_name ?? "담당자"}
      nav={[
        { href: "/staff/requests", label: "교육 신청 관리" },
        { href: "/staff/assignments", label: "강사 배정" },
        { href: "/staff/calendar", label: "캘린더" },
        { href: "/staff/instructors", label: "강사 계정" },
      ]}
    >
      {children}
    </AppShell>
  );
}
