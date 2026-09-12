import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { InstructorProfileForm } from "@/components/instructor-profile-form";

/** 작업지시서 #008-2 — "파일/사진으로 시작": AI 자동채움으로 기본정보까지
 *  채운 뒤 저장 한 번으로 instructors row 와 하위 정보를 함께 생성한다. */
export default async function NewInstructorProfileUploadPage() {
  await requireRole("staff");
  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <div>
        <Link
          href="/staff/instructors/new-profile"
          className="text-sm text-link hover:underline"
        >
          ← 시작 방법 선택
        </Link>
        <h1 className="mt-1 text-xl font-bold">파일/사진으로 시작</h1>
        <p className="mt-1 text-sm text-muted">
          강사카드 문서(.hwp·.hwpx)나 사진·스캔 이미지를 올리면 성명·연락처 등
          기본정보부터 경력·자격증·전문분야까지 한 번에 채웁니다. 내용을
          확인·수정한 뒤 저장을 누르면 그때 강사 프로필이 만들어집니다.
        </p>
      </div>
      <InstructorProfileForm
        instructor={null}
        career={[]}
        certs={[]}
        specialties={[]}
      />
    </div>
  );
}
