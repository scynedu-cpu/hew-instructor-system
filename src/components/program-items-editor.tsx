"use client";

import { useEffect, useRef, useState } from "react";
import type { Program } from "@/lib/types";
import { programLabel } from "@/lib/types";
import type { RequestItemInput } from "@/lib/session-request";

export type ProgramItem = RequestItemInput;

export function emptyItem(programId: string): ProgramItem {
  return {
    program_id: programId,
    requested_dates: [""],
    dates_tbd: false,
    preferred_time_slot: "",
    expected_student_count: "",
    note: "",
  };
}

/**
 * 여러 프로그램을 ○/X 로 선택하고, 선택한 프로그램마다
 * 희망일자(복수/미정) · 시간대 · 인원 · 비고를 각각 입력.
 */
export function ProgramItemsEditor({
  programs,
  value,
  onChange,
}: {
  programs: Program[];
  value: ProgramItem[];
  onChange: (items: ProgramItem[]) => void;
}) {
  const selectedIds = new Set(value.map((i) => i.program_id));
  // 처음 1건이라도 선택되면(AI 자동채움 또는 수동 클릭) "다른 프로그램 추가"
  // 영역을 한 번 접어서, 실제 신청 중인 항목만 크게 보이도록 한다.
  const [showPicker, setShowPicker] = useState(value.length === 0);
  const autoCollapsedRef = useRef(false);
  useEffect(() => {
    if (!autoCollapsedRef.current && value.length > 0) {
      autoCollapsedRef.current = true;
      setShowPicker(false);
    }
  }, [value.length]);

  function toggle(programId: string) {
    if (selectedIds.has(programId)) {
      onChange(value.filter((i) => i.program_id !== programId));
    } else {
      onChange([...value, emptyItem(programId)]);
    }
  }

  function patch(programId: string, p: Partial<ProgramItem>) {
    onChange(
      value.map((i) => (i.program_id === programId ? { ...i, ...p } : i)),
    );
  }

  // 아직 선택 안 한 것만 "추가" 목록에 — 선택된 건 아래 카드로 이미 크게 보임
  const byCategory = new Map<string, Program[]>();
  for (const p of programs) {
    if (selectedIds.has(p.id)) continue;
    const key = p.category ?? p.name;
    const arr = byCategory.get(key) ?? [];
    arr.push(p);
    byCategory.set(key, arr);
  }

  const inputCls =
    "rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <span className="text-sm font-medium">
          신청 프로그램 <span className="text-red-600">*</span>{" "}
          <span className="font-normal text-muted">여러 개 선택 가능</span>
        </span>

        {byCategory.size > 0 && (
          <button
            type="button"
            onClick={() => setShowPicker((v) => !v)}
            className="self-start text-sm font-medium text-brand hover:underline"
          >
            {showPicker ? "▾" : "▸"} 다른 프로그램 추가
          </button>
        )}

        {showPicker &&
          [...byCategory.entries()].map(([category, rows]) => (
            <div key={category} className="rounded-md border border-border p-2">
              <p className="mb-1 px-1 text-xs font-semibold text-muted">
                {category}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {rows.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => toggle(p.id)}
                    className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-zinc-50"
                  >
                    ＋ {p.sub_program ?? "(대분류)"}
                  </button>
                ))}
              </div>
            </div>
          ))}
      </div>

      {value.length === 0 && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          프로그램을 1개 이상 선택하세요.
        </p>
      )}

      {value.map((item) => {
        const p = programs.find((x) => x.id === item.program_id);
        return (
          <div
            key={item.program_id}
            className="flex flex-col gap-3 rounded-lg border border-brand/30 bg-blue-50/30 p-3"
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold">
                {p ? programLabel(p) : "선택한 프로그램"}
              </span>
              <button
                type="button"
                onClick={() => toggle(item.program_id)}
                className="text-xs text-muted hover:text-red-600"
              >
                선택 해제
              </button>
            </div>

            {/* 희망일자 */}
            <div className="flex flex-col gap-1.5 text-sm">
              <div className="flex items-center gap-3">
                <span className="font-medium">희망일자</span>
                <label className="flex items-center gap-1 text-xs text-muted">
                  <input
                    type="checkbox"
                    checked={item.dates_tbd}
                    onChange={(e) =>
                      patch(item.program_id, { dates_tbd: e.target.checked })
                    }
                  />
                  일자 미정
                </label>
              </div>
              {!item.dates_tbd && (
                <div className="flex flex-col gap-2">
                  {item.requested_dates.map((d, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input
                        type="date"
                        value={d}
                        onChange={(e) =>
                          patch(item.program_id, {
                            requested_dates: item.requested_dates.map((v, idx) =>
                              idx === i ? e.target.value : v,
                            ),
                          })
                        }
                        className={inputCls}
                      />
                      {item.requested_dates.length > 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            patch(item.program_id, {
                              requested_dates: item.requested_dates.filter(
                                (_, idx) => idx !== i,
                              ),
                            })
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
                    onClick={() =>
                      patch(item.program_id, {
                        requested_dates: [...item.requested_dates, ""],
                      })
                    }
                    className="self-start text-sm font-medium text-brand hover:underline"
                  >
                    + 날짜 추가
                  </button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm font-medium">
                시간대 <span className="font-normal text-muted">자유 입력</span>
                <input
                  value={item.preferred_time_slot}
                  onChange={(e) =>
                    patch(item.program_id, {
                      preferred_time_slot: e.target.value,
                    })
                  }
                  placeholder="예: 3·4교시, 10:00~12:00"
                  className={inputCls}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm font-medium">
                인원 <span className="font-normal text-muted">자유 입력</span>
                <input
                  value={item.expected_student_count}
                  onChange={(e) =>
                    patch(item.program_id, {
                      expected_student_count: e.target.value,
                    })
                  }
                  placeholder="예: 90명, 4학급"
                  className={inputCls}
                />
              </label>
            </div>

            <label className="flex flex-col gap-1 text-sm font-medium">
              비고
              <input
                value={item.note}
                onChange={(e) =>
                  patch(item.program_id, { note: e.target.value })
                }
                className={inputCls}
              />
            </label>
          </div>
        );
      })}
    </div>
  );
}
