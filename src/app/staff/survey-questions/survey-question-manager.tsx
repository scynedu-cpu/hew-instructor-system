"use client";

import { useActionState, useMemo, useState, useTransition } from "react";
import type {
  QuestionScope,
  QuestionType,
  SurveyGroupCode,
  SurveyQuestion,
  SurveyQuestionGroup,
} from "@/lib/types";
import { QUESTION_TYPE_LABEL, SURVEY_GROUP_LABEL } from "@/lib/types";
import {
  bulkToggleQuestions,
  createSurveyQuestion,
  moveQuestion,
  toggleQuestionActive,
  updateSurveyQuestion,
  type QuestionFormState,
} from "./actions";

const initial: QuestionFormState = {};
const TYPES: QuestionType[] = ["rating_5", "single_choice", "short_text", "long_text"];
const GROUP_CODES: SurveyGroupCode[] = ["A", "B", "C", "D", "E"];

export function SurveyQuestionManager({
  questions,
  groups,
}: {
  questions: SurveyQuestion[];
  groups: SurveyQuestionGroup[];
}) {
  const [state, formAction, pending] = useActionState(createSurveyQuestion, initial);
  const [newType, setNewType] = useState<QuestionType>("rating_5");
  const [newOptions, setNewOptions] = useState<string[]>(["", ""]);
  const [newScope, setNewScope] = useState<QuestionScope>("common");
  const [newGroup, setNewGroup] = useState<SurveyGroupCode>("A");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [busySection, setBusySection] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function toggle(q: SurveyQuestion) {
    setBusyId(q.id);
    startTransition(async () => {
      await toggleQuestionActive(q.id, !q.is_active);
      setBusyId(null);
    });
  }

  function move(id: string, direction: "up" | "down") {
    setBusyId(id);
    startTransition(async () => {
      await moveQuestion(id, direction);
      setBusyId(null);
    });
  }

  function bulkToggle(sectionKey: string, ids: string[], nextActive: boolean) {
    setBusySection(sectionKey);
    startTransition(async () => {
      await bulkToggleQuestions(ids, nextActive);
      setBusySection(null);
    });
  }

  // 공통 섹션 + 그룹(A~E) 섹션으로 구분 — 순서 변경도 이 섹션 내에서만 의미있음
  const commonQuestions = useMemo(
    () => questions.filter((q) => q.scope === "common"),
    [questions],
  );
  const byGroup = useMemo(() => {
    const map = new Map<SurveyGroupCode, SurveyQuestion[]>();
    for (const code of GROUP_CODES) {
      map.set(
        code,
        questions.filter((q) => q.scope === "group" && q.survey_group === code),
      );
    }
    return map;
  }, [questions]);

  const groupLabel = (code: SurveyGroupCode) =>
    groups.find((g) => g.group_code === code)?.label ?? SURVEY_GROUP_LABEL[code];

  return (
    <div className="flex flex-col gap-6">
      {/* 추가 */}
      <form
        action={formAction}
        className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4"
      >
        <h2 className="font-semibold">문항 추가</h2>

        <div className="flex flex-wrap gap-3">
          <label className="flex flex-col gap-1 text-sm font-medium">
            범위 <span className="text-red-600">*</span>
            <select
              name="scope"
              value={newScope}
              onChange={(e) => setNewScope(e.target.value as QuestionScope)}
              className="w-40 rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand"
            >
              <option value="common">공통</option>
              <option value="group">그룹 전용</option>
            </select>
          </label>

          {newScope === "group" && (
            <label className="flex flex-col gap-1 text-sm font-medium">
              그룹 <span className="text-red-600">*</span>
              <select
                name="survey_group"
                value={newGroup}
                onChange={(e) => setNewGroup(e.target.value as SurveyGroupCode)}
                className="w-56 rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand"
              >
                {GROUP_CODES.map((code) => (
                  <option key={code} value={code}>
                    {groupLabel(code)}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="flex flex-col gap-1 text-sm font-medium">
            문항 유형 <span className="text-red-600">*</span>
            <select
              name="question_type"
              value={newType}
              onChange={(e) => setNewType(e.target.value as QuestionType)}
              className="w-48 rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand"
            >
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {QUESTION_TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="flex flex-col gap-1 text-sm font-medium">
          문항 내용 <span className="text-red-600">*</span>
          <input
            name="question_text"
            required
            placeholder="예: 강사의 지도는 충실했습니까?"
            className="rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand"
          />
        </label>

        {newType === "single_choice" && (
          <div className="flex flex-col gap-1.5 text-sm font-medium">
            <span>
              선택지 <span className="font-normal text-muted">2개 이상</span>
            </span>
            {newOptions.map((o, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  name="option"
                  value={o}
                  onChange={(e) =>
                    setNewOptions((prev) =>
                      prev.map((v, idx) => (idx === i ? e.target.value : v)),
                    )
                  }
                  placeholder={`선택지 ${i + 1}`}
                  className="flex-1 rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand"
                />
                {newOptions.length > 2 && (
                  <button
                    type="button"
                    onClick={() =>
                      setNewOptions((p) => p.filter((_, idx) => idx !== i))
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
              onClick={() => setNewOptions((p) => [...p, ""])}
              className="self-start text-sm font-medium text-brand hover:underline"
            >
              + 선택지 추가
            </button>
          </div>
        )}

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
          {pending ? "추가 중…" : "추가"}
        </button>
      </form>

      {/* 목록 — 공통 + 그룹(A~E) 섹션으로 구분 */}
      <QuestionSection
        sectionKey="common"
        title="공통 문항"
        description="모든 세션의 설문에 후보로 제안됩니다."
        questions={commonQuestions}
        busyId={busyId}
        busySection={busySection}
        editingId={editingId}
        onToggle={toggle}
        onBulkToggle={bulkToggle}
        onMove={move}
        onEdit={setEditingId}
        onEditDone={() => setEditingId(null)}
      />
      {GROUP_CODES.map((code) => (
        <QuestionSection
          key={code}
          sectionKey={code}
          title={groupLabel(code)}
          description="이 그룹에 속한 프로그램 세션의 설문에만 후보로 제안됩니다."
          questions={byGroup.get(code) ?? []}
          busyId={busyId}
          busySection={busySection}
          editingId={editingId}
          onToggle={toggle}
          onBulkToggle={bulkToggle}
          onMove={move}
          onEdit={setEditingId}
          onEditDone={() => setEditingId(null)}
        />
      ))}
    </div>
  );
}

function QuestionSection({
  sectionKey,
  title,
  description,
  questions,
  busyId,
  busySection,
  editingId,
  onToggle,
  onBulkToggle,
  onMove,
  onEdit,
  onEditDone,
}: {
  sectionKey: string;
  title: string;
  description: string;
  questions: SurveyQuestion[];
  busyId: string | null;
  busySection: string | null;
  editingId: string | null;
  onToggle: (q: SurveyQuestion) => void;
  onBulkToggle: (sectionKey: string, ids: string[], nextActive: boolean) => void;
  onMove: (id: string, direction: "up" | "down") => void;
  onEdit: (id: string) => void;
  onEditDone: () => void;
}) {
  const sectionBusy = busySection === sectionKey;
  const activeIds = questions.filter((q) => q.is_active).map((q) => q.id);
  const inactiveIds = questions.filter((q) => !q.is_active).map((q) => q.id);
  const allIds = questions.map((q) => q.id);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold">{title}</h3>
          <p className="text-xs text-muted">{description}</p>
        </div>
        {questions.length > 0 && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={sectionBusy || activeIds.length === allIds.length}
              onClick={() => onBulkToggle(sectionKey, allIds, true)}
              className="rounded-md border border-brand px-2.5 py-1 text-xs text-brand hover:bg-blue-50 disabled:opacity-40"
            >
              {sectionBusy ? "처리 중…" : "전체 활성화"}
            </button>
            <button
              type="button"
              disabled={sectionBusy || inactiveIds.length === allIds.length}
              onClick={() => onBulkToggle(sectionKey, allIds, false)}
              className="rounded-md border border-border px-2.5 py-1 text-xs hover:bg-zinc-50 disabled:opacity-40"
            >
              {sectionBusy ? "처리 중…" : "전체 삭제"}
            </button>
          </div>
        )}
      </div>
      <div className="rounded-lg border border-border">
        {questions.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted">
            등록된 문항이 없습니다.
          </p>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {questions.map((q, idx) => (
              <li
                key={q.id}
                className={`flex flex-col gap-2 px-3 py-2.5 ${
                  q.is_active ? "" : "bg-zinc-50/60 text-muted"
                }`}
              >
                {editingId === q.id ? (
                  <EditRow question={q} onDone={onEditDone} />
                ) : (
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="badge bg-blue-50 text-blue-700">
                          {QUESTION_TYPE_LABEL[q.question_type]}
                        </span>
                        <span className={q.is_active ? "font-medium" : "line-through"}>
                          {q.question_text}
                        </span>
                        {!q.is_active && (
                          <span className="badge bg-zinc-200 text-zinc-600">비활성</span>
                        )}
                      </div>
                      {q.options && q.options.length > 0 && (
                        <div className="text-xs text-muted">
                          선택지: {q.options.join(" · ")}
                        </div>
                      )}
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        disabled={busyId === q.id || idx === 0}
                        onClick={() => onMove(q.id, "up")}
                        className="rounded-md border border-border px-1.5 py-1 text-xs hover:bg-zinc-50 disabled:opacity-30"
                        title="위로"
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        disabled={busyId === q.id || idx === questions.length - 1}
                        onClick={() => onMove(q.id, "down")}
                        className="rounded-md border border-border px-1.5 py-1 text-xs hover:bg-zinc-50 disabled:opacity-30"
                        title="아래로"
                      >
                        ▼
                      </button>
                      <button
                        type="button"
                        onClick={() => onEdit(q.id)}
                        className="rounded-md border border-border px-2.5 py-1 text-xs hover:bg-zinc-50"
                      >
                        수정
                      </button>
                      <button
                        type="button"
                        disabled={busyId === q.id}
                        onClick={() => onToggle(q)}
                        className={`rounded-md border px-2.5 py-1 text-xs ${
                          q.is_active
                            ? "border-border hover:bg-zinc-50"
                            : "border-brand text-brand hover:bg-blue-50"
                        } disabled:opacity-50`}
                      >
                        {busyId === q.id ? "…" : q.is_active ? "삭제" : "다시 활성화"}
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function EditRow({
  question,
  onDone,
}: {
  question: SurveyQuestion;
  onDone: () => void;
}) {
  const [text, setText] = useState(question.question_text);
  const [options, setOptions] = useState<string[]>(
    question.options && question.options.length > 0 ? question.options : ["", ""],
  );
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setErr(null);
    const fd = new FormData();
    fd.set("question_type", question.question_type);
    fd.set("question_text", text);
    options.forEach((o) => fd.append("option", o));
    setBusy(true);
    try {
      const res = await updateSurveyQuestion(question.id, fd);
      if (res.error) setErr(res.error);
      else onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-brand/30 bg-blue-50/30 p-2">
      <span className="badge w-fit bg-blue-50 text-blue-700">
        {QUESTION_TYPE_LABEL[question.question_type]}
      </span>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand"
      />
      {question.question_type === "single_choice" && (
        <div className="flex flex-col gap-1.5">
          {options.map((o, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                value={o}
                onChange={(e) =>
                  setOptions((prev) =>
                    prev.map((v, idx) => (idx === i ? e.target.value : v)),
                  )
                }
                placeholder={`선택지 ${i + 1}`}
                className="flex-1 rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand"
              />
              {options.length > 2 && (
                <button
                  type="button"
                  onClick={() => setOptions((p) => p.filter((_, idx) => idx !== i))}
                  className="text-sm text-muted hover:text-red-600"
                >
                  삭제
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={() => setOptions((p) => [...p, ""])}
            className="self-start text-sm font-medium text-brand hover:underline"
          >
            + 선택지 추가
          </button>
        </div>
      )}
      {err && (
        <p className="rounded bg-red-50 px-2 py-1 text-xs text-red-700">{err}</p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={save}
          className="rounded-md bg-brand px-3 py-1.5 text-sm font-semibold text-brand-fg hover:bg-brand-hover disabled:opacity-50"
        >
          {busy ? "저장 중…" : "저장"}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-zinc-50"
        >
          취소
        </button>
      </div>
    </div>
  );
}
