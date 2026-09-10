// 한글 문서(.hwp / .hwpx) 텍스트 추출 — 서버 전용.
// 완벽 추출이 목적이 아니라 AI 자동채움에 넘길 원문 텍스트 확보가 목적.

import { parse as parseHwp } from "hwp.js";
import { unzipSync, strFromU8 } from "fflate";
import * as CFB from "cfb";

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

// ---- HWP 5.x: OLE 복합문서 ----
// 1차: hwp.js 로 본문/표 전체 파싱. 실패(압축 형식 등)하면
// 2차: OLE 의 PrvText(미리보기 텍스트, 무압축 UTF-16LE) 스트림으로 폴백.
function extractHwp(buffer: Buffer): string {
  try {
    const doc = parseHwp(buffer, { type: "buffer" });
    const out: string[] = [];
    for (const section of doc.sections ?? []) {
      for (const paragraph of section.content ?? []) {
        collectParagraph(paragraph, out);
      }
    }
    const full = normalize(out.join("\n"));
    if (full.trim().length > 0) return full;
  } catch {
    // 폴백으로
  }
  const prv = extractHwpPrvText(buffer);
  if (prv) return prv;
  throw new Error(
    "이 한글 문서에서 텍스트를 추출하지 못했습니다. 항목을 직접 입력하거나 사진으로 올려주세요.",
  );
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function extractHwpPrvText(buffer: Buffer): string | null {
  try {
    const cfb = (CFB as any).read(buffer, { type: "buffer" });
    const entry =
      (CFB as any).find(cfb, "PrvText") ?? (CFB as any).find(cfb, "/PrvText");
    if (!entry?.content) return null;
    const raw = Buffer.from(entry.content as Uint8Array).toString("utf16le");
    // PrvText 는 문단/표 셀이 <...> 로 감싸짐 → 마커 정리
    const cleaned = raw
      .replace(/<>/g, "")
      .replace(/></g, " | ")
      .replace(/[<>]/g, "");
    return normalize(cleaned) || null;
  } catch {
    return null;
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

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
