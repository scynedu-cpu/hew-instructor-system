import { LoginForm } from "./login-form";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error } = await searchParams;

  return (
    <div className="flex flex-1 items-center justify-center bg-background px-4 py-16">
      <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-8 shadow-sm">
        <h1 className="text-lg font-bold">HEW 강사·스케줄 관리</h1>
        <p className="mt-1 text-sm text-muted">양재모 교육지원센터</p>

        {error === "no_account" && (
          <p className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
            로그인은 되었지만 연결된 계정 정보가 없습니다. 담당자에게
            문의하세요.
          </p>
        )}

        <div className="mt-6">
          <LoginForm />
        </div>
      </div>
    </div>
  );
}
