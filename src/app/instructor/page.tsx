import { requireRole } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";

export default async function InstructorHome() {
  const { account } = await requireRole("instructor");

  return (
    <AppShell roleLabel="강사" userName={account.display_name ?? "강사"}>
      <div className="rounded-lg border border-dashed border-border bg-surface px-4 py-12 text-center text-sm text-muted">
        강사 정보 입력 화면은 준비 중입니다. (다음 작업지시서)
      </div>
    </AppShell>
  );
}
