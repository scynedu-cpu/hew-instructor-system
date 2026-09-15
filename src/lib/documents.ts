// 제출 서류 종류 / 만료·상태 계산 (SQL 헬퍼 instructor_doc_expiry / instructor_doc_status 와 동일 규칙)

// 이력서는 강사카드와 동일한 서류라 별도 항목으로 두지 않는다(고객 확인).
export const DOC_TYPES = [
  "강사카드",
  "개인정보동의서",
  "신분증사본",
  "통장사본",
  "결격조회동의서",
  "성범죄경력조회동의서",
] as const;

export type DocType = (typeof DOC_TYPES)[number];

export type DocStatus = "valid" | "expiring_soon" | "expired";

/** 서류별 유효기간(년). 없으면 만료 없음. */
const VALIDITY_YEARS: Partial<Record<DocType, number>> = {
  성범죄경력조회동의서: 1,
  강사카드: 3,
};

export function hasExpiry(docType: DocType): boolean {
  return docType in VALIDITY_YEARS;
}

/** 서류별 유효기간(년). 만료 없는 서류면 null. */
export function validityYears(docType: DocType): number | null {
  return VALIDITY_YEARS[docType] ?? null;
}

/**
 * 발급일 → 만료일(ISO date). 만료 없는 서류거나 발급일 없으면 null.
 * ⚠ 실제 저장값은 DB 트리거(instructor_doc_expiry)가 계산한다. 이 함수는 미리보기용.
 * 타임존 영향이 없도록 Y-M-D 를 UTC 로만 계산.
 */
export function computeExpiry(docType: DocType, issuedAt: string | null): string | null {
  const years = VALIDITY_YEARS[docType];
  if (!years || !issuedAt) return null;
  const [y, m, d] = issuedAt.split("-").map(Number);
  return new Date(Date.UTC(y + years, m - 1, d)).toISOString().slice(0, 10);
}

/**
 * 만료일 기준 상태.
 *  오늘 >= 만료            → expired
 *  만료 - 30일 <= 오늘     → expiring_soon
 *  그 외 / 만료없음        → valid
 * 기준일은 항상 "오늘"(로컬) — 화면 표시와 판정이 어긋나지 않도록.
 */
export function computeStatus(expiresAt: string | null, today = new Date()): DocStatus {
  if (!expiresAt) return "valid";
  const [y, m, d] = expiresAt.split("-").map(Number);
  const exp = Date.UTC(y, m - 1, d);
  const t = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const DAY = 86_400_000;
  if (t >= exp) return "expired";
  if (t >= exp - 30 * DAY) return "expiring_soon";
  return "valid";
}

/**
 * 만료일까지(또는 만료일로부터) 며칠인지 — 오늘 기준. 음수면 이미 지남.
 * computeStatus() 와 같은 UTC 날짜 계산 규칙(타임존 영향 없음).
 */
export function daysUntil(expiresAt: string, today = new Date()): number {
  const [y, m, d] = expiresAt.split("-").map(Number);
  const exp = Date.UTC(y, m - 1, d);
  const t = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((exp - t) / 86_400_000);
}

export const DOC_STATUS_LABEL: Record<DocStatus, string> = {
  valid: "정상",
  expiring_soon: "임박",
  expired: "만료",
};

export const DOC_STATUS_STYLE: Record<DocStatus, string> = {
  valid: "bg-green-50 text-green-700",
  expiring_soon: "bg-amber-50 text-amber-800",
  expired: "bg-red-50 text-red-700",
};
