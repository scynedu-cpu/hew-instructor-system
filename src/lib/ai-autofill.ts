// AI 자동채움 공통 로직 — 서버 전용.
// hwp/hwpx → 텍스트 추출, 이미지 → 그대로. Claude API 에 넘겨 대상 화면의
// 필드 구조(JSON)에 맞춰 값 추출. 결과는 폼에만 채워지고 저장은 관리자가 별도로.
//
// 민감정보 원칙: 주민등록번호·계좌번호 등은 추출하지 않는다(프롬프트에서 금지).

import Anthropic from "@anthropic-ai/sdk";
import { parseHwpDocument, isHwpFilename } from "@/lib/hwp";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5";
const MAX_TEXT = 40_000;

export type AutofillKind = "school-request" | "instructor";
export type AutofillSource = "hwp" | "image" | "pdf";

export interface AutofillResult {
  kind: AutofillKind;
  source: AutofillSource;
  fields: Record<string, unknown>;
  textPreview: string | null;
  /** 오른쪽 "원본 미리보기" 용 완성된 HTML(hwp/hwpx 일 때만; iframe 에 그대로 표시) */
  previewHtml: string | null;
  simulated: boolean;
}

const IMAGE_MEDIA: Record<string, "image/jpeg" | "image/png" | "image/webp" | "image/gif"> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

function guessImageMedia(filename: string, mimeType: string): string | null {
  if (mimeType.startsWith("image/")) return mimeType === "image/jpg" ? "image/jpeg" : mimeType;
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return IMAGE_MEDIA[ext] ?? null;
}

const SCHEMA: Record<AutofillKind, string> = {
  "school-request": `{
  "school_name": string|null,   // 신청 학교명
  "teacher_name": string|null,  // 신청 담당교사 이름
  "items": [                     // 신청서에 ○/체크된 프로그램마다 1개. 여러 개면 여러 항목.
    {
      "program_name": string|null,          // 프로그램명 (대분류 또는 세부항목, 예: "현장직업체험 로봇공학자", "직업인특강")
      "requested_dates": string[]|null,     // 희망일자 "YYYY-MM-DD" 배열
      "dates_tbd": boolean,                 // 일자 미정이면 true
      "preferred_time_slot": string|null,   // 시간대 (예: "3,4교시", "10:00~12:00")
      "expected_student_count": string|null,// 인원 (예: "90명", "4학급")
      "note": string|null                   // 비고
    }
  ]|null
}`,
  instructor: `{
  "name": string|null,
  "birth_date": string|null,   // "YYYY-MM-DD"
  "address": string|null,
  "home_phone": string|null,
  "mobile_phone": string|null,
  "email": string|null,
  "career": [ { "year_month": string|null, "description": string|null, "issuing_org": string|null } ]|null,
  "certifications": [ { "cert_name": string|null, "issued_date": string|null, "issuing_org": string|null } ]|null,
  "specialties": string[]|null
}`,
};

function buildSystem(kind: AutofillKind): string {
  return [
    "너는 한국의 교육지원센터 담당자를 돕는 문서 정보 추출기다.",
    "입력으로 받은 문서(또는 사진/스캔)에서 아래 JSON 스키마의 각 필드 값을 추출한다.",
    "",
    "규칙:",
    "- 반드시 JSON 객체 하나만 출력. 설명·코드펜스 금지.",
    "- 문서에 없거나 확실하지 않은 값은 null (배열은 빈 배열 대신 null 가능).",
    "- 날짜는 'YYYY-MM-DD'. 연도가 없으면 문맥상 올해로 추정하되 애매하면 null.",
    "- 주민등록번호, 여권번호, 계좌번호, 카드번호 등 민감정보는 절대 추출하지 말 것(스키마에도 없음).",
    "- 표/서식이 섞여 있어도 의미 기준으로 값을 뽑는다.",
    "",
    "JSON 스키마:",
    SCHEMA[kind],
  ].join("\n");
}

