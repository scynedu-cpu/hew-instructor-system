"use client";

import { useState } from "react";

interface CareerLike {
  year_month?: string | null;
  description?: string | null;
  issuing_org?: string | null;
}
interface CertLike {
  cert_name?: string | null;
  issued_date?: string | null;
  issuing_org?: string | null;
}

/**
 * 경력·자격증 내용을 바탕으로 AI 가 전문분야 후보를 제안 — 작업지시서 #011.
 * #003(강사 본인)·#008(담당자 대리입력) 양쪽 전문분야 섹션에서 공용으로 쓴다.
 * 화면에 아직 저장 안 된 경력/자격증이어도 그대로 넘겨서 추천에 반영한다.
 * 추천 chip 은 클릭해야만 onAdd 로 정식 추가되고, 클릭 전까지는 아무것도
 * 저장되지 않는다(#008 "저장 전 확인" 원칙 그대로).
 */
export function SpecialtyRecommendations({
  career,
  certs,
  existing,
  onAdd,
}: {
  career: CareerLike[];
  certs: CertLike[];
  existing: string[];
  onAdd: (specialty: string) => void;
}) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const hasData =
    career.some((c) => !!c.description?.trim()) ||
    certs.some((c) => !!c.cert_name?.trim());

  async function fetchSuggestions() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/ai/specialty-suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ career, certs, existing }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setErr(data?.error ?? "추천에 실패했습니다.");
        return;
      }
      setSuggestions(data.suggestions ?? []);
      setAdded(new Set());
    } catch {
      setErr("추천 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  function pick(s: string) {
    onAdd(s);
    setAdded((prev) => new Set(prev).add(s));
  }

  const existingLower = new Set(existing.map((s) => s.trim().toLowerCase()));
  const visible = suggestions.filter(
    (s) => !existingLower.has(s.toLowerCase()) && !added.has(s),
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={fetchSuggestions}
          disabled={!hasData || loading}
          className="rounded-md border border-brand px-3 py-1.5 text-xs font-semibold text-brand hover:bg-blue-50 disabled:cursor-not-allowed disabled:border-border disabled:text-muted"
        >
          {loading ? "AI 추천 생성 중…" : "✨ AI 추천"}
        </button>
        {!hasData && (
          <span className="text-xs text-muted">
            경력 또는 자격증을 먼저 입력하면 추천할 수 있습니다.
          </span>
        )}
      </div>

      {err && <p className="text-xs text-red-700">{err}</p>}

      {visible.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted">추천:</span>
          {visible.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => pick(s)}
              className="rounded-full border border-dashed border-brand px-3 py-1 text-xs text-brand hover:bg-blue-50"
            >
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
