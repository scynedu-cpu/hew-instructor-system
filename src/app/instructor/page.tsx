import { getInstructorContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type {
  CareerRow,
  CertRow,
  Instructor,
  SpecialtyRow,
} from "@/lib/types";
import { ProfileSection } from "./profile-section";
import { CareerSection } from "./career-section";
import { CertSection } from "./cert-section";
import { SpecialtySection } from "./specialty-section";

export default async function InstructorProfilePage() {
  const ctx = await getInstructorContext();
  const supabase = await createClient();
  const readOnly = ctx.readOnly;

  const { data: instructor } = await supabase
    .from("instructors")
    .select("*")
    .eq("id", ctx.instructorId)
    .maybeSingle<Instructor>();

  if (!instructor) {
    return (
      <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
        강사 정보를 불러오지 못했습니다. 담당자에게 문의하세요.
      </p>
    );
  }

  const [{ data: career }, { data: certs }, { data: specialties }] =
    await Promise.all([
      supabase
        .from("instructor_career_history")
        .select("*")
        .eq("instructor_id", instructor.id)
        .order("year_month", { ascending: false })
        .returns<CareerRow[]>(),
      supabase
        .from("instructor_certifications")
        .select("*")
        .eq("instructor_id", instructor.id)
        .order("issued_date", { ascending: false })
        .returns<CertRow[]>(),
      supabase
        .from("instructor_specialties")
        .select("*")
        .eq("instructor_id", instructor.id)
        .order("specialty")
        .returns<SpecialtyRow[]>(),
    ]);

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-xl font-bold">강사 기본 정보</h1>
      <ProfileSection instructor={instructor} readOnly={readOnly} />
      <CareerSection items={career ?? []} readOnly={readOnly} />
      <CertSection items={certs ?? []} readOnly={readOnly} />
      <SpecialtySection items={specialties ?? []} readOnly={readOnly} />
    </div>
  );
}
