// 작업지시서 #014-1 (2-5) — 구청·교육청 제출용 보고서 PDF 렌더링. 서버 전용.
// 차트 라이브러리(recharts) 는 브라우저 전용이라 서버에서는 못 쓴다 —
// pdfkit 의 기본 도형(rect/line/text) 으로 막대그래프를 직접 그린다.

import PDFDocument from "pdfkit";
import path from "node:path";
import type { ReportData } from "@/lib/survey-report-data";

const FONT_DIR = path.join(process.cwd(), "node_modules/@fontsource/noto-sans-kr/files");
const FONT_REGULAR = path.join(FONT_DIR, "noto-sans-kr-korean-400-normal.woff2");
const FONT_BOLD = path.join(FONT_DIR, "noto-sans-kr-korean-700-normal.woff2");

const BRAND = "#1e2a44";
const MUTED = "#71717a";
const BORDER = "#e4e4e7";
const RED = "#dc2626";

const PAGE_MARGIN = 40;
const CONTENT_WIDTH = 595.28 - PAGE_MARGIN * 2; // A4 width - margins

function sectionTitle(doc: PDFKit.PDFDocument, text: string) {
  ensureSpace(doc, 30);
  doc.font("bold").fontSize(13).fillColor("#18181b").text(text, { paragraphGap: 4 });
  doc
    .moveTo(doc.x, doc.y + 2)
    .lineTo(doc.x + CONTENT_WIDTH, doc.y + 2)
    .strokeColor(BORDER)
    .stroke();
  doc.moveDown(0.6);
}

function ensureSpace(doc: PDFKit.PDFDocument, needed: number) {
  const bottom = doc.page.height - doc.page.margins.bottom;
  if (doc.y + needed > bottom) doc.addPage();
}

/** 0~5점 평균 막대그래프를 그대로 그린다(질문/순위 공통으로 재사용). */
function drawAvgBarChart(
  doc: PDFKit.PDFDocument,
  items: { label: string; value: number | null; highlight?: boolean; sub?: string }[],
  opts: { height?: number; max?: number } = {},
) {
  if (items.length === 0) {
    doc.font("regular").fontSize(10).fillColor(MUTED).text("표시할 데이터가 없습니다.");
    doc.moveDown(0.5);
    return;
  }
  const height = opts.height ?? 110;
  const max = opts.max ?? 5;
  ensureSpace(doc, height + 40);

  const chartX = doc.x;
  const chartY = doc.y;
  const chartWidth = CONTENT_WIDTH;
  const slot = chartWidth / items.length;
  const barWidth = Math.min(slot * 0.55, 42);

  // 기준선(0)
  doc
    .moveTo(chartX, chartY + height)
    .lineTo(chartX + chartWidth, chartY + height)
    .strokeColor(BORDER)
    .stroke();

  items.forEach((item, i) => {
    const cx = chartX + slot * i + slot / 2;
    const v = item.value ?? 0;
    const barHeight = Math.max((v / max) * height, item.value === null ? 0 : 1);
    const color = item.highlight ? RED : BRAND;
    if (item.value !== null) {
      doc
        .rect(cx - barWidth / 2, chartY + height - barHeight, barWidth, barHeight)
        .fill(color);
      doc
        .font("regular")
        .fontSize(8)
        .fillColor("#18181b")
        .text(String(item.value), cx - barWidth / 2, chartY + height - barHeight - 11, {
          width: barWidth,
          align: "center",
        });
    } else {
      doc
        .font("regular")
        .fontSize(7.5)
        .fillColor(MUTED)
        .text("응답없음", cx - slot / 2 + 2, chartY + height - 10, { width: slot - 4, align: "center" });
    }
    doc
      .font("regular")
      .fontSize(7.5)
      .fillColor(MUTED)
      .text(item.label, cx - slot / 2 + 2, chartY + height + 4, { width: slot - 4, align: "center" });
  });

  doc.y = chartY + height + 16;
  doc.x = chartX;
}

function drawKeyValueRow(doc: PDFKit.PDFDocument, label: string, value: string) {
  ensureSpace(doc, 16);
  doc.font("regular").fontSize(10).fillColor(MUTED).text(label, doc.x, doc.y, { continued: true, width: 160 });
  doc.font("bold").fillColor("#18181b").text(`  ${value}`);
  doc.moveDown(0.2);
}

