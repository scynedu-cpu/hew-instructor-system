"use client";

import { useState, useTransition } from "react";
import type { SpecialtyRow } from "@/lib/types";
import { addSpecialty, removeSpecialty } from "./actions";

const SUGGESTIONS = [
  "AI교육",
  "드론전문가",
  "로봇공학자",
  "진로토크콘서트",
  "코딩교육",
  "메이커교육",
  "3D프린팅",
  "빅데이터",
];

export function SpecialtySection({ items }: { items: SpecialtyRow[] }) {
  const [input, setInput] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function add(value: string) {
    const v = value.trim();
    if (!v) return;
    setMsg(null);
    start(async () => {
      const r = await addSpecialty(v);
      if (r.error) setMsg(r.error);
      else setInput("");
    });
  }

  function remove(id: string) {
    setMsg(null);
    start(async () => {
      const r = await removeSpecialty(id);
      if (r.error) setMsg(r.error);
    });
  }

  const existing = new Set(items.map((i) => i.specialty));

  return (
    <section className="rounded-lg border border-border bg-surface p-4">
      <h2 className="mb-3 font-semibold">전문분야</h2>

      <div className="flex flex-wrap gap-2">
        {items.length === 0 && (
          <span className="text-xs text-muted">등록된 전문분야가 없습니다.</span>
        )}
        {items.map((s) => (
          <span
            key={s.id}
            className="badge bg-blue-50 text-blue-700"
          >
            {s.specialty}
            <button
              type="button"
              disabled={pending}
              onClick={() => remove(s.id)}
              className="ml-1 text-blue-400 hover:text-red-600"
              aria-label={`${s.specialty} 삭제`}
            >
              ×
            </button>
          </span>
        ))}
      </div>

      <div className="mt-3 flex gap-2">
        <input
          list="specialty-suggestions"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add(input);
            }
          }}
          placeholder="전문분야 입력 후 Enter"
          className="flex-1 rounded-md border border-border px-3 py-1.5 text-sm outline-none focus:border-brand"
        />
        <datalist id="specialty-suggestions">
          {SUGGESTIONS.filter((s) => !existing.has(s)).map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
        <button
          type="button"
          disabled={pending}
          onClick={() => add(input)}
          className="rounded-md bg-brand px-3 py-1.5 text-sm font-semibold text-brand-fg hover:bg-blue-800 disabled:opacity-60"
        >
          추가
        </button>
      </div>

      {msg && (
        <p className="mt-2 rounded bg-red-50 px-2 py-1 text-xs text-red-700">
          {msg}
        </p>
      )}
    </section>
  );
}
