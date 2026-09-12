import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { PaymentWithInstructor } from "@/lib/types";
import { PAYMENT_STATUS_LABEL } from "@/lib/types";
import { won } from "@/lib/format";
import { PayButton } from "../pay-button";

type LectureRow = {
  id: string;
  actual_date: string | null;
  actual_hours: number | null;
  assignment: {
    session: {
      school: { name: string } | null;
      program: { name: string } | null;
    } | null;
  } | null;
};

export default async function PaymentDetailPage({
  params,
}: PageProps<"/staff/payments/[id]">) {
  await requireRole("staff");
  const { id } = await params;
  const supabase = await createClient();

  const { data: payment } = await supabase
    .from("payments")
    .select("*, instructor:instructors(id,name)")
    .eq("id", id)
    .maybeSingle<PaymentWithInstructor>();

  if (!payment) notFound();

  const { data: items } = await supabase
    .from("payment_items")
    .select("lecture_confirmation_id")
    .eq("payment_id", id)
    .returns<{ lecture_confirmation_id: string }[]>();

  const lcIds = (items ?? []).map((i) => i.lecture_confirmation_id);

  let lectures: LectureRow[] = [];
  if (lcIds.length > 0) {
    const { data } = await supabase
      .from("lecture_confirmations")
      .select(
        "id, actual_date, actual_hours, assignment:assignments(session:class_sessions(school:schools(name), program:programs(name)))",
      )
      .in("id", lcIds)
      .order("actual_date", { ascending: true })
      .returns<LectureRow[]>();
    lectures = data ?? [];
  }

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <div>
        <Link
          href="/staff/payments"
          className="text-sm text-link hover:underline"
        >
          ← 강사료 정산
        </Link>
        <div className="mt-1 flex items-center gap-2">
          <h1 className="text-xl font-bold">
            {payment.instructor?.name ?? "-"} 정산
          </h1>
          <span
            className={`badge ${
              payment.payment_status === "paid"
                ? "bg-green-50 text-green-700"
                : "bg-amber-50 text-amber-800"
            }`}
          >
            {PAYMENT_STATUS_LABEL[payment.payment_status]}
          </span>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-lg border border-border bg-surface p-4 text-sm">
        <Field label="정산 기간">
          {payment.period_start} ~ {payment.period_end}
        </Field>
        <Field label="강의 건수">{payment.quantity}건</Field>
        <Field label="적용 단가">{won(payment.rate)}</Field>
        <Field label="정산 금액">
          <span className="font-bold">{won(payment.amount)}</span>
        </Field>
        <Field label="집계">
          {payment.settled_at
            ? new Date(payment.settled_at).toLocaleString("ko-KR")
            : "-"}
          {payment.settled_by ? ` · ${payment.settled_by}` : ""}
        </Field>
        {payment.payment_status === "paid" && (
          <Field label="지급완료">
            {payment.paid_at
              ? new Date(payment.paid_at).toLocaleString("ko-KR")
              : "-"}
            {payment.paid_by ? ` · ${payment.paid_by}` : ""}
          </Field>
        )}
      </dl>

      {payment.payment_status === "pending" && (
        <div className="flex items-center gap-3 rounded-lg border border-border bg-surface p-4">
          <PayButton paymentId={payment.id} />
          <span className="text-xs text-muted">
            실제 송금은 담당자가 직접 처리합니다. 여기서는 상태만 기록합니다.
          </span>
        </div>
      )}

      <div>
        <h2 className="mb-2 text-sm font-semibold text-muted">
          포함된 강의 ({lectures.length}건)
        </h2>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[420px] text-sm">
            <thead className="bg-zinc-50 text-left text-xs text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">강의일</th>
                <th className="px-3 py-2 font-medium">학교</th>
                <th className="px-3 py-2 font-medium">프로그램</th>
                <th className="px-3 py-2 font-medium">시수</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {lectures.map((l) => (
                <tr key={l.id}>
                  <td className="px-3 py-2">{l.actual_date ?? "-"}</td>
                  <td className="px-3 py-2">
                    {l.assignment?.session?.school?.name ?? "-"}
                  </td>
                  <td className="px-3 py-2">
                    {l.assignment?.session?.program?.name ?? "-"}
                  </td>
                  <td className="px-3 py-2">
                    {l.actual_hours != null ? `${l.actual_hours}시간` : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}
