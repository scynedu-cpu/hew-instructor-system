// 신청서 명세 입력값 파싱 (서버/클라이언트 공용, "use server" 아님)

export interface RequestItemInput {
  program_id: string;
  requested_dates: string[];
  dates_tbd: boolean;
  preferred_time_slot: string;
  expected_student_count: string;
  note: string;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseRequestItems(raw: string): RequestItemInput[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map((x) => {
      const o = (x ?? {}) as Record<string, unknown>;
      return {
        program_id: String(o.program_id ?? ""),
        requested_dates: Array.isArray(o.requested_dates)
          ? (o.requested_dates as unknown[])
              .map((d) => String(d).trim())
              .filter((d) => DATE_RE.test(d))
          : [],
        dates_tbd: !!o.dates_tbd,
        preferred_time_slot: String(o.preferred_time_slot ?? "").trim(),
        expected_student_count: String(o.expected_student_count ?? "").trim(),
        note: String(o.note ?? "").trim(),
      };
    })
    .filter((i) => i.program_id);
}
