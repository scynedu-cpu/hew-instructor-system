import { createClient } from "@/lib/supabase/server";
import type { SurveyContext, SurveyQuestion } from "@/lib/types";
import { SurveyForm } from "./survey-form";

export default async function PublicSurveyPage({
  params,
}: PageProps<"/survey/[token]">) {
  const { token } = await params;
  const supabase = await createClient();

  const { data: contextRows } = await supabase.rpc("get_survey_context", {
    p_token: token,
  });
  const context = ((contextRows as SurveyContext[] | null) ?? [])[0] ?? null;

  if (!context) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-50 p-6">
        <div className="w-full max-w-sm rounded-lg border border-border bg-surface p-6 text-center">
          <h1 className="text-lg font-bold">유효하지 않은 설문 링크입니다</h1>
          <p className="mt-2 text-sm text-muted">
            QR코드를 다시 스캔하시거나 담당 강사에게 문의해 주세요.
          </p>
        </div>
      </main>
    );
  }

  const { data: questions } = await supabase
    .from("survey_questions")
    .select("*")
    .eq("is_active", true)
    .order("display_order", { ascending: true })
    .returns<SurveyQuestion[]>();

  return (
    <main className="flex min-h-screen justify-center bg-zinc-50 p-4">
      <div className="w-full max-w-md py-6">
        <div className="mb-4 text-center">
          <h1 className="text-lg font-bold">교육만족도 설문</h1>
          <p className="mt-1 text-sm text-muted">
            {context.school_name} · {context.program_name}
            {context.scheduled_date ? ` · ${context.scheduled_date}` : ""}
          </p>
          <p className="mt-1 text-xs text-muted">
            이름 등 개인정보는 입력받지 않으며, 응답은 완전히 익명으로 저장됩니다.
          </p>
        </div>

        {questions && questions.length > 0 ? (
          <SurveyForm token={token} questions={questions} />
        ) : (
          <p className="rounded-lg border border-dashed border-border bg-surface px-4 py-8 text-center text-sm text-muted">
            현재 응답 가능한 문항이 없습니다.
          </p>
        )}
      </div>
    </main>
  );
}
