// 작업지시서 #019 (2-1) — 기관 설정(최초 1회 등록, 이후 경력증명서 발급에 공용 사용)

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { OrgSettings } from "@/lib/types";
import { OrgSettingsForm } from "./org-settings-form";

export default async function OrgSettingsPage() {
  await requireRole("staff");
  const supabase = await createClient();

  const { data: settings } = await supabase
    .from("org_settings")
    .select("*")
    .eq("id", true)
    .maybeSingle<OrgSettings>();

  let sealImageUrl: string | null = null;
  if (settings?.seal_image_path) {
    const { data } = await supabase.storage
      .from("org-assets")
      .createSignedUrl(settings.seal_image_path, 60 * 60);
    sealImageUrl = data?.signedUrl ?? null;
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-bold">기관 설정</h1>
        <p className="mt-1 text-sm text-muted">
          경력(강의)증명서 발급 시 공통으로 쓰이는 기관 정보와 직인 이미지를
          등록합니다.
        </p>
      </div>

      <OrgSettingsForm
        orgName={settings?.org_name ?? ""}
        ceoName={settings?.ceo_name ?? ""}
        address={settings?.address ?? ""}
        sealImageUrl={sealImageUrl}
        updatedAtLabel={
          settings?.updated_at
            ? `${new Date(settings.updated_at).toLocaleString("ko-KR")} · ${settings.updated_by ?? "담당자"}`
            : null
        }
      />
    </div>
  );
}
