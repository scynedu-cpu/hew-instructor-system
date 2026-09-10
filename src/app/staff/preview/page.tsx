import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Instructor, School } from "@/lib/types";
import { pickSchool, pickInstructor } from "./actions";

export default async function StaffPreviewPage({
  searchParams,
}: PageProps<"/staff/preview">) {
  await requireRole("staff");
  const { target } = await searchParams;
  const supabase = await createClient();

  const [{ data: schools }, { data: instructors }] = await Promise.all([
    supabase
      .from("schools")
      .select("id,name,level")
      .order("name")
      .returns<School[]>(),
    supabase
      .from("instructors")
      .select("id,name,status")
      .order("name")
      .returns<Instructor[]>(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold">학교 / 강사 화면 미리보기</h1>
        <p className="mt-1 text-sm text-muted">
          담당자 권한으로 학교·강사가 보는 화면을 그대로 열어봅니다. 미리보기
          모드에서는 <span className="font-medium">조회만 가능</span>하고 수정·제출은
          되지 않습니다.
        </p>
      </div>

      <section
        className={`rounded-lg border bg-surface p-4 ${
          target === "school" ? "border-brand" : "border-border"
        }`}
      >
        <h2 className="mb-3 font-semibold">학교 화면으로 보기</h2>
        <div className="flex flex-wrap gap-2">
          {(schools ?? []).map((s) => (
            <form key={s.id} action={pickSchool}>
              <input type="hidden" name="id" value={s.id} />
              <button
                type="submit"
                className="rounded-md border border-border px-3 py-1.5 text-sm hover:border-brand hover:bg-blue-50"
              >
                {s.name}
                <span className="ml-1 text-xs text-muted">{s.level}</span>
              </button>
            </form>
          ))}
          {(!schools || schools.length === 0) && (
            <span className="text-sm text-muted">등록된 학교가 없습니다.</span>
          )}
        </div>
      </section>

      <section
        className={`rounded-lg border bg-surface p-4 ${
          target === "instructor" ? "border-brand" : "border-border"
        }`}
      >
        <h2 className="mb-3 font-semibold">강사 화면으로 보기</h2>
        <div className="flex flex-wrap gap-2">
          {(instructors ?? []).map((i) => (
            <form key={i.id} action={pickInstructor}>
              <input type="hidden" name="id" value={i.id} />
              <button
                type="submit"
                className="rounded-md border border-border px-3 py-1.5 text-sm hover:border-brand hover:bg-blue-50"
              >
                {i.name}
                {i.status === "inactive" && (
                  <span className="ml-1 text-xs text-muted">비활성</span>
                )}
              </button>
            </form>
          ))}
          {(!instructors || instructors.length === 0) && (
            <span className="text-sm text-muted">등록된 강사가 없습니다.</span>
          )}
        </div>
      </section>
    </div>
  );
}
