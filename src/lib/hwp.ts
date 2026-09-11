// 한글 문서(.hwp / .hwpx) 파싱 — 서버 전용.
// 표(병합 셀·rowspan/colspan 포함)를 무손실로 다루는 kordoc 라이브러리를 사용한다.
// 자체 구현한 정규식 기반 추출기는 표 구조를 완벽히 재현하지 못해(예: 여러
// 프로그램이 한 표에 나란히 있을 때 값이 엉뚱한 행에 붙는 문제) kordoc 으로 교체.
// - markdown: AI 자동채움에 넘길 원문 (표는 실제 <table rowspan/colspan> 형태로 포함)
// - html: 오른쪽 "원본 미리보기" 에 그대로 렌더링할 완성된 HTML 문서

import { parse as kordocParse, renderHtml as kordocRenderHtml } from "kordoc";

export const HWP_EXTENSIONS = [".hwp", ".hwpx"] as const;

export function isHwpFilename(name: string): boolean {
  const lower = name.toLowerCase();
  return HWP_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export interface HwpParseResult {
  /** AI 에 넘길 원문 텍스트(마크다운, 표는 HTML <table> 로 포함되어 구조 보존) */
  markdown: string;
  /** 원본 미리보기용 완성된 HTML 문서(스타일 포함, iframe 에 그대로 표시) */
  html: string;
}

// kordoc.parse() 는 버퍼 내용(매직 바이트)으로 형식을 자동 감지하므로 파일명은 불필요.
export async function parseHwpDocument(buffer: Buffer): Promise<HwpParseResult> {
  const result = await kordocParse(buffer);
  if (!result.success || !result.markdown?.trim()) {
    throw new Error(
      "이 한글 문서에서 텍스트를 추출하지 못했습니다. 항목을 직접 입력하거나 사진으로 올려주세요.",
    );
  }
  const html = await kordocRenderHtml(result.markdown);
  return { markdown: result.markdown, html };
}
