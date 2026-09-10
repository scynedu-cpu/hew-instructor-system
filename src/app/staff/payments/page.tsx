import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { PaymentRateSetting, PaymentWithInstructor } from "@/lib/types";
import { PAYMENT_STATUS_LABEL } from "@/lib/types";
import { won } from "@/lib/format";
import { RateManager } from "./rate-manager";
import { SettleForm } from "./settle-form";
import { PayButton } from "./pay-button";

export default async function PaymentsPage() {
  await requireRole("staff");
  const supabase = await createClient();

  const [{ data: currentRate }, { data: rateHistory }, { data: payments }] =
    await Promise.all([
      supabase.rpc("current_payment_rate"),
      supabase
        .from("payment_rate_settings")
        .select("*")
        .order("effective_from", { ascending: false })
        .order("created_at", { ascending: false })
        .returns<PaymentRateSetting[]>(),
      supabase
        .from("payments")
        .select("*, instructor:instructors(id,name)")
        .order("created_at", { ascending: false })
        .returns<PaymentWithInstructor[]>(),
    ]);

  const rate = typeof currentRate === "number" ? currentRate : null;
  const list = payments ?? [];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-bold">강사료 정산</h1>

      <RateManager
        currentRate={rate}
        history={rateHistory ?? []}
      />

      <SettleForm hasRate={rate !== null} />

      <div>
        <h2 className="mb-2 text-sm font-semibold text-muted">
          정산 내역 ({list.length}건)
        </h2>
        {list.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border bg-surface px-4 py-10 text-center text-sm text-muted">
            정산 내역이 없습니다. 위에서 기간을 지정해 집계하세요.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-zinc-50 text-left text-xs text-muted">
                <tr>
                  <th className="px-3 py-2 font-medium">강사</th>
                  <th className="px-3 py-2 font-medium">정산 기간</th>
                  <th className="px-3 py-2 font-medium">건수</th>
                  <th className="px-3 py-2 font-medium">단가</th>
                  <th className="px-3 py-2 font-medium">금액</th>
                  <th className="px-3 py-2 font-medium">상태</th>
                  <th className="px-3 py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {list.map((p) => (
                  <tr key={p.id} className="hover:bg-zinc-50/60">
                    <td className="px-3 py-2 font-medium">
                      {p.instructor?.name ?? "-"}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {p.period_start} ~ {p.period_end}
                    </td>
                    <td className="px-3 py-2">{p.quantity}건</td>
                    <td className="px-3 py-2 text-xs">{won(p.rate)}</td>
                    <td className="px-3 py-2 font-semibold tabular-nums">
                      {won(p.amount)}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`badge ${
                          p.payment_status === "paid"
                            ? "bg-green-50 text-green-700"
                            : "bg-amber-50 text-amber-800"
                        }`}
                      >
                        {PAYMENT_STATUS_LABEL[p.payment_status]}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex justify-end gap-2">
                        {p.payment_status === "pending" && (
                          <PayButton paymentId={p.id} compact />
                        )}
                        <Link
                          href={`/staff/payments/${p.id}`}
                          className="font-medium text-brand hover:underline"
                        >
                          상세
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
