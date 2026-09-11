import Link from "next/link";
import { requireRole } from "@/lib/auth";

/** 작업지시서 #008-2 — 신규 강사 등록 시작점: 업로드 우선 / 직접입력 2가지 선택 */
export default async function NewInstructorProfilePage() {
  await requireRole("staff");
  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <div>
        <Link
          href="/staff/instructors"
          className="text-sm text-muted hover:underline"
        >
          ← 강사 계정
        </Link>
        <h1 className="mt-1 text-xl font-bold">계정 없이 강사 등록 (대리입력)</h1>
        <p className="mt-1 text-sm text-muted">
          계정 발급·초대 없이 강사 프로필만 만듭니다. (계정 발급은 시스템 오픈
          후 별도 진행)
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Link
          href="/staff/instructors/new-profile/upload"
          className="flex flex-col gap-2 rounded-lg border-2 border-brand bg-blue-50/40 p-5 hover:bg-blue-50"
        >
          <span className="text-sm font-semibold text-brand">추천</span>
          <h2 className="text-lg font-bold">파일/사진으로 시작</h2>
          <p className="text-sm text-muted">
            강사카드 문서(.hwp·.hwpx)나 사진·스캔 이미지를 올리면 성명·연락처
            등 기본정보부터 경력·자격증·전문분야까지 AI가 한 번에 채웁니다.
            이미 파일이 있다면 이쪽이 빠릅니다.
          </p>
        </Link>
        <Link
          href="/staff/instructors/new-profile/manual"
          className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-5 hover:bg-zinc-50"
        >
          <h2 className="text-lg font-bold">직접 입력으로 시작</h2>
          <p className="text-sm text-muted">
            올릴 파일이 없을 때 성명부터 직접 입력해서 시작합니다.
          </p>
        </Link>
      </div>
    </div>
  );
}
