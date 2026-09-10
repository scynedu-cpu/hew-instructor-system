// 한글 문서(.hwp / .hwpx) 텍스트 추출 — 서버 전용.
// 완벽 추출이 목적이 아니라 AI 자동채움에 넘길 원문 텍스트 확보가 목적.

import { parse as parseHwp } from "hwp.js";
import { unzipSync, strFromU8 } from "fflate";

export const HWP_EXTENSIONS = [".hwp", ".hwpx"] as const;

export function isHwpFilename(name: string): boolean {
  const lower = name.toLowerCase();
  return HWP_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export function extractHwpDocumentText(buffer: Buffer, filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".hwpx")) return extractHwpx(buffer);
  if (lower.endsWith(".hwp")) return extractHwp(buffer);
  throw new Error("지원하지 않는 문서 형식입니다 (.hwp / .hwpx 만 가능).");
}

// ---- HWPX: ZIP + XML (Contents/sectionN.xml 의 <hp:t> 텍스트) ----
function extractHwpx(buffer: Buffer): string {
  const files = unzipSync(new Uint8Array(buffer));
  const parts: string[] = [];
  for (const [name, data] of Object.entries(files)) {
    if (!/section\d+\.xml$/i.test(name)) continue;
    const xml = strFromU8(data);
    const matches = xml.match(/<hp:t[^>]*>([\s\S]*?)<\/hp:t>/g) ?? [];
    for (const m of matches) {
      const inner = decodeXmlEntities(m.replace(/<[^>]+>/g, ""));
      if (inner.trim()) parts.push(inner);
    }
  }
  return normalize(parts.join("\n"));
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, "&");
}

// ---- HWP 5.x: OLE 복합문서 → hwp.js 파싱 → 문단/표 텍스트 ----
function extractHwp(buffer: Buffer): string {
  // hwp.js 의 parse 는 CFB.read 옵션을 그대로 받는다. Node Buffer 는 type:"buffer".
  const doc = parseHwp(buffer, { type: "buffer" });
  const out: string[] = [];
  for (const section of doc.sections ?? []) {
    for (const paragraph of section.content ?? []) {
      collectParagraph(paragraph, out);
    }
  }
  return normalize(out.join("\n"));
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function collectParagraph(paragraph: any, out: string[]): void {
  let line = "";
  for (const ch of paragraph?.content ?? []) {
    if (typeof ch?.value === "string") line += ch.value;
  }
  if (line.trim()) out.push(line);

  for (const control of paragraph?.controls ?? []) {
    // 표 컨트롤: content 는 ParagraphList[][] (행 × 열)
    if (Array.isArray(control?.content)) {
      for (const row of control.content) {
        if (!Array.isArray(row)) continue;
        for (const cell of row) {
          for (const cellParagraph of cell?.items ?? []) {
            collectParagraph(cellParagraph, out);
          }
        }
      }
    }
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function normalize(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
