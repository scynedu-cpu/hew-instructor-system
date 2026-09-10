import { getSchoolContext } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";

export default async function SchoolLayout({ children }: LayoutProps<"/school">) {
  const ctx = await getSchoolContext();

  const nav = ctx.readOnly
    ? [
        { href: "/school", label: "신청 목록" },
        { href: "/staff/preview?target=school", label: "다른 학교 선택" },
        { href: "/staff/requests", label: "담당자 화면으로" },
      ]
    : [{ href: "/school", label: "신청 목록" }];

  return (
    <AppShell
      roleLabel={ctx.readOnly ? "담당자 · 학교화면 미리보기" : "학교"}
      userName={`${ctx.schoolName}${
        ctx.readOnly ? "" : ` · ${ctx.viewer.account.display_name ?? ""}`
      }`}
      nav={nav}
    >
      {ctx.readOnly && (
        <div className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          미리보기 모드입니다 — <b>{ctx.schoolName}</b> 계정이 보는 화면. 조회만
          가능합니다.
        </div>
      )}
      {children}
    </AppShell>
  );
}
