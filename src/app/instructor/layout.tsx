import { getInstructorContext } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";

export default async function InstructorLayout({
  children,
}: LayoutProps<"/instructor">) {
  const ctx = await getInstructorContext();

  const nav = ctx.proxy
    ? [
        { href: "/instructor", label: "기본 정보" },
        { href: "/instructor/documents", label: "제출 서류" },
        { href: `/staff/instructors/${ctx.instructorId}/edit`, label: "대리입력 화면" },
        { href: "/staff/instructors", label: "강사 목록" },
      ]
    : ctx.readOnly
      ? [
          { href: "/instructor", label: "기본 정보" },
          { href: "/instructor/documents", label: "제출 서류" },
          { href: "/staff/preview?target=instructor", label: "다른 강사 선택" },
          { href: "/staff/requests", label: "담당자 화면으로" },
        ]
      : [
          { href: "/instructor", label: "기본 정보" },
          { href: "/instructor/documents", label: "제출 서류" },
        ];

  return (
    <AppShell
      roleLabel={
        ctx.proxy
          ? "담당자 · 강사 대리입력"
          : ctx.readOnly
            ? "담당자 · 강사화면 미리보기"
            : "강사"
      }
      userName={ctx.instructorName}
      nav={nav}
    >
      {ctx.proxy && (
        <div className="mb-4 rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-800">
          <b>{ctx.instructorName}</b> 강사 정보를 대리입력하는 중입니다. 이
          화면에서 입력·저장한 내용은 바로 반영됩니다.
        </div>
      )}
      {ctx.readOnly && (
        <div className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          미리보기 모드입니다 — <b>{ctx.instructorName}</b> 강사가 보는 화면.
          조회만 가능합니다.
        </div>
      )}
      {children}
    </AppShell>
  );
}
