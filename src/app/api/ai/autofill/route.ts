import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { autofillFromFile, type AutofillKind } from "@/lib/ai-autofill";

export const runtime = "nodejs"; // kordoc 이 fs/네이티브 하위 의존성을 쓰므로 edge 불가
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const MAX_BYTES = 15 * 1024 * 1024;

export async function POST(req: NextRequest) {
  // staff 인증
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "로그인이 필요합니다." }, { status: 401 });
  }
  const { data: account } = await supabase
    .from("app_accounts")
    .select("role")
    .eq("id", user.id)
    .maybeSingle<{ role: string }>();
  if (account?.role !== "staff") {
    return NextResponse.json({ ok: false, error: "담당자만 사용할 수 있습니다." }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "잘못된 요청입니다." }, { status: 400 });
  }

  const kind = String(form.get("kind") ?? "") as AutofillKind;
  if (kind !== "school-request" && kind !== "instructor") {
    return NextResponse.json({ ok: false, error: "kind 가 올바르지 않습니다." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ ok: false, error: "파일을 선택하세요." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ ok: false, error: "파일은 15MB 이하만 가능합니다." }, { status: 400 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await autofillFromFile(kind, buffer, file.name, file.type);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error("[ai/autofill]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "자동채움 실패" },
      { status: 500 },
    );
  }
}
