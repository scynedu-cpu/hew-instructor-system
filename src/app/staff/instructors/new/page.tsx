import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { InviteForm } from "../invite-form";

export default async function NewInstructorPage() {
  await requireRole("staff");

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link
          href="/staff/instructors"
          className="text-sm text-link hover:underline"
        >
          ← 강사 계정
        </Link>
        <h1 className="mt-1 text-xl font-bold">신규 강사 등록 (초대)</h1>
      </div>
      <InviteForm />
    </div>
  );
}