function parseJsonObject(raw: string): Record<string, unknown> {
  let s = raw.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("AI 응답에서 JSON 을 찾지 못했습니다.");
  }
  return JSON.parse(s.slice(start, end + 1)) as Record<string, unknown>;
}

/** 테스트/키 미설정용 모의 추출 (AI_AUTOFILL_MOCK=1) */
function mockFields(
  kind: AutofillKind,
  source: AutofillSource,
  text: string | null,
): Record<string, unknown> {
  // 이미지/PDF: 텍스트가 없으니 형식 시연용 고정 샘플 반환
  if (source === "image" || source === "pdf") {
    return kind === "school-request"
      ? {
          school_name: "매헌중학교",
          teacher_name: "정담임",
          items: [
            {
              program_name: "직업인특강",
              requested_dates: null,
              dates_tbd: true,
              preferred_time_slot: "3,4교시",
              expected_student_count: "5학급",
              note: null,
            },
            {
              program_name: "현장직업체험 드론전문가",
              requested_dates: ["2026-11-20"],
              dates_tbd: false,
              preferred_time_slot: "5,6교시",
              expected_student_count: "2학급",
              note: "체육관 사용",
            },
          ],
        }
      : {
          name: "이수민",
          birth_date: "1990-04-11",
          address: "서울시 서초구 양재동",
          home_phone: null,
          mobile_phone: "010-2222-3333",
          email: null,
          career: [
            { year_month: "2015/02", description: "OO대학교 교육공학과 졸업", issuing_org: "OO대학교" },
          ],
          certifications: null,
          specialties: ["진로상담", "메이커교육"],
        };
  }
  if (kind === "school-request") {
    const dates = [
      ...(text?.matchAll(/(\d{4}-\d{2}-\d{2})/g) ?? []),
    ].map((m) => m[1]);
    const progNames = [
      ...(text?.matchAll(
        /(센터체험|직업인특강|현장직업체험[^\n]*|진로[^\n]*|전환기교육)/g,
      ) ?? []),
    ].map((m) => m[1].trim());
    const uniqProg = [...new Set(progNames)];
    return {
      school_name:
        text?.match(/([가-힣]+(?:초등학교|중학교|고등학교))/)?.[1] ?? null,
      teacher_name: text?.match(/담당\s*교사[:：]?\s*([가-힣]{2,4})/)?.[1] ?? null,
      items: (uniqProg.length ? uniqProg : ["센터체험"]).map((name) => ({
        program_name: name,
        requested_dates: dates.length ? dates : null,
        dates_tbd: dates.length === 0,
        preferred_time_slot:
          text?.match(
            /(\d{1,2}:\d{2}\s*[~∼-]\s*\d{1,2}:\d{2}|\d[,·]\d교시)/,
          )?.[1] ?? null,
        expected_student_count:
          text?.match(/(\d+\s*명|\d+\s*학급)/)?.[1] ?? null,
        note: null,
      })),
    };
  }
  const line = (label: RegExp) => text?.match(label)?.[1]?.trim() ?? null;
  const careerMock = [
    ...(text?.matchAll(
      /(\d{4}\/\d{2})\s+(.+?)\s*\(([^)]+)\)/g,
    ) ?? []),
  ].map((m) => ({
    year_month: m[1],
    description: m[2].trim(),
    issuing_org: m[3].trim(),
  }));
  const certMock = text?.match(/자격증[:：]\s*(.+)/)?.[1]?.trim();
  const specLine = text?.match(/전문\s*분야[:：]\s*(.+)/)?.[1];
  return {
    name: line(/성\s*명[:：]?\s*([가-힣]{2,4})/),
    birth_date: line(/생년월일[:：]?\s*(\d{4}-\d{2}-\d{2})/),
    address: line(/주\s*소[:：]?\s*(.+)/),
    home_phone: line(/자택전화[:：]?\s*([\d-]+)/),
    mobile_phone:
      line(/휴대전화[:：]?\s*([\d-]+)/) ??
      text?.match(/01[016-9][-\s]?\d{3,4}[-\s]?\d{4}/)?.[0] ??
      null,
    email: text?.match(/[\w.+-]+@[\w-]+\.[\w.-]+/)?.[0] ?? null,
    career: careerMock.length ? careerMock : null,
    certifications: certMock
      ? [
          {
            cert_name: certMock.replace(/\s+\d{4}-\d{2}-\d{2}.*$/, "").trim(),
            issued_date: certMock.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? null,
            issuing_org:
              certMock.match(/\d{4}-\d{2}-\d{2}\s+(.+)$/)?.[1]?.trim() ?? null,
          },
        ]
      : null,
    specialties: specLine
      ? specLine.split(/[,、·]/).map((s) => s.trim()).filter(Boolean)
      : null,
  };
}

