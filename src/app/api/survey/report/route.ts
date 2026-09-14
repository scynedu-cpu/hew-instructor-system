import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildReportData } from "@/lib/survey-report-data";
import { buildSurveyReportPdf } from "@/lib/survey-report-pdf";
import type { SurveyGroupCode } from "@/lib/types";

// 작업지시서 #014-1 (2-5) — 구청·교육청 제출용 보고서 PDF 생성
export const runtime = "nodejs"; // pdfkit 이 fs 로 폰트 파일을 읽으므로 edge 불가
export const dynamic = "force-dynamic";

const GROUP_CODES: SurveyGroupCode[] = ["A", "B", "C", "D", "E"];

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  const { data: account } = await supabase
    .from("app_accounts")
    .select("role")
    .eq("id", user.id)
    .maybeSingle<{ role: string }>();
  if (account?.role !== "staff") {
    return NextResponse.json({ error: "담당자만 사용할 수 있습니다." }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const schoolId = sp.get("school") || null;
  const groupRaw = sp.get("group") || null;
  const group = groupRaw && GROUP_CODES.includes(groupRaw as SurveyGroupCode) ? (groupRaw as SurveyGroupCode) : null;
  const from = sp.get("from") || null;
  const to = sp.get("to") || null;

  try {
    const data = await buildReportData({ schoolId, group, from, to });
    const pdf = await buildSurveyReportPdf(data);
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="survey-report.pdf"`,
        "Content-Length": String(pdf.length),
      },
    });
  } catch (e) {
    console.error("[survey/report]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "보고서 생성에 실패했습니다." },
      { status: 500 },
    );
  }
}
