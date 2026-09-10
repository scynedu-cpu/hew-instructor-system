"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import type { Program, School } from "@/lib/types";
import { AutofillPanel, type AutofillMeta } from "@/components/autofill-panel";
import {
  ProgramItemsEditor,
  emptyItem,
  type ProgramItem,
} from "@/components/program-items-editor";
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
  const [teacher, setTeacher] = useState("");
  const [note, setNote] = useState("");
  const [items, setItems] = useState<ProgramItem[]>([]);
  const [preview, setPreview] = useState<{
    kind: "text" | "image";
    content: string;
    fileName: string;
    simulated: boolean;
  } | null>(null);

  const canSubmit =
    schoolId !== "" &&
    items.length > 0 &&
    items.every((i) => i.dates_tbd || i.requested_dates.some((d) => d.trim()));

  const matchProgram = useMemo(() => {
    return (raw: string): Program | undefined => {
      const q = raw.trim().toLowerCase();
      if (!q) return undefined;
      const hay = (p: Program) =>
        [p.matching_keyword, p.sub_program, p.category, p.name]
          .filter(Boolean)
          .map((s) => String(s).toLowerCase());
      // 정확/포함 매칭 우선
      return (
        programs.find((p) => hay(p).some((h) => h === q)) ??
        programs.find((p) => hay(p).some((h) => q.includes(h) || h.includes(q)))
      );
    };
  }, [programs]);

  function applyAutofill(fields: Record<string, unknown>, meta: AutofillMeta) {
    // 원본 미리보기
    if (meta.source === "image" && meta.imageDataUrl) {
      setPreview({
        kind: "image",
        content: meta.imageDataUrl,
        fileName: meta.fileName,
        simulated: meta.simulated,
      });
    } else if (meta.textPreview) {
      setPreview({
        kind: "text",
        content: meta.textPreview,
        fileName: meta.fileName,
        simulated: meta.simulated,
      });
    }

    const s = (k: string) =>
      typeof fields[k] === "string" ? (fields[k] as string) : "";
    const schoolName = s("school_name");
    if (schoolName) {
      const hit = schools.find(
        (x) => x.name.includes(schoolName) || schoolName.includes(x.name),
      );
      if (hit) setSchoolId(hit.id);
    }
    if (s("teacher_name")) setTeacher(s("teacher_name"));

    const rawItems = Array.isArray(fields.items)
      ? (fields.items as Record<string, unknown>[])
      : [];
    const mapped: ProgramItem[] = [];
    const seen = new Set<string>();
    for (const ri of rawItems) {
      const prog = matchProgram(String(ri.program_name ?? ""));
      if (!prog || seen.has(prog.id)) continue;
      seen.add(prog.id);
      const dates = Array.isArray(ri.requested_dates)
        ? (ri.requested_dates as unknown[])
            .map((d) => String(d).trim())
            .filter((d) => DATE_RE.test(d))
        : [];
      mapped.push({
        ...emptyItem(prog.id),
        requested_dates: dates.length ? dates : [""],
        dates_tbd: !!ri.dates_tbd || (dates.length === 0 && !!ri.dates_tbd),
        preferred_time_slot: String(ri.preferred_time_slot ?? "").trim(),
        expected_student_count: String(ri.expected_student_count ?? "").trim(),
        note: String(ri.note ?? "").trim(),
      });
    }
    if (mapped.length) setItems(mapped);
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {/* 왼쪽: 입력 폼 */}
      <div className="flex flex-col gap-4">
        <AutofillPanel kind="school-request" onFilled={applyAutofill} compact />

        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="items_json" value={JSON.stringify(items)} />

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
            담당교사
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

          <label className="flex flex-col gap-1.5 text-sm font-medium">
            대리입력 비고
            <textarea
              name="proxy_note"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="예: 전화 신청 대리 접수"
              className="rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand"
            />
          </label>

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

      {/* 오른쪽: 원본 미리보기 */}
      <div className="lg:sticky lg:top-4 lg:self-start">
        <div className="flex h-full max-h-[80vh] flex-col rounded-lg border border-border bg-surface">
          <div className="border-b border-border px-3 py-2 text-sm font-semibold">
            원본 미리보기
            {preview && (
              <span className="ml-2 font-normal text-muted">
                {preview.fileName}
                {preview.simulated ? " (모의)" : ""}
              </span>
            )}
          </div>
          <div className="flex-1 overflow-auto p-3">
            {!preview ? (
              <p className="py-16 text-center text-sm text-muted">
                왼쪽 <b>AI 자동채움</b>에서 한글 문서나 사진을 올리면 여기에 원본이
                표시됩니다.
              </p>
            ) : preview.kind === "image" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={preview.content}
                alt="업로드 원본"
                className="mx-auto max-w-full rounded"
              />
            ) : (
              <pre className="whitespace-pre-wrap break-words text-xs leading-relaxed text-foreground">
                {preview.content}
              </pre>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
