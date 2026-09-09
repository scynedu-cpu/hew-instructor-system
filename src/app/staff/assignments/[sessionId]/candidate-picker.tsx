"use client";

import { useActionState, useState } from "react";
import { selectProvisional, type ActionState } from "../actions";
import { CandidateInfo } from "../candidate-view";
import type { AssignmentCandidateWithInstructor } from "@/lib/types";

const initial: ActionState = {};

export function CandidatePicker({
  sessionId,
  requiredSpecialty,
  candidates,
}: {
  sessionId: string;
  requiredSpecialty: string | null;
  candidates: AssignmentCandidateWithInstructor[];
}) {
  const [state, formAction, pending] = useActionState(
    selectProvisional,
    initial,
  );
  const [picked, setPicked] = useState<string>("");

  if (candidates.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-surface px-4 py-8 text-center text-sm text-muted">
        조건에 맞는 후보 강사가 없습니다. (활성 강사가 없거나 모두 같은 시간대에
        배정됨)
      </div>
    );
  }

  const selected = candidates.find((c) => c.id === picked);

  return (
    <form
      action={formAction}
      className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4"
    >
      <h2 className="font-semibold">추천 후보 (상위 {candidates.length}명)</h2>
      <p className="text-xs text-muted">
        전문분야 일치도 80% + 평점 20% 로 산출한 점수 순입니다. 1명을 선택해
        임시배정하세요.
      </p>

      <input type="hidden" name="session_id" value={sessionId} />
      {selected && (
        <>
          <input
            type="hidden"
            name="candidate_id"
            value={selected.id}
          />
          <input
            type="hidden"
            name="instructor_id"
            value={selected.instructor_id}
          />
        </>
      )}

      <ul className="flex flex-col gap-2">
        {candidates.map((c) => (
          <li key={c.id}>
            <label
              className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 ${
                picked === c.id
                  ? "border-brand bg-blue-50/40"
                  : "border-border hover:bg-zinc-50"
              }`}
            >
              <input
                type="radio"
                name="pick"
                value={c.id}
                checked={picked === c.id}
                onChange={() => setPicked(c.id)}
                className="mt-1"
              />
              <CandidateInfo
                candidate={c}
                requiredSpecialty={requiredSpecialty}
              />
            </label>
          </li>
        ))}
      </ul>

      {state.error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending || !selected}
        className="self-start rounded-md bg-brand px-4 py-2 text-sm font-semibold text-brand-fg hover:bg-blue-800 disabled:opacity-50"
      >
        {pending ? "배정 중…" : "선택한 강사로 임시배정"}
      </button>
    </form>
  );
}
