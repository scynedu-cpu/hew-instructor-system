// 작업지시서 #019 (2-3) — 경력(강의)증명서 PDF 렌더링. 서버 전용.
// #014-1 의 survey-report-pdf.ts 와 동일하게 pdfkit + Noto Sans KR(woff2)로
// 직접 그린다. 정해진 기존 양식이 없어(지시서 1. 확정 사항) 새로 디자인.

import PDFDocument from "pdfkit";
import path from "node:path";
import type { LectureHistoryRow } from "@/lib/types";

const FONT_DIR = path.join(process.cwd(), "node_modules/@fontsource/noto-sans-kr/files");
const FONT_REGULAR = path.join(FONT_DIR, "noto-sans-kr-korean-400-normal.woff2");
const FONT_BOLD = path.join(FONT_DIR, "noto-sans-kr-korean-700-normal.woff2");

const INK = "#18181b";
const MUTED = "#71717a";
const BORDER = "#d4d4d8";
const BRAND = "#1e2a44";

const PAGE_MARGIN = 48;
const CONTENT_WIDTH = 595.28 - PAGE_MARGIN * 2;

export interface CareerCertificateInput {
  documentNo: string;
  instructorName: string;
  instructorBirthDate: string | null;
  periodFrom: string | null; // null = 전체기간
  periodTo: string | null;
  rows: LectureHistoryRow[];
  totalCount: number;
  totalHours: number;
  org: { orgName: string; ceoName: string; address: string };
  sealImageBuffer: Buffer | null;
  issuedAtLabel: string;
}

function ensureSpace(doc: PDFKit.PDFDocument, needed: number) {
  const bottom = doc.page.height - doc.page.margins.bottom;
  if (doc.y + needed > bottom) doc.addPage();
}

const COLS = [
  { key: "no", label: "순번", width: 40, align: "center" as const },
  { key: "date", label: "일자", width: 90, align: "center" as const },
  { key: "school", label: "학교명", width: 150, align: "left" as const },
  { key: "program", label: "프로그램명", width: 160, align: "left" as const },
  { key: "hours", label: "강의시간", width: CONTENT_WIDTH - 40 - 90 - 150 - 160, align: "center" as const },
];

function drawTableHeader(doc: PDFKit.PDFDocument, x: number, y: number): number {
  const rowHeight = 22;
  doc.rect(x, y, CONTENT_WIDTH, rowHeight).fill(BRAND);
  let cx = x;
  doc.font("bold").fontSize(9.5).fillColor("#ffffff");
  for (const col of COLS) {
    doc.text(col.label, cx + 4, y + 6, { width: col.width - 8, align: col.align });
    cx += col.width;
  }
  return y + rowHeight;
}

function drawTableRow(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  cells: string[],
  striped: boolean,
): number {
  const rowHeight = 22;
  if (striped) doc.rect(x, y, CONTENT_WIDTH, rowHeight).fill("#f4f4f5");
  let cx = x;
  doc.font("regular").fontSize(9.5).fillColor(INK);
  cells.forEach((text, i) => {
    const col = COLS[i];
    doc.text(text, cx + 4, y + 6, { width: col.width - 8, align: col.align });
    cx += col.width;
  });
  doc
    .moveTo(x, y + rowHeight)
    .lineTo(x + CONTENT_WIDTH, y + rowHeight)
    .strokeColor(BORDER)
    .lineWidth(0.5)
    .stroke();
  return y + rowHeight;
}

export async function buildCareerCertificatePdf(input: CareerCertificateInput): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: PAGE_MARGIN, bufferPages: true });
  doc.registerFont("regular", FONT_REGULAR);
  doc.registerFont("bold", FONT_BOLD);
  doc.font("regular");

  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });

  // ---- 상단: 기관명 + 문서번호 ----
  doc.font("regular").fontSize(10).fillColor(MUTED).text(input.org.orgName, { continued: true });
  doc.text(`문서번호  ${input.documentNo}`, { align: "right" });
  doc.moveDown(1.2);

  // ---- 제목 ----
  doc.font("bold").fontSize(22).fillColor(INK).text("경력(강의)증명서", { align: "center" });
  doc.moveDown(1.5);

  // ---- 강사 인적사항 ----
  const periodLabel =
    input.periodFrom || input.periodTo
      ? `${input.periodFrom ?? "전체기간"} ~ ${input.periodTo ?? "현재"}`
      : "전체기간";

  function infoRow(label: string, value: string) {
    doc.font("regular").fontSize(11).fillColor(MUTED).text(label, doc.x, doc.y, { continued: true, width: 100 });
    doc.font("bold").fillColor(INK).text(`  ${value}`);
    doc.moveDown(0.3);
  }
  infoRow("성      명", input.instructorName);
  infoRow("생 년 월 일", input.instructorBirthDate ?? "미등록");
  infoRow("조 회 기 간", periodLabel);
  doc.moveDown(0.8);

  // ---- 강의이력 표 ----
  doc.font("bold").fontSize(12).fillColor(INK).text("강의 이력");
  doc.moveDown(0.4);

  let y = drawTableHeader(doc, doc.x, doc.y);
  input.rows.forEach((r, i) => {
    if (y + 22 > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      y = drawTableHeader(doc, PAGE_MARGIN, PAGE_MARGIN);
    }
    y = drawTableRow(
      doc,
      PAGE_MARGIN,
      y,
      [
        String(i + 1),
        r.actualDate ?? "-",
        r.schoolName,
        r.programLabel,
        r.actualHours !== null ? `${r.actualHours}시간` : "-",
      ],
      i % 2 === 1,
    );
  });
  doc.y = y + 12;
  doc.x = PAGE_MARGIN;

  // ---- 요약 ----
  ensureSpace(doc, 40);
  doc.font("regular").fontSize(11).fillColor(MUTED).text("총 강의 건수", doc.x, doc.y, { continued: true, width: 100 });
  doc.font("bold").fillColor(INK).text(`  ${input.totalCount}건`);
  doc.font("regular").fontSize(11).fillColor(MUTED).text("총 강의시간", doc.x, doc.y, { continued: true, width: 100 });
  doc.font("bold").fillColor(INK).text(`  ${input.totalHours}시간`);
  doc.moveDown(2);

  // ---- 발급 정보 + 직인 ----
  ensureSpace(doc, 140);
  doc.font("regular").fontSize(11).fillColor(INK).text(
    "위 사람은 본 기관에서 위와 같이 강의하였음을 증명합니다.",
    { align: "center" },
  );
  doc.moveDown(1);
  doc.font("bold").fontSize(13).fillColor(INK).text(input.issuedAtLabel, { align: "center" });
  doc.moveDown(1);

  const centerX = doc.page.width / 2;
  const nameY = doc.y;
  doc
    .font("bold")
    .fontSize(14)
    .fillColor(INK)
    .text(`${input.org.orgName}  대표  ${input.org.ceoName || ""}`.trim(), 0, nameY, {
      width: doc.page.width,
      align: "center",
    });

  if (input.sealImageBuffer) {
    try {
      const sealSize = 70;
      doc.image(input.sealImageBuffer, centerX + 130, nameY - 15, {
        fit: [sealSize, sealSize],
      });
    } catch {
      // 이미지 형식을 pdfkit이 못 읽는 경우(예: 변환 실패) — 직인 없이 진행
    }
  }

  if (input.org.address) {
    doc.moveDown(2);
    doc.font("regular").fontSize(9).fillColor(MUTED).text(input.org.address, { align: "center" });
  }

  doc.end();
  return done;
}
