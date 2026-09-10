// 타임존 영향 없이 'YYYY-MM-DD' 문자열만 다루는 달력 유틸.
// (Date 객체는 UTC 기준으로만 사용해 KST 파싱으로 인한 ±1일 오차를 피한다.)

export function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function ymd(y: number, m: number, d: number): string {
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

export function parseYmd(s: string): { y: number; m: number; d: number } {
  const [y, m, d] = s.split("-").map(Number);
  return { y, m, d };
}

/** UTC 자정 기준 Date */
function utc(s: string): Date {
  const { y, m, d } = parseYmd(s);
  return new Date(Date.UTC(y, m - 1, d));
}

export function fromUtc(dt: Date): string {
  return ymd(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

export function addDays(s: string, n: number): string {
  const dt = utc(s);
  dt.setUTCDate(dt.getUTCDate() + n);
  return fromUtc(dt);
}

/** 0=일 … 6=토 */
export function weekday(s: string): number {
  return utc(s).getUTCDay();
}

export function dayOfMonth(s: string): number {
  return parseYmd(s).d;
}

export function monthOf(s: string): number {
  return parseYmd(s).m;
}

export function todayYmd(): string {
  const now = new Date();
  return ymd(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

export function startOfWeek(s: string): string {
  return addDays(s, -weekday(s));
}

/** 해당 월을 덮는 6주(42일) 그리드. 각 주는 일요일 시작. */
export function monthGrid(year: number, month: number): string[] {
  const first = ymd(year, month, 1);
  const gridStart = startOfWeek(first);
  return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
}

export function weekGrid(anchor: string): string[] {
  const s = startOfWeek(anchor);
  return Array.from({ length: 7 }, (_, i) => addDays(s, i));
}

export function monthLabel(year: number, month: number): string {
  return `${year}년 ${month}월`;
}

export function prevMonth(y: number, m: number): { y: number; m: number } {
  return m === 1 ? { y: y - 1, m: 12 } : { y, m: m - 1 };
}

export function nextMonth(y: number, m: number): { y: number; m: number } {
  return m === 12 ? { y: y + 1, m: 1 } : { y, m: m + 1 };
}

export const WEEKDAY_KR = ["일", "월", "화", "수", "목", "금", "토"];
