import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Program, School } from "@/lib/types";
import { ProxyRequestForm } from "./proxy-request-form";

export default async function ProxyRequestPage() {
  await requireRole("staff");
  const supabase = await createClient();

  const [{ data: schools }, { data: programs }] = await Promise.all([
    supabase
      .from("schools")
      .select("id,name,level")
      .order("name")
      .returns<School[]>(),
    supabase
      .from("programs")
      .select("*")
      .eq("is_active", true)
      .order("category")
      .order("sub_program", { nullsFirst: true })
      .returns<Program[]>(),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link
          href="/staff/requests"
          className="text-sm text-muted hover:underline"
        >
          ← 교육 신청 관리
        </Link>
        <h1 className="mt-1 text-xl font-bold">학교 신청 대리입력</h1>
        <p className="mt-1 text-sm text-muted">
          오른쪽 원본과 왼쪽 자동채움 폼을 나란히 대조하며 입력합니다. 저장하면
          일반 신청과 동일하게 검토·승인 절차를 탑니다.
        </p>
      </div>
      <ProxyRequestForm schools={schools ?? []} programs={programs ?? []} />
    </div>
  );
}
