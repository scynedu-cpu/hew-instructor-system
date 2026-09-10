import { type NextRequest, NextResponse } from "next/server";
import { runDocumentExpiryNotifications } from "@/lib/document-expiry";

// 매일 1회 Vercel Cron 이 호출 (vercel.json). 수동 실행도 가능.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // 미설정(로컬) 시 허용
  // Vercel Cron 은 Authorization: Bearer <CRON_SECRET> 헤더를 자동으로 붙인다
  if (req.headers.get("authorization") === `Bearer ${secret}`) return true;
  // 수동 테스트용
  return new URL(req.url).searchParams.get("secret") === secret;
}

async function handle(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await runDocumentExpiryNotifications();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error("[cron/document-expiry]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

export const GET = handle;
export const POST = handle;