function isPdfFile(filename: string, mimeType: string): boolean {
  return mimeType === "application/pdf" || filename.toLowerCase().endsWith(".pdf");
}

export async function autofillFromFile(
  kind: AutofillKind,
  buffer: Buffer,
  filename: string,
  mimeType: string,
): Promise<AutofillResult> {
  const isHwp = isHwpFilename(filename);
  const isPdf = !isHwp && isPdfFile(filename, mimeType);
  const imageMedia = isHwp || isPdf ? null : guessImageMedia(filename, mimeType);
  if (!isHwp && !isPdf && !imageMedia) {
    throw new Error("hwp/hwpx·PDF 문서 또는 이미지(jpg/png/webp) 파일만 가능합니다.");
  }

  let text: string | null = null;
  let previewHtml: string | null = null;
  if (isHwp) {
    const parsed = await parseHwpDocument(buffer);
    text = parsed.markdown;
    previewHtml = parsed.html;
    if (!text.trim()) throw new Error("문서에서 텍스트를 추출하지 못했습니다.");
  }
  // PDF는 kordoc(hwp 전용 파서)을 거치지 않고 Claude 의 네이티브 PDF 입력(document
  // 블록)으로 그대로 전달한다 — 별도 렌더링/텍스트 추출 의존성이 필요 없다.
  const source: AutofillSource = isHwp ? "hwp" : isPdf ? "pdf" : "image";
  const textPreview = text ? text.slice(0, 20_000) : null; // 오른쪽 원본 대조용(폴백용)

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    if (process.env.AI_AUTOFILL_MOCK === "1") {
      return {
        kind,
        source,
        fields: mockFields(kind, source, text),
        textPreview,
        previewHtml,
        simulated: true,
      };
    }
    throw new Error(
      "AI 자동채움을 사용하려면 ANTHROPIC_API_KEY 를 설정하세요 (.env.local). 항목은 직접 입력할 수 있습니다.",
    );
  }

  const client = new Anthropic();
  const content: Anthropic.MessageParam["content"] = isHwp
    ? [
        {
          type: "text",
          text: `다음은 업로드된 한글 문서에서 추출한 텍스트입니다.\n\n<문서>\n${text!.slice(
            0,
            MAX_TEXT,
          )}\n</문서>\n\n스키마에 맞춰 JSON 만 출력하세요.`,
        },
      ]
    : isPdf
      ? [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: buffer.toString("base64"),
            },
          },
          {
            type: "text",
            text: "이 PDF 문서에서 스키마에 맞춰 값을 추출해 JSON 만 출력하세요.",
          },
        ]
      : [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: imageMedia as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
              data: buffer.toString("base64"),
            },
          },
          {
            type: "text",
            text: "이 사진/스캔 이미지에서 스키마에 맞춰 값을 추출해 JSON 만 출력하세요.",
          },
        ];

  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: buildSystem(kind),
    messages: [{ role: "user", content }],
  });

  const out = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  return {
    kind,
    source,
    fields: parseJsonObject(out),
    textPreview,
    previewHtml,
    simulated: false,
  };
}
