-- ================================================================
-- 작업지시서 #013-1 완료기준 검증 — 설문 문항 그룹화 RLS
-- ================================================================
-- 실행:  npx supabase db query --linked -f supabase/tests/survey_group_verification.sql
-- 결과표(_sg_verify)만 남으며, 확인 후 `DROP TABLE public._sg_verify;` 로 지운다.
-- ================================================================

DROP TABLE IF EXISTS public._sg_verify;
CREATE TABLE public._sg_verify (step text, ok boolean, got text, want text);
ALTER TABLE public._sg_verify DISABLE ROW LEVEL SECURITY;
GRANT INSERT ON public._sg_verify TO authenticated, anon;

-- ---------- 테스트 데이터 seed ----------
INSERT INTO schools(name, level) VALUES ('SGTEST_초', '초등학교');
INSERT INTO programs(name, category, survey_group) VALUES ('SGTEST_현장체험', 'SGTEST_현장체험', 'A');
INSERT INTO class_sessions(school_id, program_id, academic_year)
  SELECT s.id, p.id, 2026 FROM schools s, programs p
  WHERE s.name = 'SGTEST_초' AND p.name = 'SGTEST_현장체험';

INSERT INTO survey_links(session_id, token, created_by)
  SELECT id, 'sgtest-token-xyz', 'SGTEST' FROM class_sessions
  WHERE school_id = (SELECT id FROM schools WHERE name = 'SGTEST_초');

INSERT INTO survey_link_questions(survey_link_id, question_id, display_order)
  SELECT l.id, q.id, 1
  FROM survey_links l, survey_questions q
  WHERE l.token = 'sgtest-token-xyz' AND q.question_text = '오늘 프로그램은 흥미로웠다.';

-- ================================================================
-- #1 anon → survey_question_groups 는 공개 조회 가능(문항 관리 화면 구성용)
-- ================================================================
SELECT set_config('request.jwt.claim.sub', '', true);
SET ROLE anon;

INSERT INTO public._sg_verify
SELECT 'anon → survey_question_groups 5개 공개 조회', count(*) = 5, count(*) || '건', '5건'
FROM survey_question_groups;

-- ================================================================
-- #2 anon → survey_link_questions 직접 조회 불가
-- ================================================================
INSERT INTO public._sg_verify
SELECT 'anon → survey_link_questions 직접 조회 불가', count(*) = 0, count(*) || '건', '0건'
FROM survey_link_questions;

-- ================================================================
-- #3 anon → get_survey_link_questions() RPC 로는 정상 조회
-- ================================================================
INSERT INTO public._sg_verify
SELECT 'anon → get_survey_link_questions() RPC 정상 동작',
       count(*) = 1 AND bool_and(question_text = '오늘 프로그램은 흥미로웠다.'),
       count(*) || '건', '1건'
FROM public.get_survey_link_questions('sgtest-token-xyz');

-- ================================================================
-- #4 anon → 확정된 구성에 없는 문항으로는 제출해도 저장되지 않음
--     (submit_survey_response 가 survey_link_questions 기준으로 검증)
-- ================================================================
DO $$
DECLARE
  v_other_q uuid := (SELECT id FROM survey_questions WHERE question_text = '오늘 프로그램은 나에게 도움이 되었다.');
BEGIN
  PERFORM public.submit_survey_response(
    'sgtest-token-xyz',
    jsonb_build_array(
      jsonb_build_object('question_id', v_other_q, 'answer_rating', 5)
    )
  );
END $$;

RESET ROLE;

-- postgres 권한으로 확인 — 응답은 생성되지만(1건) 답변은 0건이어야 함
-- (확정 구성에 없는 문항이라 submit_survey_response 가 조용히 건너뜀)
INSERT INTO public._sg_verify
SELECT '확정 구성에 없는 문항 제출 → 답변 저장 안 됨',
       count(*) = 0, count(*) || '건', '0건'
FROM survey_answers a
JOIN survey_responses r ON r.id = a.response_id
WHERE r.session_id = (SELECT id FROM class_sessions WHERE school_id = (SELECT id FROM schools WHERE name = 'SGTEST_초'));

-- ---------- 테스트 데이터 정리 ----------
DELETE FROM survey_answers WHERE response_id IN (
  SELECT id FROM survey_responses WHERE session_id IN (
    SELECT id FROM class_sessions WHERE school_id = (SELECT id FROM schools WHERE name = 'SGTEST_초')
  )
);
DELETE FROM survey_responses WHERE session_id IN (
  SELECT id FROM class_sessions WHERE school_id = (SELECT id FROM schools WHERE name = 'SGTEST_초')
);
DELETE FROM survey_link_questions WHERE survey_link_id IN (SELECT id FROM survey_links WHERE token = 'sgtest-token-xyz');
DELETE FROM survey_links WHERE token = 'sgtest-token-xyz';
DELETE FROM class_sessions WHERE school_id IN (SELECT id FROM schools WHERE name = 'SGTEST_초');
DELETE FROM programs WHERE name = 'SGTEST_현장체험';
DELETE FROM schools WHERE name = 'SGTEST_초';

-- ---------- 결과 ----------
SELECT
  CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS "결과",
  step AS "검증 항목",
  got  AS "실제",
  want AS "기대"
FROM public._sg_verify
ORDER BY ok, step;
