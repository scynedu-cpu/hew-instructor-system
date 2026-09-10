// 이메일 발송 — Resend REST API (별도 SDK 의존성 없음).
// RESEND_API_KEY 가 없으면 실제 발송 대신 로그만 남긴다(simulated).

export interface SendEmailInput {
  to: string | string[];
  subject: string;
  html: string;
}

export interface SendEmailResult {
  id: string | null;
  simulated: boolean;
}

const DEFAULT_FROM = "HEW 강사·스케줄 관리 <onboarding@resend.dev>";

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL || DEFAULT_FROM;

  if (!apiKey) {
    const text = input.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    console.warn(
      `[email] RESEND_API_KEY 미설정 — 발송 시뮬레이션\n` +
        `  to: ${JSON.stringify(input.to)}\n` +
        `  subject: ${input.subject}\n` +
        `  본문(텍스트): ${text}`,
    );
    return { id: null, simulated: true };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: Array.isArray(input.to) ? input.to : [input.to],
      subject: input.subject,
      html: input.html,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend 발송 실패 (${res.status}): ${body}`);
  }

  const data = (await res.json().catch(() => ({}))) as { id?: string };
  return { id: data.id ?? null, simulated: false };
}
