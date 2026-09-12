import { type NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { requireUser } from "@/lib/auth";

// 작업지시서 #011 — 경력·자격증 내용으로 전문분야 키워드 후보 추천.
// DB 를 읽거나 쓰지 않는 순수 변환 API — 화면에 입력돼 있는(저장 전이어도
// 되는) 경력/자격증 텍스트를 그대로 받아 Claude 에 넘긴다.

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5";

interface CareerInput {
  year_month?: string | null;
  description?: string | null;
  issuing_org?: string | null;
}
interface CertInput {
  cert_name?: string | null;
  issued_date?: string | null;
  issuing_org?: string | null;
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function buildUserText(
  career: CareerInput[],
  certs: CertInput[],
  existing: string[],
): string {
  const careerLines = career
    .filter((c) => str(c.description))
    .map((c) => `- ${str(c.year_month)} ${str(c.description)} (${str(c.issuing_org)})`);
  const certLines = certs
    .filter((c) => str(c.cert_name))
    .map((c) => `- ${str(c.cert_name)} ${str(c.issued_date)} (${str(c.issuing_org)})`);
  return [
    "경력:",
    careerLines.length ? careerLines.join("\n") : "(없음)",
    "",
    "자격증:",
    certLines.length ? certLines.join("\n") : "(없음)",
    "",
    `이미 등록된 전문분야: ${existing.length ? existing.join(", ") : "(없음)"}`,
  ].join("\n");
}

const SYSTEM_PROMPT = [
  "너는 한국의 교육지원센터에서 강사 프로필 입력을 돕는 도우미다.",
  "강사의 경력과 자격증 내용을 보고, 이 강사를 표현할 수 있는 '전문분야' 키워드",
  "후보를 제안한다(예: '진로상담', '메이커교육', 'AI코딩교육', '드론전문가').",
  "",
  "규칙:",
  "- 반드시 JSON 배열만 출력. 설명·코드펜스 금지. 예: [\"진로상담\", \"직업상담\"]",
  "- 3~5개.",
  "- 각 키워드는 2~10자 내외의 짧은 명사구.",
  "- 이미 등록된 전문분야와 겹치는(같거나 의미가 사실상 같은) 키워드는 절대 포함하지 말 것.",
  "- 경력·자격증 내용이 부족하면 무리해서 추측하지 말고, 확실히 뒷받침되는 것만 제안.",
  "- 근거가 부족하면 5개를 채우지 말고 더 적게 제안해도 된다.",
].join("\n");

function parseJsonArray(raw: string): string[] {
  let s = raw.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const start = s.indexOf("[");
  const end = s.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("AI 응답에서 목록을 찾지 못했습니다.");
  }
  const parsed = JSON.parse(s.slice(start, end + 1));
  if (!Array.isArray(parsed)) throw new Error("AI 응답 형식이 올바르지 않습니다.");
  return parsed.map((v) => String(v).trim()).filter(Boolean);
}

/** 키 미설정 시 최소한의 텍스트 기반 모의 추천(AI_AUTOFILL_MOCK=1) */
function mockSuggestions(
  career: CareerInput[],
  certs: CertInput[],
  existingLower: Set<string>,
): string[] {
  const words = new Set<string>();
  for (const c of certs) {
    const name = str(c.cert_name).replace(/\s*(자격증|자격|수료증)?\s*\d*급?$/, "");
    if (name.length >= 2) words.add(name);
  }
  for (const c of career) {
    const m = str(c.description).match(/[가-힣]{2,6}(?:상담|교육|코딩|전문가|강사|지도)/);
    if (m) words.add(m[0]);
  }
  return [...words]
    .filter((w) => !existingLower.has(w.toLowerCase()))
    .slice(0, 5);
}

export async function POST(req: NextRequest) {
  const { account } = await requireUser();
  if (account.role !== "staff" && account.role !== "instructor") {
    return NextResponse.json({ ok: false, error: "권한이 없습니다." }, { status: 403 });
  }

  let body: { career?: unknown; certs?: unknown; existing?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "잘못된 요청입니다." }, { status: 400 });
  }

  const career: CareerInput[] = Array.isArray(body.career) ? body.career : [];
  const certs: CertInput[] = Array.isArray(body.certs) ? body.certs : [];
  const existing: string[] = Array.isArray(body.existing)
    ? body.existing.map((v) => String(v))
    : [];

  const hasData =
    career.some((c) => str(c.description)) || certs.some((c) => str(c.cert_name));
  if (!hasData) {
    return NextResponse.json(
      { ok: false, error: "경력 또는 자격증을 먼저 입력하세요." },
      { status: 400 },
    );
  }

  const existingLower = new Set(existing.map((s) => s.trim().toLowerCase()));

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    if (process.env.AI_AUTOFILL_MOCK === "1") {
      return NextResponse.json({
        ok: true,
        suggestions: mockSuggestions(career, certs, existingLower),
        simulated: true,
      });
    }
    return NextResponse.json(
      {
        ok: false,
        error: "AI 추천을 사용하려면 ANTHROPIC_API_KEY 를 설정하세요 (.env.local).",
      },
      { status: 200 },
    );
  }

  try {
    const client = new Anthropic();
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 300,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildUserText(career, certs, existing) }],
    });
    const out = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    const raw = parseJsonArray(out);
    // 모델이 규칙을 놓쳐도 기존 전문분야와 겹치는 항목은 서버에서 한 번 더 거른다
    const suggestions = [...new Set(raw)].filter(
      (s) => !existingLower.has(s.toLowerCase()),
    );
    return NextResponse.json({ ok: true, suggestions, simulated: false });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "추천 생성에 실패했습니다." },
      { status: 500 },
    );
  }
}
