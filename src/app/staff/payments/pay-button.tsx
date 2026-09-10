"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { markPaid } from "./actions";

export function PayButton({
  paymentId,
  compact = false,
}: {
  paymentId: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function pay() {
    if (!compact && !confirm("지급완료로 처리할까요? (실제 송금은 별도)")) return;
    setErr(null);
    start(async () => {
      const res = await markPaid(paymentId);
      if (res.error) setErr(res.error);
      else router.refresh();
    });
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={pay}
        disabled={pending}
        className={
          compact
            ? "font-medium text-green-700 hover:underline disabled:opacity-50"
            : "rounded-md bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
        }
      >
        {pending ? "처리 중…" : "지급완료 처리"}
      </button>
      {err && <span className="text-xs text-red-700">{err}</span>}
    </span>
  );
}
