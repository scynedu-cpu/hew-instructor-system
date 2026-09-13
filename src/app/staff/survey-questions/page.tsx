import { listSurveyGroups, listSurveyQuestions } from "./actions";
import { SurveyQuestionManager } from "./survey-question-manager";

export default async function SurveyQuestionsPage() {
  const [questions, groups] = await Promise.all([
    listSurveyQuestions(),
    listSurveyGroups(),
  ]);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-bold">설문 문항 관리</h1>
        <p className="mt-1 text-sm text-muted">
          교육만족도 설문(QR 응답)에 쓰이는 문항입니다. &quot;삭제&quot;해도 실제로는
          비활성화만 되어 이미 들어온 응답과의 연결은 그대로 유지됩니다. 공통
          문항은 모든 세션에, 그룹 문항은 그 그룹에 속한 프로그램 세션의
          설문에만 후보로 제안됩니다.
        </p>
      </div>

      <SurveyQuestionManager questions={questions} groups={groups} />
    </div>
  );
}
