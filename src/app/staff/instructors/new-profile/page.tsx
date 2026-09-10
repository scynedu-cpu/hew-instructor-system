import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { NewProfileForm } from "./new-profile-form";

export default async function NewInstructorProfilePage() {
  await requireRole("staff");
  return (
    <div className="flex max-w-md flex-col gap-5">
      <div>
        <Link
          href="/staff/instructors"
          className="text-sm text-muted hover:underline"
        >
          ← 강사 계정
        </Link>
        <h1 className="mt-1 text-xl font-bold">계정 없이 강사 등록 (대리입력)</h1>
        <p className="mt-1 text-sm text-muted">
          계정 발급·초대 없이 강사 프로필만 만듭니다. 저장하면 이어서 경력·자격증·
          전문분야·서류를 대리입력할 수 있습니다. (계정 발급은 시스템 오픈 후 별도
          진행)
        </p>
      </div>
      <NewProfileForm />
    </div>
  );
}
