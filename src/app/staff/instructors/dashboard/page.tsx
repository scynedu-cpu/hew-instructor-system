import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { computeStatus, type DocStatus } from "@/lib/documents";
import {
  InstructorDashboardClient,
  type InstructorDashboardRow,
} from "./instructor-dashboard-client";

/** 서류 상태 우선순위 — 강사에게 서류가 여러 건이면 가장 급한 것으로 표시 */
const DOC_STATUS_RANK: Record<DocStatus, number> = {
  valid: 0,
  expiring_soon: 1,
  expired: 2,
};

/** 작업지시서 #010 — 강사풀 현황 대시보드 (staff 전용) */
export default async function InstructorDashboardPage() {
  await requireRole("staff");
  const supabase = await createClient();

  const [
    { data: instructors },
    { data: specialties },
    { data: careers },
    { data: certs },
    { data: docs },
    { data: accounts },
  ] = await Promise.all([
    supabase.from("instructors").select("id,name").order("name"),
    supabase.from("instructor_specialties").select("instructor_id,specialty"),
    supabase.from("instructor_career_history").select("instructor_id"),
    supabase.from("instructor_certifications").select("instructor_id"),
    supabase.from("instructor_documents").select("instructor_id,expires_at"),
    supabase
      .from("app_accounts")
      .select("instructor_id")
      .eq("role", "instructor"),
  ]);

  const specByInstructor = new Map<string, string[]>();
  for (const s of specialties ?? []) {
    const arr = specByInstructor.get(s.instructor_id) ?? [];
    arr.push(s.specialty);
    specByInstructor.set(s.instructor_id, arr);
  }

  const careerCount = new Map<string, number>();
  for (const c of careers ?? []) {
    careerCount.set(c.instructor_id, (careerCount.get(c.instructor_id) ?? 0) + 1);
  }
  const certCount = new Map<string, number>();
  for (const c of certs ?? []) {
    certCount.set(c.instructor_id, (certCount.get(c.instructor_id) ?? 0) + 1);
  }

  // 서류 상태 — 발급 시점에 저장된 status 컬럼은 시간이 지나면 stale 해질 수
  // 있어(#006 에서 확인된 사항) expires_at 으로 매번 다시 계산한다. 강사에게
  // 서류가 여러 건이면 가장 급한(만료 > 임박 > 정상) 상태로 표시.
  const docStatusByInstructor = new Map<string, DocStatus>();
  for (const d of docs ?? []) {
    const st = computeStatus(d.expires_at);
    const prev = docStatusByInstructor.get(d.instructor_id);
    if (!prev || DOC_STATUS_RANK[st] > DOC_STATUS_RANK[prev]) {
      docStatusByInstructor.set(d.instructor_id, st);
    }
  }

  const accountSet = new Set((accounts ?? []).map((a) => a.instructor_id));

  const rows: InstructorDashboardRow[] = (instructors ?? []).map((i) => {
    const specs = specByInstructor.get(i.id) ?? [];
    const infoIncomplete =
      (careerCount.get(i.id) ?? 0) === 0 &&
      (certCount.get(i.id) ?? 0) === 0 &&
      specs.length === 0;
    return {
      id: i.id,
      name: i.name,
      specialties: specs,
      docStatus: docStatusByInstructor.get(i.id) ?? null,
      infoIncomplete,
      noAccount: !accountSet.has(i.id),
    };
  });

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-bold">강사 현황</h1>
        <p className="mt-1 text-sm text-muted">
          서류 만료, 정보 미비, 계정 미발급 등 조치가 필요한 강사를 한눈에
          확인합니다.
        </p>
      </div>
      <InstructorDashboardClient rows={rows} />
    </div>
  );
}
