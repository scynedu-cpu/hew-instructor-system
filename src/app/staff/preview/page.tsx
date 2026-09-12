import { requireRole } from "@/lib/auth";

// 학교·강사 화면 미리보기 — 당분간 미사용으로 비활성화.
// 되살리려면: git 이력에서 이 파일과 actions.ts 의 pickSchool/pickInstructor,
// staff/layout.tsx 의 nav 항목, lib/auth.ts 의 getSchoolContext/
// getInstructorContext 리다이렉트 대상을 함께 복원하면 된다.
export default async function StaffPreviewPage() {
  await requireRole("staff");

  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-xl font-bold">학교 / 강사 화면 미리보기</h1>
      <p className="rounded-md bg-zinc-100 px-3 py-2 text-sm text-muted">
        이 기능은 당분간 사용하지 않습니다.
      </p>
    </div>
  );
}
