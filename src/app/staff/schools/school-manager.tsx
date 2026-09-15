"use client";

import { useActionState, useState } from "react";
import type { School, SchoolLevel } from "@/lib/types";
import { createSchool, type SchoolFormState } from "./actions";

const initial: SchoolFormState = {};
const LEVELS: SchoolLevel[] = ["초등학교", "중학교", "고등학교"];

export function SchoolManager({ schools }: { schools: School[] }) {
  const [state, formAction, pending] = useActionState(createSchool, initial);
  const [level, setLevel] = useState<SchoolLevel>("중학교");

  return (
    <div className="flex flex-col gap-6">
      {/* 등록 */}
      <form
        action={formAction}
        className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4"
      >
        <h2 className="font-semibold">학교 등록</h2>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm font-medium">
            학교명 <span className="text-red-600">*</span>
            <input
              name="name"
              required
              placeholder="예: 동덕여자중학교"
              className="rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm font-medium">
            학교급 <span className="text-red-600">*</span>
            <select
              name="level"
              required
              value={level}
              onChange={(e) => setLevel(e.target.value as SchoolLevel)}
              className="rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand"
            >
              {LEVELS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm font-medium">
            지역구
            <input
              name="district"
              placeholder="예: 서초구"
              className="rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm font-medium">
            담당교사
            <input
              name="teacher_name"
              placeholder="선택 입력"
              className="rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm font-medium">
            담당교사 연락처
            <input
              name="teacher_phone"
              placeholder="선택 입력"
              className="rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm font-medium">
            담당교사 이메일
            <input
              name="teacher_email"
              type="email"
              placeholder="선택 입력"
              className="rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand"
            />
          </label>
        </div>

        {state.error && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {state.error}
          </p>
        )}
        {state.ok && (
          <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
            {state.ok}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="self-start rounded-md bg-brand px-4 py-2 text-sm font-semibold text-brand-fg hover:bg-brand-hover disabled:opacity-50"
        >
          {pending ? "등록 중…" : "등록"}
        </button>
      </form>

      {/* 목록 */}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-zinc-50 text-left text-xs text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">학교명</th>
              <th className="px-3 py-2 font-medium">학교급</th>
              <th className="px-3 py-2 font-medium">지역구</th>
              <th className="px-3 py-2 font-medium">담당교사</th>
              <th className="px-3 py-2 font-medium">연락처</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {schools.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-muted">
                  등록된 학교가 없습니다.
                </td>
              </tr>
            ) : (
              schools.map((s) => (
                <tr key={s.id} className="hover:bg-zinc-50/60">
                  <td className="px-3 py-2 font-medium">{s.name}</td>
                  <td className="px-3 py-2">{s.level}</td>
                  <td className="px-3 py-2 text-muted">{s.district ?? "-"}</td>
                  <td className="px-3 py-2 text-muted">
                    {s.teacher_name ?? "-"}
                  </td>
                  <td className="px-3 py-2 text-muted">
                    {s.teacher_phone ?? "-"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
