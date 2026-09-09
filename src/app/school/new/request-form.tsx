"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { submitRequest, type RequestFormState } from "../actions";
import type { Program } from "@/lib/types";

const initial: RequestFormState = {};

export function RequestForm({ programs }: { programs: Program[] }) {
  const [state, formAction, pending] = useActionState(submitRequest, initial);

  const [programId, setProgramId] = useState("");
  const [dates, setDates] = useState<string[]>([""]);
  const [specialty, setSpecialty] = useState("");

  const validDates = dates.map((d) => d.trim()).filter(Boolean);
  const canSubmit =
    programId !== "" && validDates.length > 0 && specialty.trim() !== "";

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {/* 프로그램 */}
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        프로그램 <span className="text-red-600">*</span>
        <select
          name="program_id"
          value={programId}
          onChange={(e) => setProgramId(e.target.value)}
          required
          className="rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand"
        >
          <option value="">선택하세요</option>
          {programs.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.category ? ` (${p.category})` : ""}
            </option>
          ))}
        </select>
      </label>

      {/* 희망일자 (복수) */}
      <div className="flex flex-col gap-1.5 text-sm font-medium">
        <span>
          희망일자 <span className="text-red-600">*</span>{" "}
          <span className="font-normal text-muted">복수 선택 가능</span>
        </span>
        <div className="flex flex-col gap-2">
          {dates.map((d, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="date"
                name="requested_dates"
                value={d}
                onChange={(e) =>
                  setDates((prev) =>
                    prev.map((v, idx) => (idx === i ? e.target.value : v)),
                  )
                }
                className="rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand"
              />
              {dates.length > 1 && (
                <button
                  type="button"
                  onClick={() =>
                    setDates((prev) => prev.filter((_, idx) => idx !== i))
                  }
                  className="text-sm text-muted hover:text-red-600"
                >
                  삭제
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={() => setDates((prev) => [...prev, ""])}
            className="self-start text-sm font-medium text-brand hover:underline"
          >
            + 날짜 추가
          </button>
        </div>
      </div>

      {/* 희망 시간대 */}
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        희망 시간대 <span className="font-normal text-muted">자유 입력</span>
        <input
          name="preferred_time_slot"
          placeholder="예: 10:00~12:00, 3·4교시"
          className="rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand"
        />
      </label>

      {/* 예상 인원 */}
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        예상 인원 <span className="font-normal text-muted">자유 입력</span>
        <input
          name="expected_student_count"
          placeholder="예: 120명, 8학급"
          className="rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand"
        />
      </label>

      {/* 필요 전문분야 */}
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        필요 전문분야 <span className="text-red-600">*</span>
        <input
          name="required_specialty"
          value={specialty}
          onChange={(e) => setSpecialty(e.target.value)}
          placeholder="예: AI교육, 드론전문가, 진로토크콘서트"
          required
          className="rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand"
        />
      </label>

      {/* 필요 강사 수 */}
      <label className="flex w-40 flex-col gap-1.5 text-sm font-medium">
        필요 강사 수
        <input
          name="required_instructor_count"
          type="number"
          min={1}
          defaultValue={1}
          className="rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand"
        />
      </label>

      {!canSubmit && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          필수 항목(프로그램, 희망일자 1개 이상, 필요 전문분야)을 모두 입력해야
          제출할 수 있습니다.
        </p>
      )}
      {state.error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={!canSubmit || pending}
          className="rounded-md bg-brand px-4 py-2.5 text-sm font-semibold text-brand-fg hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "제출 중…" : "신청서 제출"}
        </button>
        <Link
          href="/school"
          className="rounded-md border border-border px-4 py-2.5 text-sm font-medium hover:bg-zinc-50"
        >
          취소
        </Link>
      </div>
    </form>
  );
}
