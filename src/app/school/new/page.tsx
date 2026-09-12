import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getSchoolContext } from "@/lib/auth";
import type { Program } from "@/lib/types";
import { RequestForm } from "./request-form";

export default async function NewRequestPage() {
  const ctx = await getSchoolContext();
  const supabase = await createClient();
  const { data: programs } = await supabase
    .from("programs")
    .select("*")
    .eq("is_active", true)
    .order("category")
    .order("sub_program", { nullsFirst: true })
    .returns<Program[]>();

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5">
      <div>
        <Link href="/school" className="text-sm text-link hover:underline">
          ← 신청 목록
        </Link>
        <h1 className="mt-1 text-xl font-bold">신규 교육 프로그램 신청</h1>
      </div>

      {ctx.readOnly ? (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          담당자 미리보기 모드에서는 신청서를 작성할 수 없습니다.
        </p>
      ) : !programs || programs.length === 0 ? (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          등록된 프로그램이 없습니다. 담당자에게 문의하세요.
        </p>
      ) : (
        <RequestForm programs={programs} />
      )}
    </div>
  );
}
