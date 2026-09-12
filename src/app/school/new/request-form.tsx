"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import type { Program } from "@/lib/types";
import {
  ProgramItemsEditor,
  type ProgramItem,
} from "@/components/program-items-editor";
import { submitRequest, type RequestFormState } from "../actions";

const initial: RequestFormState = {};

export function RequestForm({ programs }: { programs: Program[] }) {
  const [state, formAction, pending] = useActionState(submitRequest, initial);
  const [teacher, setTeacher] = useState("");
  const [items, setItems] = useState<ProgramItem[]>([]);

  const canSubmit =
    items.length > 0 &&
    items.every((i) => i.dates_tbd || i.requested_dates.some((d) => d.trim()));

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="items_json" value={JSON.stringify(items)} />

      <label className="flex flex-col gap-1.5 text-sm font-medium">
        담당교사 <span className="font-normal text-muted">선택</span>
        <input
          name="teacher_name"
          value={teacher}
          onChange={(e) => setTeacher(e.target.value)}
          placeholder="신청 담당 교사 이름"
          className="rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand"
        />
      </label>

      <ProgramItemsEditor
        programs={programs}
        value={items}
        onChange={setItems}
      />

      {!canSubmit && items.length > 0 && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          선택한 프로그램마다 희망일자를 입력하거나 “일자 미정”을 체크하세요.
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
          className="rounded-md bg-brand px-4 py-2.5 text-sm font-semibold text-brand-fg hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
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
