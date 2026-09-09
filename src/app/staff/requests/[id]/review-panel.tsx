"use client";

import { useActionState, useState, useTransition } from "react";
import {
  approveRequest,
  rejectRequest,
  startReviewing,
  type ReviewState,
} from "@/app/staff/actions";

const initial: ReviewState = {};

export function ReviewPanel({
  requestId,
  status,
}: {
  requestId: string;
  status: "submitted" | "reviewing";
}) {
  const [approveState, approveAction, approving] = useActionState(
    approveRequest,
    initial,
  );
  const [rejectState, rejectAction, rejecting] = useActionState(
    rejectRequest,
    initial,
  );
  const [reviewPending, startReviewTransition] = useTransition();
  const [reviewMsg, setReviewMsg] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [showReject, setShowReject] = useState(false);

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4">
      <h2 className="font-semibold">검토 처리</h2>

      {status === "submitted" && (
        <div>
          <button
            type="button"
            disabled={reviewPending}
            onClick={() =>
              startReviewTransition(async () => {
                const res = await startReviewing(requestId);
                setReviewMsg(res.error ?? res.ok ?? null);
              })
            }
            className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-zinc-50 disabled:opacity-60"
          >
            검토 시작 (검토중으로 표시)
          </button>
          {reviewMsg && (
            <p className="mt-2 text-sm text-muted">{reviewMsg}</p>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {/* 승인 */}
        <form action={approveAction}>
          <input type="hidden" name="request_id" value={requestId} />
          <button
            type="submit"
            disabled={approving}
            className="rounded-md bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60"
          >
            {approving ? "승인 중…" : "승인"}
          </button>
        </form>

        {/* 반려 토글 */}
        <button
          type="button"
          onClick={() => setShowReject((v) => !v)}
          className="rounded-md border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"
        >
          반려
        </button>
      </div>

      {approveState.error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {approveState.error}
        </p>
      )}
      {approveState.ok && (
        <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
          {approveState.ok}
        </p>
      )}

      {showReject && (
        <form action={rejectAction} className="flex flex-col gap-2">
          <input type="hidden" name="request_id" value={requestId} />
          <label className="text-sm font-medium">
            반려 사유 <span className="text-red-600">*</span>
            <textarea
              name="rejection_reason"
              required
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand"
              placeholder="학교에 안내할 반려 사유를 입력하세요."
            />
          </label>
          <button
            type="submit"
            disabled={rejecting || rejectReason.trim() === ""}
            className="self-start rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
          >
            {rejecting ? "반려 중…" : "반려 확정"}
          </button>
          {rejectState.error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {rejectState.error}
            </p>
          )}
          {rejectState.ok && (
            <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
              {rejectState.ok}
            </p>
          )}
        </form>
      )}
    </div>
  );
}
