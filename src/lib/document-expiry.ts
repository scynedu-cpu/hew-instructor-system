// 작업지시서 #006 — 서류 상태 갱신 + 만료 임박/만료 알림 이메일 (매일 배치)

import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";

interface DocRow {
  id: string;
  doc_type: string;
  expires_at: string | null;
  status: "valid" | "expiring_soon" | "expired";
  expiry_notified_at: string | null;
  expired_notified_at: string | null;
  instructor: { name: string; email: string | null } | null;
}

export interface ExpiryRunResult {
  statusRefreshed: number;
  expiringSoon: { notified: number; simulated: boolean; ids: string[] };
  expired: { notified: number; simulated: boolean; ids: string[] };
  warning?: string;
}

function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/+$/, "");
}

function buildHtml(intro: string, rows: DocRow[]): string {
  const link = siteUrl() ? `${siteUrl()}/staff/instructors` : "";
  const trs = rows
    .map(
      (r) => `
      <tr>
        <td style="padding:6px 12px;border:1px solid #e4e4e7;">${r.instructor?.name ?? "-"}</td>
        <td style="padding:6px 12px;border:1px solid #e4e4e7;">${r.doc_type}</td>
        <td style="padding:6px 12px;border:1px solid #e4e4e7;">${r.expires_at ?? "-"}</td>
      </tr>`,
    )
    .join("");
  return `
    <div style="font-family:system-ui,-apple-system,sans-serif;font-size:14px;color:#18181b;">
      <p>${intro}</p>
      <table style="border-collapse:collapse;margin:12px 0;">
        <thead>
          <tr>
            <th style="padding:6px 12px;border:1px solid #e4e4e7;background:#f4f4f5;text-align:left;">강사</th>
            <th style="padding:6px 12px;border:1px solid #e4e4e7;background:#f4f4f5;text-align:left;">서류 종류</th>
            <th style="padding:6px 12px;border:1px solid #e4e4e7;background:#f4f4f5;text-align:left;">만료일</th>
          </tr>
        </thead>
        <tbody>${trs}</tbody>
      </table>
      ${
        link
          ? `<p><a href="${link}" style="color:#1d4ed8;">강사 계정 화면에서 확인하기</a></p>`
          : ""
      }
      <p style="color:#71717a;font-size:12px;">HEW 강사·스케줄 관리 시스템 자동 알림</p>
    </div>`;
}

/**
 * 1) instructor_documents.status 를 expires_at 기준으로 재계산
 * 2) 방금 expiring_soon 이 됐고 expiry_notified_at 이 비어있는 문서 → 담당자 메일 + 시각 기록
 * 3) 방금 expired 가 됐고 expired_notified_at 이 비어있는 문서 → 담당자 메일 + 시각 기록
 * 발송 성공 후에만 notified 시각을 기록하므로 연속 실행해도 재발송되지 않는다.
 */
export async function runDocumentExpiryNotifications(): Promise<ExpiryRunResult> {
  const admin = createAdminClient();

  const { data: refreshed, error: refreshErr } = await admin.rpc(
    "refresh_instructor_document_status",
  );
  if (refreshErr) throw new Error(`상태 갱신 실패: ${refreshErr.message}`);
  const statusRefreshed = typeof refreshed === "number" ? refreshed : 0;

  const { data, error } = await admin
    .from("instructor_documents")
    .select(
      "id, doc_type, expires_at, status, expiry_notified_at, expired_notified_at, instructor:instructors(name,email)",
    )
    .in("status", ["expiring_soon", "expired"]);
  if (error) throw new Error(error.message);

  const docs = (data ?? []) as unknown as DocRow[];
  const soon = docs.filter(
    (d) => d.status === "expiring_soon" && !d.expiry_notified_at,
  );
  const expired = docs.filter(
    (d) => d.status === "expired" && !d.expired_notified_at,
  );

  const staffEmail = process.env.STAFF_NOTIFY_EMAIL;
  if (!staffEmail) {
    return {
      statusRefreshed,
      expiringSoon: { notified: 0, simulated: false, ids: [] },
      expired: { notified: 0, simulated: false, ids: [] },
      warning:
        "STAFF_NOTIFY_EMAIL 미설정 — 알림을 건너뜀 (notified 미기록, 다음 실행에서 재시도)",
    };
  }

  const nowIso = new Date().toISOString();
  let soonSimulated = false;
  let expiredSimulated = false;

  if (soon.length > 0) {
    const r = await sendEmail({
      to: staffEmail,
      subject: `[HEW] 강사 서류 만료 임박 ${soon.length}건`,
      html: buildHtml(
        "아래 강사 서류의 유효기간 만료가 30일 이내로 임박했습니다.",
        soon,
      ),
    });
    soonSimulated = r.simulated;
    const { error: markErr } = await admin
      .from("instructor_documents")
      .update({ expiry_notified_at: nowIso })
      .in(
        "id",
        soon.map((d) => d.id),
      );
    if (markErr) throw new Error(`임박 알림 기록 실패: ${markErr.message}`);
  }

  if (expired.length > 0) {
    const r = await sendEmail({
      to: staffEmail,
      subject: `[HEW] 강사 서류 만료 ${expired.length}건`,
      html: buildHtml(
        "아래 강사 서류의 유효기간이 만료되었습니다. 재제출 안내가 필요합니다.",
        expired,
      ),
    });
    expiredSimulated = r.simulated;
    const { error: markErr } = await admin
      .from("instructor_documents")
      .update({ expired_notified_at: nowIso })
      .in(
        "id",
        expired.map((d) => d.id),
      );
    if (markErr) throw new Error(`만료 알림 기록 실패: ${markErr.message}`);
  }

  return {
    statusRefreshed,
    expiringSoon: {
      notified: soon.length,
      simulated: soonSimulated,
      ids: soon.map((d) => d.id),
    },
    expired: {
      notified: expired.length,
      simulated: expiredSimulated,
      ids: expired.map((d) => d.id),
    },
  };
}
