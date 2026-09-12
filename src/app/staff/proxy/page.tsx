import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Instructor } from "@/lib/types";
import { pickInstructorForEdit } from "../instructors/actions";

export default async function StaffProxyHubPage() {
  await requireRole("staff");
  const supabase = await createClient();

  const { data: instructors } = await supabase
    .from("instructors")
    .select("id,name,mobile_phone,created_at")
    .order("created_at", { ascending: false })
    .returns<Instructor[]>();
  const list = instructors ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold">대리입력</h1>
        <p className="mt-1 text-sm text-muted">
          시스템 오픈 전까지 학교·강사에게 받은 자료를 담당자가 대신 입력합니다.
          한글 문서(.hwp·.hwpx)나 사진·스캔을 올리면 AI 자동채움으로 폼을 채운 뒤
          확인·저장할 수 있습니다.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* 학교 신청 대리입력 */}
        <section className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-5">
          <h2 className="font-semibold">학교 신청 대리입력</h2>
          <p className="text-sm text-muted">
            학교를 선택하고 프로그램·희망일자·전문분야 등을 입력합니다. 저장하면
            일반 신청과 동일하게 검토·승인 절차를 탑니다.
          </p>
          <Link
            href="/staff/requests/new"
            className="self-start rounded-md bg-brand px-4 py-2 text-sm font-semibold text-brand-fg hover:bg-brand-hover"
          >
            학교 신청 입력하기
          </Link>
        </section>

        {/* 강사 정보 대리입력 */}
        <section className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-5">
          <h2 className="font-semibold">강사 정보 대리입력</h2>
          <p className="text-sm text-muted">
            계정·초대 없이 강사 프로필(기본정보·경력·자격증·전문분야·서류)을
            입력합니다. 계정 발급은 시스템 오픈 후 별도로 진행합니다.
          </p>
          <Link
            href="/staff/instructors/new-profile"
            className="self-start rounded-md bg-brand px-4 py-2 text-sm font-semibold text-brand-fg hover:bg-brand-hover"
          >
            새 강사 입력하기
          </Link>
        </section>
      </div>

      {/* 기존 강사 대리입력 (수정) */}
      <div>
        <h2 className="mb-2 text-sm font-semibold text-muted">
          기존 강사 정보 이어서 입력 / 수정
        </h2>
        {list.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border bg-surface px-4 py-8 text-center text-sm text-muted">
            등록된 강사가 없습니다.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[420px] text-sm">
              <thead className="bg-zinc-50 text-left text-xs text-muted">
                <tr>
                  <th className="px-3 py-2 font-medium">성명</th>
                  <th className="px-3 py-2 font-medium">휴대전화</th>
                  <th className="px-3 py-2 font-medium">등록일</th>
                  <th className="px-3 py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {list.map((i) => (
                  <tr key={i.id} className="hover:bg-zinc-50/60">
                    <td className="px-3 py-2 font-medium">{i.name}</td>
                    <td className="px-3 py-2">{i.mobile_phone ?? "-"}</td>
                    <td className="px-3 py-2 text-xs text-muted">
                      {new Date(i.created_at).toLocaleDateString("ko-KR")}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <form action={pickInstructorForEdit}>
                        <input type="hidden" name="id" value={i.id} />
                        <button
                          type="submit"
                          className="font-medium text-brand hover:underline"
                        >
                          대리입력
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
