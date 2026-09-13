"use client";

import { useMemo, useState } from "react";
import type { Instructor, InstructorRatingAdjustmentHistory } from "@/lib/types";
import { saveRatingAdjustment } from "../../actions";

/** 강사평판 수동조정 — 작업지시서 #017. 설문 자동점수(rating_avg) 70% +
 *  담당자 조정점수 30% = effective_rating(매칭에 실제 쓰이는 값). */
export function RatingAdjustmentSection({
  instructor,
  history,
}: {
  instructor: Pick<
    Instructor,
    | "id"
    | "rating_avg"
    | "effective_rating"
    | "manager_adjustment_enabled"
    | "manager_adjustment_score"
    | "manager_adjustment_reason"
    | "manager_adjustment_by"
    | "manager_adjustment_at"
  >;
  history: InstructorRatingAdjustmentHistory[];
}) {
  const [enabled, setEnabled] = useState(instructor.manager_adjustment_enabled);
  const [score, setScore] = useState(
    instructor.manager_adjustment_score != null
      ? String(instructor.manager_adjustment_score)
      : "",
  );
  const [reason, setReason] = useState(instructor.manager_adjustment_reason ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const ratingAvg = Number(instructor.rating_avg);
  const scoreNum = Number(score);
  const previewValid = Number.isFinite(scoreNum) && scoreNum >= 1 && scoreNum <= 5;
  const preview = previewValid
    ? Math.round((ratingAvg * 0.7 + scoreNum * 0.3) * 100) / 100
    : null;

  const currentEffective = Number(instructor.effective_rating);

  async function save() {
    setErr(null);
    setMsg(null);
    setBusy(true);
    try {
      const res = await saveRatingAdjustment(instructor.id, { enabled, score, reason });
      if (res.error) setErr(res.error);
      else setMsg(res.ok ?? "저장했습니다.");
    } finally {
      setBusy(false);
    }
  }

  const sortedHistory = useMemo(
    () =>
      [...history].sort(
        (a, b) => new Date(b.changed_at).getTime() - new Date(a.changed_at).getTime(),
      ),
    [history],
  );

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      <h2 className="font-semibold">평판 조정</h2>

      <div className="flex flex-wrap gap-4 text-sm">
        <div>
          <div className="text-xs text-muted">설문 기반 자동점수</div>
          <div className="text-lg font-bold">{ratingAvg.toFixed(2)}점</div>
        </div>
        <div>
          <div className="text-xs text-muted">현재 매칭 적용점수 (effective_rating)</div>
          <div className="text-lg font-bold text-brand">{currentEffective.toFixed(2)}점</div>
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
        />
        수동 조정 사용
      </label>

      {enabled && (
        <div className="flex flex-col gap-3 rounded-md border border-border bg-zinc-50/60 p-3">
          <label className="flex flex-col gap-1 text-sm font-medium">
            조정점수 (1.0~5.0) <span className="text-red-600">*</span>
            <input
              type="number"
              min={1}
              max={5}
              step={0.1}
              value={score}
              onChange={(e) => setScore(e.target.value)}
              className="w-32 rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            조정 사유 <span className="font-normal text-muted">선택</span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder="예: 학교 민원 반복 접수, 특별히 우수한 대응 등"
              className="rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand"
            />
          </label>
          <p className="rounded-md bg-blue-50/50 px-3 py-2 text-sm">
            설문 {ratingAvg.toFixed(2)}점 × 70% + 조정{" "}
            {previewValid ? scoreNum.toFixed(2) : "?"}점 × 30% ={" "}
            <span className="font-bold">{preview != null ? preview.toFixed(2) : "?"}점</span>
          </p>
        </div>
      )}

      {err && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>
      )}
      {msg && (
        <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">{msg}</p>
      )}

      <button
        type="button"
        disabled={busy}
        onClick={save}
        className="self-start rounded-md bg-brand px-4 py-2 text-sm font-semibold text-brand-fg hover:bg-brand-hover disabled:opacity-50"
      >
        {busy ? "저장 중…" : "저장"}
      </button>

      {instructor.manager_adjustment_enabled && (
        <p className="text-xs text-muted">
          현재 적용중: {instructor.manager_adjustment_by ?? "담당자"} ·{" "}
          {instructor.manager_adjustment_at
            ? new Date(instructor.manager_adjustment_at).toLocaleString("ko-KR")
            : "-"}
          {instructor.manager_adjustment_reason
            ? ` · ${instructor.manager_adjustment_reason}`
            : ""}
        </p>
      )}

      <div className="mt-1">
        <h3 className="mb-1.5 text-sm font-semibold text-muted">조정 이력</h3>
        {sortedHistory.length === 0 ? (
          <p className="text-xs text-muted">조정 이력이 없습니다.</p>
        ) : (
          <ol className="flex flex-col gap-2 border-l-2 border-border pl-3 text-xs">
            {sortedHistory.map((h) => (
              <li key={h.id} className="relative">
                <span className="absolute -left-[17px] top-1 h-2 w-2 rounded-full bg-border" />
                <div className="text-muted">
                  {new Date(h.changed_at).toLocaleString("ko-KR")}
                  {h.changed_by ? ` · ${h.changed_by}` : ""}
                </div>
                <div>
                  {h.enabled_before ? `${h.score_before}점 사용중` : "미사용"} →{" "}
                  {h.enabled_after ? `${h.score_after}점 사용` : "미사용으로 전환"}
                </div>
                {h.reason && <div className="text-muted">사유: {h.reason}</div>}
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
