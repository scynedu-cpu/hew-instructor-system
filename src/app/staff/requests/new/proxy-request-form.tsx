"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import type { Program, School } from "@/lib/types";
import { AutofillPanel } from "@/components/autofill-panel";
import { submitProxyRequest, type ProxyRequestState } from "./actions";

const initial: ProxyRequestState = {};
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function ProxyRequestForm({
  schools,
  programs,
}: {
  schools: School[];
  programs: Program[];
}) {
  const [state, formAction, pending] = useActionState(submitProxyRequest, initial);

  const [schoolId, setSchoolId] = useState("");
  const [programId, setProgramId] = useState("");
  const [dates, setDates] = useState<string[]>([""]);
  const [timeSlot, setTimeSlot] = useState("");
  const [studentCount, setStudentCount] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [count, setCount] = useState("1");
  const [note, setNote] = useState("");

  const validDates = dates.map((d) => d.trim()).filter(Boolean);
  const canSubmit =
    schoolId !== "" &&
    programId !== "" &&
    validDates.length > 0 &&
    specialty.trim() !== "";

  function applyAutofill(f: Record<string, unknown>) {
    const s = (k: string) => (typeof f[k] === "string" ? (f[k] as string) : "");

    // 학교/프로그램: 이름으로 근사 매칭
    const schoolName = s("school_name");
    if (schoolName) {
      const hit = schools.find(
        (x) => x.name.includes(schoolName) || schoolName.includes(x.name),
      );
      if (hit) setSchoolId(hit.id);
    }
    const programName = s("program_name");
    if (programName) {
      const hit = programs.find(
        (x) => x.name.includes(programName) || programName.includes(x.name),
      );
      if (hit) setProgramId(hit.id);
    }

    if (Array.isArray(f.requested_dates)) {
      const ds = (f.requested_dates as unknown[])
        .map((d) => String(d).trim())
        .filter((d) => DATE_RE.test(d));
      if (ds.length) setDates(ds);
    }
    if (s("preferred_time_slot")) setTimeSlot(s("preferred_time_slot"));
    if (s("expected_student_count")) setStudentCount(s("expected_student_count"));
    if (s("required_specialty")) setSpecialty(s("required_specialty"));
    if (typeof f.required_instructor_count === "number") {
      setCount(String(Math.max(1, Math.floor(f.required_instructor_count))));
    }
    const original = s("original_submitter");
    if (original) {
      setNote((prev) =>
        prev.includes(original) ? prev : `원 신청자: ${original}${prev ? `\n${prev}` : ""}`,
      );
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <AutofillPanel kind="school-request" onFilled={applyAutofill} />

      <form action={formAction} className="flex flex-col gap-5">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          학교 <span className="text-red-600">*</span>
          <select
            name="school_id"
            value={schoolId}
            onChange={(e) => setSchoolId(e.target.value)}
            required
            className="rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand"
          >
            <option value="">선택하세요</option>
            {schools.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.level})
              </option>
            ))}
          </select>
        </label>

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

        <div className="flex flex-col gap-1.5 text-sm font-medium">
          <span>
            희망일자 <span className="text-red-600">*</span>{" "}
            <span className="font-normal text-muted">복수 가능</span>
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

        <label className="flex flex-col gap-1.5 text-sm font-medium">
          희망 시간대 <span className="font-normal text-muted">자유 입력</span>
          <input
            name="preferred_time_slot"
            value={timeSlot}
            onChange={(e) => setTimeSlot(e.target.value)}
            placeholder="예: 10:00~12:00, 3·4교시"
            className="rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand"
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm font-medium">
          예상 인원 <span className="font-normal text-muted">자유 입력</span>
          <input
            name="expected_student_count"
            value={studentCount}
            onChange={(e) => setStudentCount(e.target.value)}
            placeholder="예: 120명, 8학급"
            className="rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand"
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm font-medium">
          필요 전문분야 <span className="text-red-600">*</span>
          <input
            name="required_specialty"
            value={specialty}
            onChange={(e) => setSpecialty(e.target.value)}
            placeholder="예: AI교육, 드론전문가"
            required
            className="rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand"
          />
        </label>

        <label className="flex w-40 flex-col gap-1.5 text-sm font-medium">
          필요 강사 수
          <input
            name="required_instructor_count"
            type="number"
            min={1}
            value={count}
            onChange={(e) => setCount(e.target.value)}
            className="rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand"
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm font-medium">
          비고 <span className="font-normal text-muted">원 신청자·특이사항</span>
          <textarea
            name="proxy_note"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="예: 원 신청자 최담임 교사, 전화 신청 대리 접수"
            className="rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand"
          />
        </label>

        {!canSubmit && (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
            필수 항목(학교, 프로그램, 희망일자 1개 이상, 필요 전문분야)을 모두
            입력해야 저장할 수 있습니다.
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
            {pending ? "저장 중…" : "신청서 저장"}
          </button>
          <Link
            href="/staff/requests"
            className="rounded-md border border-border px-4 py-2.5 text-sm font-medium hover:bg-zinc-50"
          >
            취소
          </Link>
        </div>
      </form>
    </div>
  );
}
