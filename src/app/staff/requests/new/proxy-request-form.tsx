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
const WEEKDAY_INDEX: Record<string, number> = { 일: 0, 월: 1, 화: 2, 수: 3, 목: 4, 금: 5, 토: 6 };

/**
 * "매주 화요일 3/10~4/28"처럼 시작~종료일만 적힌 반복 일정 문구를 실제
 * 회차 날짜 전체로 펼친다. AI가 이 경우 시작일·종료일 2개만 뽑고 중간
 * 회차를 놓치는 경우가 있어(예: 8회 중 2일만 추출) 텍스트에서 직접
 * 계산한 날짜를 우선한다. 패턴이 없거나 애매하면 null.
 */
function expandWeeklyRecurrence(note: string, referenceYear: number): string[] | null {
  const m = note.match(
    /매주\s*([일월화수목금토])요일[^0-9]*(\d{1,2})\s*[./]\s*(\d{1,2})\s*[~\-]\s*(\d{1,2})\s*[./]\s*(\d{1,2})/,
  );
  if (!m) return null;
  const weekday = WEEKDAY_INDEX[m[1]];
  const start = new Date(Date.UTC(referenceYear, Number(m[2]) - 1, Number(m[3])));
  const end = new Date(Date.UTC(referenceYear, Number(m[4]) - 1, Number(m[5])));
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return null;

  const d = new Date(start);
  while (d.getUTCDay() !== weekday) d.setUTCDate(d.getUTCDate() + 1);
  const dates: string[] = [];
  while (d <= end) {
    dates.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 7);
  }
  return dates.length > 1 ? dates : null;
}

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
    kind: "text" | "image" | "html" | "pdf";
    content: string;
    fileName: string;
    simulated: boolean;
  } | null>(null);

  const canSubmit =
    schoolId !== "" &&
    items.length > 0 &&
    items.every((i) => i.dates_tbd || i.requested_dates.some((d) => d.trim()));

  const matchProgram = useMemo(() => {
    // AI가 뽑은 이름과 DB 프로그램명은 띄어쓰기가 다를 수 있다(예: "전환기프로그램"
    // vs "전환기 프로그램") → 공백을 제거하고 비교해야 매칭이 안정적이다.
    const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, "");
    return (raw: string): Program | undefined => {
      const q = norm(raw);
      if (!q) return undefined;
      const hay = (p: Program) =>
        [p.matching_keyword, p.sub_program, p.category, p.name]
          .filter(Boolean)
          .map((s) => norm(String(s)));
      // 정확/포함 매칭 우선
      return (
        programs.find((p) => hay(p).some((h) => h === q)) ??
        programs.find((p) => hay(p).some((h) => q.includes(h) || h.includes(q)))
      );
    };
  }, [programs]);

  function applyAutofill(fields: Record<string, unknown>, meta: AutofillMeta) {
    // 원본 미리보기 — 이미지는 그대로, hwp/hwpx 는 서버(kordoc)가 만든 완성된 HTML을
    // iframe 에 그대로 표시(표 병합·rowspan/colspan 그대로 보존), 그 외는 텍스트로 대조
    if (meta.source === "image" && meta.imageDataUrl) {
      setPreview({
        kind: "image",
        content: meta.imageDataUrl,
        fileName: meta.fileName,
        simulated: meta.simulated,
      });
    } else if (meta.source === "pdf" && meta.pdfDataUrl) {
      setPreview({
        kind: "pdf",
        content: meta.pdfDataUrl,
        fileName: meta.fileName,
        simulated: meta.simulated,
      });
    } else if (meta.source === "hwp" && meta.previewHtml) {
      setPreview({
        kind: "html",
        content: meta.previewHtml,
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
      if (!prog) continue;
      const extractedDates = Array.isArray(ri.requested_dates)
        ? (ri.requested_dates as unknown[])
            .map((d) => String(d).trim())
            .filter((d) => DATE_RE.test(d))
        : [];
      const noteText = String(ri.note ?? "").trim();
      // "매주 화요일 3/10~4/28"처럼 범위로만 적힌 반복 일정은 AI가 시작·종료일
      // 2개만 뽑고 중간 회차를 놓치는 경우가 있어, 텍스트에서 직접 계산한
      // 전체 날짜가 있으면 그걸 우선한다(연도는 AI가 뽑은 날짜 기준, 없으면 올해).
      const referenceYear = extractedDates[0]
        ? Number(extractedDates[0].slice(0, 4))
        : new Date().getFullYear();
      const weeklyDates = expandWeeklyRecurrence(noteText, referenceYear);
      const dates = weeklyDates ?? extractedDates;
      // "총 O회"처럼 반복 횟수가 날짜 개수와 맞아떨어지면, AI가 repeat_all_dates
      // 플래그를 놓쳤어도 반복형으로 간주한다(모델 출력에만 의존하지 않는 안전장치).
      const repeatCountMatch = noteText.match(/총\s*(\d+)\s*회/);
      const isRepeating =
        dates.length > 1 &&
        (weeklyDates !== null ||
          ri.repeat_all_dates === true ||
          (repeatCountMatch && Number(repeatCountMatch[1]) === dates.length));

      if (isRepeating) {
        // 반복 운영 — 같은 프로그램을 날짜별로 별도 항목(=별도 수업)으로 분리.
        // 승인 시 한 항목당 수업 1개가 생성되므로, 날짜를 하나로 묶어두면
        // 나머지 회차가 통째로 유실된다.
        for (const date of dates) {
          const key = `${prog.id}::${date}`;
          if (seen.has(key)) continue;
          seen.add(key);
          mapped.push({
            ...emptyItem(prog.id),
            requested_dates: [date],
            dates_tbd: false,
            preferred_time_slot: String(ri.preferred_time_slot ?? "").trim(),
            expected_student_count: String(ri.expected_student_count ?? "").trim(),
            note: noteText,
          });
        }
        continue;
      }

      if (seen.has(prog.id)) continue;
      seen.add(prog.id);
      mapped.push({
        ...emptyItem(prog.id),
        requested_dates: dates.length ? dates : [""],
        dates_tbd: !!ri.dates_tbd || (dates.length === 0 && !!ri.dates_tbd),
        preferred_time_slot: String(ri.preferred_time_slot ?? "").trim(),
        expected_student_count: String(ri.expected_student_count ?? "").trim(),
        note: noteText,
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
              className="rounded-md bg-brand px-4 py-2.5 text-sm font-semibold text-brand-fg hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
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
          <div
            className={
              preview?.kind === "html" || preview?.kind === "pdf"
                ? "flex-1"
                : "flex-1 overflow-auto p-3"
            }
          >
            {!preview ? (
              <p className="py-16 text-center text-sm text-muted">
                왼쪽 <b>AI 자동채움</b>에서 한글 문서·PDF나 사진을 올리면 여기에
                원본이 표시됩니다.
              </p>
            ) : preview.kind === "image" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={preview.content}
                alt="업로드 원본"
                className="mx-auto max-w-full rounded"
              />
            ) : preview.kind === "pdf" ? (
              // 브라우저 내장 PDF 뷰어로 원본을 그대로 표시
              <iframe
                src={preview.content}
                title="원본 미리보기"
                className="h-[75vh] w-full rounded-b-lg border-0 bg-white"
              />
            ) : preview.kind === "html" ? (
              // 서버(kordoc)가 만든 완성된 HTML 문서 — 표 병합(rowspan/colspan) 그대로 보존.
              // 우리 페이지 스타일과 섞이지 않도록 iframe 으로 격리해서 표시.
              <iframe
                srcDoc={preview.content}
                title="원본 미리보기"
                className="h-[75vh] w-full rounded-b-lg border-0 bg-white"
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
