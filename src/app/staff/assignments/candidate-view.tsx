import type { AssignmentCandidateWithInstructor } from "@/lib/types";

/** 후보 1명의 공통 표시 (순위·이름·전문분야·평점·매칭점수). 프리젠테이션 전용. */
export function CandidateInfo({
  candidate,
  requiredSpecialty,
}: {
  candidate: AssignmentCandidateWithInstructor;
  requiredSpecialty: string | null;
}) {
  const ins = candidate.instructor;
  const specialties = ins?.instructor_specialties?.map((s) => s.specialty) ?? [];
  const matched =
    !!requiredSpecialty && specialties.includes(requiredSpecialty);

  return (
    <div className="flex flex-1 flex-col gap-1">
      <div className="flex items-center gap-2">
        <span className="badge bg-brand text-brand-fg">{candidate.rank}순위</span>
        <span className="font-semibold">{ins?.name ?? "(삭제된 강사)"}</span>
        <span className="text-xs text-muted">
          평점 {Number(ins?.rating_avg ?? 0).toFixed(2)}
        </span>
        <span className="ml-auto text-sm font-semibold tabular-nums">
          {Number(candidate.match_score ?? 0).toFixed(2)}점
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {specialties.length === 0 && (
          <span className="text-xs text-muted">전문분야 미등록</span>
        )}
        {specialties.map((s) => (
          <span
            key={s}
            className={`badge ${
              requiredSpecialty && s === requiredSpecialty
                ? "bg-green-100 text-green-800"
                : "bg-zinc-100 text-zinc-600"
            }`}
          >
            {s}
          </span>
        ))}
        <span
          className={`badge ${
            matched ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-800"
          }`}
        >
          {matched ? "전문분야 일치 100" : "전문분야 불일치 0"}
        </span>
      </div>
    </div>
  );
}
