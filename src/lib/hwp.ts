// 한글 문서(.hwp / .hwpx) 텍스트 추출 — 서버 전용.
// 완벽 추출이 목적이 아니라 AI 자동채움에 넘길 원문 텍스트 확보가 목적.
// 표는 "셀1 | 셀2 | 셀3" 처럼 행 단위로 구분해서 뽑는다 — 그래야 여러 프로그램이
// 나란히 있는 표에서 값이 엉뚱한 행(프로그램)에 붙는 걸 막을 수 있다.

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

// ================================================================
// HWPX: ZIP + XML (Contents/sectionN.xml)
// 정규식으로 <hp:t> 만 긁으면 표의 행/열 구분이 사라져 값이 엉뚱한 프로그램
// 행에 붙어버린다 → 태그를 토큰화해서 트리로 재구성한 뒤 표는 행 단위로 추출.
// ================================================================

interface XNode {
  name: string;
  children: (XNode | string)[];
}

type Tok =
  | { type: "open"; name: string }
  | { type: "close"; name: string }
  | { type: "text"; text: string };

function tokenizeXml(xml: string): Tok[] {
  const toks: Tok[] = [];
  const re = /<(\/?)([a-zA-Z][\w.-]*(?::[a-zA-Z][\w.-]*)?)([^>]*?)(\/?)>|([^<]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    if (m[5] !== undefined) {
      const text = decodeXmlEntities(m[5]);
      if (text.trim()) toks.push({ type: "text", text });
      continue;
    }
    const closing = m[1] === "/";
    const name = m[2].split(":").pop() as string; // 네임스페이스 접두어 제거
    const selfClose = m[4] === "/";
    if (closing) {
      toks.push({ type: "close", name });
    } else {
      toks.push({ type: "open", name });
      if (selfClose) toks.push({ type: "close", name });
    }
  }
  return toks;
}

/** 토큰을 트리로. 짝이 안 맞는 태그도 있는 그대로 최대한 복구(permissive). */
function buildXTree(xml: string): XNode {
  const toks = tokenizeXml(xml);
  let i = 0;
  function parseNode(name: string): XNode {
    const node: XNode = { name, children: [] };
    while (i < toks.length) {
      const t = toks[i];
      if (t.type === "text") {
        node.children.push(t.text);
        i++;
      } else if (t.type === "open") {
        i++;
        node.children.push(parseNode(t.name));
      } else {
        i++; // close — 현재 노드 종료로 간주(비검증)
        return node;
      }
    }
    return node;
  }
  const root: XNode = { name: "#root", children: [] };
  while (i < toks.length) {
    const t = toks[i];
    if (t.type === "text") {
      root.children.push(t.text);
      i++;
    } else if (t.type === "open") {
      i++;
      root.children.push(parseNode(t.name));
    } else {
      i++;
    }
  }
  return root;
}

function collectText(n: XNode | string): string {
  if (typeof n === "string") return n;
  let s = "";
  for (const c of n.children) s += collectText(c);
  return s;
}

function containsTable(n: XNode): boolean {
  for (const c of n.children) {
    if (typeof c === "string") continue;
    if (c.name === "tbl" || containsTable(c)) return true;
  }
  return false;
}

/** hp:p(문단) / hp:tbl·tr·tc(표) 구조를 유지하며 줄 단위 텍스트로 변환 */
function walkHwpxNode(n: XNode, out: string[]): void {
  for (const c of n.children) {
    if (typeof c === "string") continue;
    if (c.name === "p") {
      if (containsTable(c)) {
        walkHwpxNode(c, out);
      } else {
        const text = collectText(c).replace(/\s+/g, " ").trim();
        if (text) out.push(text);
      }
    } else if (c.name === "tbl") {
      walkHwpxNode(c, out);
    } else if (c.name === "tr") {
      const cells: string[] = [];
      for (const cc of c.children) {
        if (typeof cc === "string") continue;
        if (cc.name === "tc") {
          cells.push(collectText(cc).replace(/\s+/g, " ").trim());
        }
      }
      const line = cells.filter(Boolean).join(" | ");
      if (line) out.push(line);
    } else {
      // run/subList/lineseg 등 컨테이너 + 그 외 태그는 하위를 그대로 이어 추출
      walkHwpxNode(c, out);
    }
  }
}

function extractHwpx(buffer: Buffer): string {
  const files = unzipSync(new Uint8Array(buffer));
  const sectionEntries = Object.entries(files)
    .filter(([name]) => /section\d+\.xml$/i.test(name))
    .sort(([a], [b]) => a.localeCompare(b));
  const parts: string[] = [];
  for (const [, data] of sectionEntries) {
    const xml = strFromU8(data);
    const tree = buildXTree(xml);
    const lines: string[] = [];
    walkHwpxNode(tree, lines);
    if (lines.length) parts.push(lines.join("\n"));
  }
  return normalize(parts.join("\n\n"));
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

// ================================================================
// HWP 5.x: OLE 복합문서
// 1차: hwp.js 로 본문/표 전체 파싱(표는 행 단위 " | " 로). 실패(압축 형식 등)하면
// 2차: OLE 의 PrvText(미리보기 텍스트, 무압축 UTF-16LE) 스트림으로 폴백.
// ================================================================
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
    // PrvText 는 문단/표 셀이 <...> 로 감싸짐 → 마커 정리(표 셀 경계는 " | " 로)
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
function paragraphText(paragraph: any): string {
  let line = "";
  for (const ch of paragraph?.content ?? []) {
    if (typeof ch?.value === "string") line += ch.value;
  }
  return line;
}

function collectParagraph(paragraph: any, out: string[]): void {
  const line = paragraphText(paragraph);
  if (line.trim()) out.push(line);

  for (const control of paragraph?.controls ?? []) {
    // 표 컨트롤: content 는 ParagraphList[][] (행 × 열) → 한 행 = 한 줄, 셀은 " | " 로 구분
    if (Array.isArray(control?.content)) {
      for (const row of control.content) {
        if (!Array.isArray(row)) continue;
        const cells: string[] = [];
        for (const cell of row) {
          const cellLines: string[] = [];
          for (const cellParagraph of cell?.items ?? []) {
            collectParagraph(cellParagraph, cellLines);
          }
          cells.push(cellLines.join(" ").trim());
        }
        const rowLine = cells.filter(Boolean).join(" | ");
        if (rowLine) out.push(rowLine);
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
