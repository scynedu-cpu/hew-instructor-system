import { requireRole } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";

export default async function StaffLayout({ children }: LayoutProps<"/staff">) {
  const { account } = await requireRole("staff");

  return (
    <AppShell
      roleLabel="담당자"
      userName={account.display_name ?? "담당자"}
      nav={[
        { href: "/staff", label: "오늘의 현황" },
        { href: "/staff/requests", label: "교육 신청 관리" },
        { href: "/staff/assignments", label: "강사 배정" },
        { href: "/staff/calendar", label: "캘린더" },
        {
          label: "설문관리",
          children: [
            { href: "/staff/survey-results", label: "설문 결과" },
            { href: "/staff/survey-questions", label: "설문 문항 관리" },
          ],
        },
        {
          label: "강사관리",
          children: [
            { href: "/staff/instructors", label: "강사 계정" },
            { href: "/staff/instructors/dashboard", label: "강사 현황" },
            { href: "/staff/payments", label: "강사료 정산" },
          ],
        },
        {
          label: "관리자",
          children: [
            { href: "/staff/programs", label: "프로그램 관리" },
            { href: "/staff/proxy", label: "대리입력" },
          ],
        },
        // 학교·강사 미리보기 — 당분간 미사용으로 메뉴 숨김(기능은 /staff/preview
        // 에 비활성 안내로 남겨둠, 필요해지면 이 줄만 되살리면 됨)
      ]}
    >
      {children}
    </AppShell>
  );
}
