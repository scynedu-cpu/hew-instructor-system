-- ================================================================
-- 작업지시서 #013 완료기준 검증 — QR 기반 익명 교육만족도 설문 RLS
-- ================================================================
-- 실행:  npx supabase db query --linked -f supabase/tests/survey_verification.sql
-- 성격:  임시 검증. 테스트 데이터를 스스로 만들고 마지막에 정리한다.
--        결과표(_survey_verify)만 남으며, 확인 후
--        `DROP TABLE public._survey_verify;` 로 지우면 된다.
--
-- 검증 항목 (작업지시서 #013 "완료 기준"):
--   - staff → survey_questions/links/responses/answers 전체 조회·수정 가능
--   - anon  → 활성 문항만 조회, 비활성 문항은 안 보임
--   - anon  → survey_links 직접 조회 불가(토큰 존재 자체를 알 수 없음)
--   - anon  → survey_responses/survey_answers 테이블 직접 INSERT/SELECT 불가
--   - anon  → submit_survey_response() RPC 로는 정상 제출되지만, 제출 후에도
--             자기 응답을 다시 조회할 수는 없음(완전 익명)
--   - 같은 세션에 여러 응답이 각각 별개 행으로 쌓임
-- ================================================================

DROP TABLE IF EXISTS public._survey_verify;
CREATE TABLE public._survey_verify (step text, ok boolean, got text, want text);
ALTER TABLE public._survey_verify DISABLE ROW LEVEL SECURITY;
GRANT INSERT ON public._survey_verify TO authenticated, anon;

-- ---------- 테스트 데이터 seed (postgres 권한) ----------
INSERT INTO schools(name, level) VALUES ('SVTEST_초', '초등학교');
INSERT INTO programs(name, category) VALUES ('SVTEST_센터체험', 'SVTEST_센터체험형');
INSERT INTO class_sessions(school_id, program_id, academic_year)
  SELECT s.id, p.id, 2026 FROM schools s, programs p
  WHERE s.name = 'SVTEST_초' AND p.name = 'SVTEST_센터체험';

INSERT INTO survey_questions(question_type, question_text, options, display_order, is_active) VALUES
  ('rating_5', 'SVTEST_활성문항', NULL, 900, true),
  ('short_text', 'SVTEST_비활성문항', NULL, 901, false);

INSERT INTO survey_links(session_id, token, created_by)
  SELECT id, 'svtest-token-abc123', 'SVTEST' FROM class_sessions
  WHERE school_id = (SELECT id FROM schools WHERE name = 'SVTEST_초');

INSERT INTO auth.users(id, aud, role, email) VALUES
  (gen_random_uuid(), 'authenticated', 'authenticated', 'svtest_staff@test.local');
INSERT INTO app_accounts(id, role, display_name)
  SELECT id, 'staff', 'SVTEST_담당자' FROM auth.users WHERE email = 'svtest_staff@test.local';

-- ================================================================
-- #1 staff → 전 테이블 조회 가능(활성+비활성 문항 모두, 링크, 응답 스키마)
-- ================================================================
SELECT set_config('request.jwt.claim.sub',
  (SELECT id::text FROM auth.users WHERE email = 'svtest_staff@test.local'), true);
SET ROLE authenticated;

INSERT INTO public._survey_verify
SELECT 'staff → 활성+비활성 문항 모두 조회',
       count(*) = 2, count(*) || '건', '2건'
FROM survey_questions WHERE question_text LIKE 'SVTEST_%';

INSERT INTO public._survey_verify
SELECT 'staff → survey_links 조회', count(*) = 1, count(*) || '건', '1건'
FROM survey_links WHERE token = 'svtest-token-abc123';

RESET ROLE;

-- ================================================================
-- #2 anon → 활성 문항만 조회, 비활성은 안 보임
-- ================================================================
-- 앞서 staff 테스트에서 설정한 jwt claim 을 반드시 비워야 진짜 "로그인 안 한
-- 익명 사용자"를 흉내낼 수 있다 — 안 비우면 auth.uid() 가 staff 계정으로
-- 남아 is_staff() 가 계속 true 로 평가되어 아래 검증이 전부 무의미해진다.
SELECT set_config('request.jwt.claim.sub', '', true);
SET ROLE anon;

INSERT INTO public._survey_verify
SELECT 'anon → 활성 문항만 조회(비활성 안 보임)',
       count(*) = 1 AND bool_and(question_text = 'SVTEST_활성문항'),
       count(*) || '건', '1건(활성만)'
FROM survey_questions WHERE question_text LIKE 'SVTEST_%';

-- ================================================================
-- #3 anon → survey_links 직접 조회 불가
-- ================================================================
INSERT INTO public._survey_verify
SELECT 'anon → survey_links 직접 조회 불가', count(*) = 0, count(*) || '건', '0건'
FROM survey_links WHERE token = 'svtest-token-abc123';

-- ================================================================
-- #4 anon → survey_responses/survey_answers 직접 INSERT 거부
-- ================================================================
DO $$
DECLARE
  v_session uuid := (SELECT cs.id FROM class_sessions cs
                      JOIN schools s ON s.id = cs.school_id
                      WHERE s.name = 'SVTEST_초');
BEGIN
  BEGIN
    INSERT INTO survey_responses(session_id) VALUES (v_session);
    INSERT INTO public._survey_verify
      VALUES ('anon → survey_responses 직접 INSERT 거부', false, '허용됨(문제)', '거부돼야 함');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public._survey_verify
      VALUES ('anon → survey_responses 직접 INSERT 거부', true, 'RLS 로 거부됨', '거부됨');
  END;
END $$;

-- ================================================================
-- #5 anon → get_survey_context() / submit_survey_response() RPC 는 정상 동작
-- ================================================================
INSERT INTO public._survey_verify
SELECT 'anon → get_survey_context() 로 세션 컨텍스트 확인',
       school_name = 'SVTEST_초', coalesce(school_name, '(없음)'), 'SVTEST_초'
FROM public.get_survey_context('svtest-token-abc123');

SELECT public.submit_survey_response(
  'svtest-token-abc123',
  jsonb_build_array(
    jsonb_build_object('question_id',
      (SELECT id FROM survey_questions WHERE question_text = 'SVTEST_활성문항'),
      'answer_rating', 5)
  )
);

-- 두 번째 응답(동일 세션, 별개 행이어야 함)
SELECT public.submit_survey_response(
  'svtest-token-abc123',
  jsonb_build_array(
    jsonb_build_object('question_id',
      (SELECT id FROM survey_questions WHERE question_text = 'SVTEST_활성문항'),
      'answer_rating', 3)
  )
);

RESET ROLE;

-- 아래는 postgres 권한으로 실제 저장 결과 확인(anon 은 조회 못하지만 실제로는 쌓였는지)
INSERT INTO public._survey_verify
SELECT '같은 세션에 응답 2건이 별개 행으로 저장',
       count(*) = 2, count(*) || '건', '2건'
FROM survey_responses r
JOIN class_sessions cs ON cs.id = r.session_id
JOIN schools s ON s.id = cs.school_id
WHERE s.name = 'SVTEST_초';

INSERT INTO public._survey_verify
SELECT '비활성 문항으로는 답변 안 붙음(활성 문항만 answer_rating 저장)',
       count(*) = 2, count(*) || '건', '2건'
FROM survey_answers a
JOIN survey_questions q ON q.id = a.question_id
WHERE q.question_text = 'SVTEST_활성문항';

-- ================================================================
-- #6 anon → 제출 후에도 자기 응답을 다시 조회할 수 없음(완전 익명)
-- ================================================================
SET ROLE anon;

INSERT INTO public._survey_verify
SELECT 'anon → 방금 제출한 응답도 조회 불가(완전 익명)', count(*) = 0, count(*) || '건', '0건'
FROM survey_responses r
JOIN class_sessions cs ON cs.id = r.session_id
JOIN schools s ON s.id = cs.school_id
WHERE s.name = 'SVTEST_초';

INSERT INTO public._survey_verify
SELECT 'anon → survey_answers 직접 조회 불가', count(*) = 0, count(*) || '건', '0건'
FROM survey_answers;

RESET ROLE;

-- ---------- 테스트 데이터 정리 ----------
DELETE FROM survey_answers WHERE question_id IN (SELECT id FROM survey_questions WHERE question_text LIKE 'SVTEST_%');
DELETE FROM survey_responses WHERE session_id IN (
  SELECT cs.id FROM class_sessions cs JOIN schools s ON s.id = cs.school_id WHERE s.name = 'SVTEST_초'
);
DELETE FROM survey_links WHERE token = 'svtest-token-abc123';
DELETE FROM survey_questions WHERE question_text LIKE 'SVTEST_%';
DELETE FROM class_sessions WHERE school_id IN (SELECT id FROM schools WHERE name = 'SVTEST_초');
DELETE FROM auth.users WHERE email = 'svtest_staff@test.local';   -- app_accounts 는 CASCADE
DELETE FROM schools WHERE name = 'SVTEST_초';
DELETE FROM programs WHERE name = 'SVTEST_센터체험';

-- ---------- 결과 ----------
SELECT
  CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS "결과",
  step AS "검증 항목",
  got  AS "실제",
  want AS "기대"
FROM public._survey_verify
ORDER BY ok, step;
