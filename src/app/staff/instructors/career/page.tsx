// 작업지시서 #019 — 강사별 강의이력 조회 및 경력증명서 발급

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { CareerClient } from "./career-client";

export default async function InstructorCareerPage() {
  await requireRole("staff");
  const supabase = await createClient();

  const { data: instructors } = await supabase
    .from("instructors")
    .select("id,name")
    .order("name")
    .returns<{ id: string; name: string }[]>();

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-bold">강의이력 · 경력증명서</h1>
        <p className="mt-1 text-sm text-muted">
          강사를 선택하면 완료된 강의 이력을 조회하고, 기간을 지정해
          경력(강의)증명서를 PDF로 발급합니다.
        </p>
      </div>

      <CareerClient instructors={instructors ?? []} />
    </div>
  );
}
