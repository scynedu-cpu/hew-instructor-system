import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Instructor } from "@/lib/types";
import { pickInstructorForEdit } from "./actions";

export default async function StaffInstructorsPage() {
  await requireRole("staff");
  const supabase = await createClient();

  const { data: instructors } = await supabase
    .from("instructors")
    .select("id,name,email,mobile_phone,status,created_at")
    .order("created_at", { ascending: false })
    .returns<Instructor[]>();

  // 계정(app_accounts) + 로그인 이력 매핑
  const { data: accounts } = await supabase
    .from("app_accounts")
    .select("instructor_id,id")
    .eq("role", "instructor")
    .returns<{ instructor_id: string; id: string }[]>();
  const accByInstructor = new Map(
    (accounts ?? []).map((a) => [a.instructor_id, a.id]),
  );

  const admin = createAdminClient();
  const { data: userList } = await admin.auth.admin.listUsers({ perPage: 200 });
  const lastSignInByUser = new Map(
    (userList?.users ?? []).map((u) => [u.id, u.last_sign_in_at]),
  );

  const rows = (instructors ?? []).map((i) => {
    const accountId = accByInstructor.get(i.id);
    const signedIn = accountId ? !!lastSignInByUser.get(accountId) : false;
    return {
      ...i,
      accountState: !accountId
        ? "계정 없음"
        : signedIn
          ? "가입 완료"
          : "초대 대기",
    };
  });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">강사 계정</h1>
        <div className="flex gap-2">
          <Link
            href="/staff/instructors/new-profile"
            className="rounded-md border border-brand px-3 py-2 text-sm font-semibold text-brand hover:bg-blue-50"
          >
            계정 없이 강사 등록 (대리입력)
          </Link>
          <Link
            href="/staff/instructors/new"
            className="rounded-md bg-brand px-3 py-2 text-sm font-semibold text-brand-fg hover:bg-brand-hover"
          >
            신규 강사 초대
          </Link>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-zinc-50 text-left text-xs text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">성명</th>
              <th className="px-3 py-2 font-medium">이메일</th>
              <th className="px-3 py-2 font-medium">휴대전화</th>
              <th className="px-3 py-2 font-medium">계정 상태</th>
              <th className="px-3 py-2 font-medium">등록일</th>
              <th className="px-3 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-muted">
                  등록된 강사가 없습니다.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-3 py-2 font-medium">{r.name}</td>
                <td className="px-3 py-2">{r.email ?? "-"}</td>
                <td className="px-3 py-2">{r.mobile_phone ?? "-"}</td>
                <td className="px-3 py-2">
                  <span
                    className={`badge ${
                      r.accountState === "가입 완료"
                        ? "bg-green-50 text-green-700"
                        : r.accountState === "초대 대기"
                          ? "bg-amber-50 text-amber-800"
                          : "bg-zinc-100 text-zinc-500"
                    }`}
                  >
                    {r.accountState}
                  </span>
                </td>
                <td className="px-3 py-2 text-xs text-muted">
                  {new Date(r.created_at).toLocaleDateString("ko-KR")}
                </td>
                <td className="px-3 py-2 text-right">
                  <div className="flex items-center justify-end gap-3">
                    {r.accountState === "계정 없음" && (
                      <Link
                        href={`/staff/instructors/${r.id}/invite`}
                        className="font-medium text-brand hover:underline"
                      >
                        계정 초대
                      </Link>
                    )}
                    <form action={pickInstructorForEdit}>
                      <input type="hidden" name="id" value={r.id} />
                      <button
                        type="submit"
                        className="cursor-pointer font-medium text-brand hover:underline"
                      >
                        계정 업데이트
                      </button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
