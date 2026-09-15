import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { School } from "@/lib/types";
import { SchoolManager } from "./school-manager";

export default async function StaffSchoolsPage() {
  await requireRole("staff");
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("schools")
    .select("*")
    .order("name", { ascending: true })
    .returns<School[]>();

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-bold">학교 관리</h1>
        <p className="mt-1 text-sm text-muted">
          교육 신청서를 받으려면 학교가 먼저 여기 등록되어 있어야 합니다.
          등록된 학교만 &quot;학교 신청 대리입력&quot;의 학교 선택 목록과 AI
          자동채움의 학교명 자동 선택 대상이 됩니다.
        </p>
      </div>

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error.message}
        </p>
      )}

      <SchoolManager schools={data ?? []} />
    </div>
  );
}
