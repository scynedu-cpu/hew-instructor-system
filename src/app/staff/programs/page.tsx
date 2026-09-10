import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Program } from "@/lib/types";
import { ProgramManager } from "./program-manager";

export default async function StaffProgramsPage() {
  await requireRole("staff");
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("programs")
    .select("*")
    .order("category", { ascending: true })
    .order("sub_program", { ascending: true, nullsFirst: true })
    .returns<Program[]>();

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-bold">프로그램 관리</h1>
        <p className="mt-1 text-sm text-muted">
          매년 HEW 가 조정하는 기준정보입니다. 대분류와 세부항목으로 구성하며,
          완전 삭제 대신 비활성화하면 과거 신청 이력은 그대로 남습니다.
        </p>
      </div>

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error.message}
        </p>
      )}

      <ProgramManager programs={data ?? []} />
    </div>
  );
}