export async function buildSurveyReportPdf(data: ReportData): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: PAGE_MARGIN, bufferPages: true });
  doc.registerFont("regular", FONT_REGULAR);
  doc.registerFont("bold", FONT_BOLD);
  doc.font("regular");

  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });

  // ---- 표지/헤더 ----
  doc.font("bold").fontSize(18).fillColor("#18181b").text("만족도설문 결과 보고서");
  doc.moveDown(0.3);
  doc.font("regular").fontSize(10).fillColor(MUTED).text("양재모 교육지원센터");
  doc.moveDown(0.6);

  const scopeParts: string[] = [];
  scopeParts.push(data.schoolName ? `학교: ${data.schoolName}` : "학교: 전체");
  scopeParts.push(data.groupLabel ? `프로그램그룹: ${data.groupLabel}` : "프로그램그룹: 전체");
  scopeParts.push(`기간: ${data.from ?? "전체"} ~ ${data.to ?? "전체"}`);
  doc.font("regular").fontSize(9.5).fillColor(MUTED).text(scopeParts.join("   ·   "));
  doc
    .font("regular")
    .fontSize(9)
    .fillColor(MUTED)
    .text(`생성일: ${new Date().toLocaleString("ko-KR")}`);
  doc.moveDown(1);

  // ---- 1. 전체 평균 만족도 및 응답 수 ----
  sectionTitle(doc, "1. 전체 평균 만족도 및 응답 수");
  drawKeyValueRow(doc, "전체 평균 만족도", data.overallAvg !== null ? `${data.overallAvg}점 / 5점` : "응답 없음");
  drawKeyValueRow(doc, "응답 수(문항 기준)", `${data.overallCount}건`);
  doc.moveDown(0.8);

  // ---- 2. 문항별 평균 막대그래프 ----
  sectionTitle(doc, "2. 문항별 평균");
  doc.font("regular").fontSize(9.5).fillColor(MUTED).text("공통 문항");
  doc.moveDown(0.3);
  {
    const minAvg = data.commonQuestions.reduce<number | null>((min, q) => {
      if (q.avg === null) return min;
      return min === null ? q.avg : Math.min(min, q.avg);
    }, null);
    drawAvgBarChart(
      doc,
      data.commonQuestions.map((q, i) => ({
        label: `Q${i + 1}`,
        value: q.avg,
        highlight: q.avg !== null && q.avg === minAvg,
      })),
    );
    doc.font("regular").fontSize(8).fillColor(MUTED);
    data.commonQuestions.forEach((q, i) => {
      ensureSpace(doc, 12);
      doc.text(`Q${i + 1}. ${q.text}${q.avg !== null ? ` — ${q.avg}점 (${q.count}건)` : " — 응답 없음"}`);
    });
    doc.moveDown(0.6);
  }

  if (data.groupQuestions) {
    doc.font("regular").fontSize(9.5).fillColor(MUTED).text(`${data.groupLabel} 그룹 문항`);
    doc.moveDown(0.3);
    const minAvg = data.groupQuestions.reduce<number | null>((min, q) => {
      if (q.avg === null) return min;
      return min === null ? q.avg : Math.min(min, q.avg);
    }, null);
    drawAvgBarChart(
      doc,
      data.groupQuestions.map((q, i) => ({
        label: `Q${i + 1}`,
        value: q.avg,
        highlight: q.avg !== null && q.avg === minAvg,
      })),
    );
    doc.font("regular").fontSize(8).fillColor(MUTED);
    data.groupQuestions.forEach((q, i) => {
      ensureSpace(doc, 12);
      doc.text(`Q${i + 1}. ${q.text}${q.avg !== null ? ` — ${q.avg}점 (${q.count}건)` : " — 응답 없음"}`);
    });
    doc.moveDown(0.6);
  }

  // ---- 3. 학교별/프로그램그룹별 비교 ----
  if (data.schoolRanking || data.groupRanking) {
    sectionTitle(doc, "3. 학교별 · 프로그램그룹별 비교");
    if (data.schoolRanking) {
      doc.font("regular").fontSize(9.5).fillColor(MUTED).text("학교별 평균 만족도");
      doc.moveDown(0.3);
      drawAvgBarChart(
        doc,
        data.schoolRanking.slice(0, 12).map((r) => ({ label: r.label, value: r.avg })),
      );
    }
    if (data.groupRanking) {
      doc.font("regular").fontSize(9.5).fillColor(MUTED).text("프로그램그룹별 평균 만족도");
      doc.moveDown(0.3);
      drawAvgBarChart(
        doc,
        data.groupRanking.map((r) => ({ label: r.label, value: r.avg })),
      );
    }
    doc.moveDown(0.4);
  }

  // ---- 4. 서술형 분석 요약 ----
  sectionTitle(doc, "4. 서술형 응답 분석 요약");
  if (data.textInsights.length === 0) {
    doc
      .font("regular")
      .fontSize(10)
      .fillColor(MUTED)
      .text("이 범위로 실행된 AI 서술분석 결과가 없습니다. '심화분석 > AI 서술분석'에서 먼저 실행하세요.");
  } else {
    for (const insight of data.textInsights) {
      ensureSpace(doc, 20);
      doc.font("bold").fontSize(10.5).fillColor("#18181b").text(insight.questionText);
      doc.moveDown(0.2);
      for (const t of insight.topics) {
        ensureSpace(doc, 14);
        doc
          .font("regular")
          .fontSize(9.5)
          .fillColor("#18181b")
          .text(`• ${t.topic} (${t.count}건)`);
        if (t.examples[0]) {
          ensureSpace(doc, 12);
          doc.font("regular").fontSize(8.5).fillColor(MUTED).text(`   "${t.examples[0]}"`);
        }
      }
      doc.moveDown(0.5);
    }
  }
  doc.moveDown(0.4);

  // ---- 5. 참여율 통계 ----
  sectionTitle(doc, "5. 참여율 통계");
  drawKeyValueRow(doc, "QR 발급 세션 수", `${data.participation.totalSessions}건`);
  drawKeyValueRow(
    doc,
    "평균 참여율",
    data.participation.avgRate !== null ? `${data.participation.avgRate}%` : "계산 불가",
  );
  drawKeyValueRow(doc, "참여율 30% 미만 세션", `${data.participation.lowCount}건`);
  if (data.participation.lowest.length > 0) {
    doc.moveDown(0.3);
    doc.font("regular").fontSize(9.5).fillColor(MUTED).text("참여율이 낮은 세션");
    doc.moveDown(0.2);
    for (const l of data.participation.lowest) {
      ensureSpace(doc, 12);
      doc
        .font("regular")
        .fontSize(9)
        .fillColor("#18181b")
        .text(`- ${l.schoolName} · ${l.programLabel} — ${l.rate !== null ? `${l.rate}%` : "계산 불가"}`);
    }
  }

  doc.end();
  return done;
}
