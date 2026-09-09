import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";

export default async function SchoolLayout({ children }: LayoutProps<"/school">) {
  const { account } = await requireRole("school");

  let schoolName = "우리 학교";
  if (account.school_id) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("schools")
      .select("name")
      .eq("id", account.school_id)
      .maybeSingle<{ name: string }>();
    if (data?.name) schoolName = data.name;
  }

  return (
    <AppShell
      roleLabel="학교"
      userName={`${schoolName} · ${account.display_name ?? ""}`}
      nav={[{ href: "/school", label: "신청 목록" }]}
    >
      {children}
    </AppShell>
  );
}
