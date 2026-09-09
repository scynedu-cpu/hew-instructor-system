"use client";

import { useActionState, useState } from "react";
import { confirmFinal, type ActionState } from "../../actions";
import { CandidateInfo } from "../../candidate-view";
import type { AssignmentCandidateWithInstructor, Instructor } from "@/lib/types";

const initial: ActionState = {};

type CurrentInstructor =
  | (Pick<Instructor, "id" | "name" | "rating_avg" | "status"> & {
      instructor_specialties: { specialty: string }[];
    })
  | null;

export function ConfirmPanel({
  assignmentId,
  requiredSpecialty,
  currentInstructorId,
  currentInstructor,
  candidates,
}: {
  assignmentId: string;
  requiredSpecialty: string | null;
  currentInstructorId: string;
  currentInstructor: CurrentInstructor;
  candidates: AssignmentCandidateWithInstructor[];
}) {
  const [state, formAction, pending] = useActionState(confirmFinal, initial);
  // "keep" = 현재 강사 유지, 그 외에는 후보 candidate.id
  const [choice, setChoice] = useState<string>("keep");

  const pickedCandidate = candidates.find((c) => c.id === choice);
  const chosenInstructorId =
    choice === "keep"
      ? currentInstructorId
      : (pickedCandidate?.instructor_id ?? currentInstructorId);
  const isChange = chosenInstructorId !== currentInstructorId;

  const currentSpecialties =
    currentInstructor?.instructor_specialties?.map((s) => s.specialty) ?? [];

  return (
    <form
      action={formAction}
      className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4"
    >
      <h2 className="font-semibold">최종확정</h2>
      <p className="text-xs text-muted">
        후보는 현재 배정 현황(하드필터)을 반영해 다시 계산되었습니다. 임시배정
        강사를 유지하거나 다른 강사로 변경하세요.
      </p>

      <input type="hidden" name="assignment_id" value={assignmentId} />
      <input type="hidden" name="instructor_id" value={chosenInstructorId} />

      {/* 현재 강사 유지 */}
      <label
        className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 ${
          choice === "keep"
            ? "border-brand bg-blue-50/40"
            : "border-border hover:bg-zinc-50"
        }`}
      >
        <input
          type="radio"
          name="choice"
          value="keep"
          checked={choice === "keep"}
          onChange={() => setChoice("keep")}
          className="mt-1"
        />
        <div className="flex flex-1 flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="badge bg-zinc-200 text-zinc-700">현재</span>
            <span className="font-semibold">
              {currentInstructor?.name ?? "(강사 없음)"}
            </span>
            <span className="text-xs text-muted">
              평점 {Number(currentInstructor?.rating_avg ?? 0).toFixed(2)}
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {currentSpecialties.length === 0 && (
              <span className="text-xs text-muted">전문분야 미등록</span>
            )}
            {currentSpecialties.map((s) => (
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
          </div>
          <span className="text-xs font-medium text-muted">
            이대로 유지 → 최종확정
          </span>
        </div>
      </label>

      {/* 재계산된 후보 */}
      {candidates.length > 0 && (
        <>
          <p className="text-xs font-semibold text-muted">
            재계산된 추천 후보
          </p>
          <ul className="flex flex-col gap-2">
            {candidates.map((c) => (
              <li key={c.id}>
                <label
                  className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 ${
                    choice === c.id
                      ? "border-brand bg-blue-50/40"
                      : "border-border hover:bg-zinc-50"
                  }`}
                >
                  <input
                    type="radio"
                    name="choice"
                    value={c.id}
                    checked={choice === c.id}
                    onChange={() => setChoice(c.id)}
                    className="mt-1"
                  />
                  <CandidateInfo
                    candidate={c}
                    requiredSpecialty={requiredSpecialty}
                  />
                  {c.instructor_id === currentInstructorId && (
                    <span className="badge self-center bg-zinc-100 text-zinc-500">
                      현재 강사
                    </span>
                  )}
                </label>
              </li>
            ))}
          </ul>
        </>
      )}

      {isChange && (
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          변경 사유 <span className="font-normal text-muted">선택</span>
          <textarea
            name="reason"
            rows={2}
            placeholder="강사 변경 사유 (assignment_history 에 기록됩니다)"
            className="rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand"
          />
        </label>
      )}

      {state.error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className={`self-start rounded-md px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 ${
          isChange
            ? "bg-amber-600 hover:bg-amber-700"
            : "bg-green-600 hover:bg-green-700"
        }`}
      >
        {pending
          ? "확정 중…"
          : isChange
            ? "강사 변경하여 최종확정"
            : "현재 강사로 최종확정"}
      </button>
    </form>
  );
}
