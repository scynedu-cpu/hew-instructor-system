-- ================================================================
-- 작업지시서 #001 완료기준 검증 — RLS 동작 테스트
-- ================================================================
-- 실행:  npx supabase db query --linked -f supabase/tests/rls_verification.sql
-- 성격:  임시 검증. 테스트 데이터를 스스로 만들고 마지막에 정리한다.
--        결과표(_rls_verify_results)만 남으며, 확인 후
--        `DROP TABLE public._rls_verify_results;` 로 지우면 된다.
--
-- 검증 항목 (작업지시서 #001 "완료 기준"):
--   #2 staff  → 모든 테이블 조회 가능
--   #3 school → 본인 학교 session_requests 만, 타 학교 건 불가
--   #4 instructor → 본인 instructors/경력/자격증/전문분야/서류 만
--   #5 강사 계정을 같은 instructor_id 로 2개 → 에러
--   #6 학교 계정을 같은 school_id 로 2개 → 에러
-- ================================================================

DROP TABLE IF EXISTS public._rls_verify_results;
CREATE TABLE public._rls_verify_results (
  step text,
  ok   boolean,
  got  text,
  want text
);
ALTER TABLE public._rls_verify_results DISABLE ROW LEVEL SECURITY;
GRANT INSERT ON public._rls_verify_results TO authenticated;

-- ---------- 테스트 데이터 seed (postgres 권한) ----------
INSERT INTO schools(name, level) VALUES ('RLS테스트_초A', '초등학교'), ('RLS테스트_중B', '중학교');
INSERT INTO instructors(name) VALUES ('RLS테스트_강사A'), ('RLS테스트_강사B');
INSERT INTO programs(name, category) VALUES ('RLS테스트_센터체험', '현장체험형');

INSERT INTO auth.users(id, aud, role, email) VALUES
  (gen_random_uuid(), 'authenticated', 'authenticated', 'rlstest_staff@test.local'),
  (gen_random_uuid(), 'authenticated', 'authenticated', 'rlstest_schoola@test.local'),
  (gen_random_uuid(), 'authenticated', 'authenticated', 'rlstest_insa@test.local');

INSERT INTO app_accounts(id, role, display_name)
  SELECT id, 'staff', 'RLS테스트_담당자' FROM auth.users WHERE email = 'rlstest_staff@test.local';
INSERT INTO app_accounts(id, role, school_id, display_name)
  SELECT u.id, 'school', s.id, 'RLS테스트_A학교교사'
  FROM auth.users u, schools s
  WHERE u.email = 'rlstest_schoola@test.local' AND s.name = 'RLS테스트_초A';
INSERT INTO app_accounts(id, role, instructor_id, display_name)
  SELECT u.id, 'instructor', i.id, 'RLS테스트_강사A'
  FROM auth.users u, instructors i
  WHERE u.email = 'rlstest_insa@test.local' AND i.name = 'RLS테스트_강사A';

INSERT INTO session_requests(school_id, program_id, academic_year, submitted_by)
  SELECT s.id, p.id, 2026, 'RLS테스트'
  FROM schools s, programs p
  WHERE p.name = 'RLS테스트_센터체험' AND s.name IN ('RLS테스트_초A', 'RLS테스트_중B');

INSERT INTO class_sessions(school_id, program_id, academic_year)
  SELECT s.id, p.id, 2026 FROM schools s, programs p
  WHERE p.name = 'RLS테스트_센터체험' AND s.name = 'RLS테스트_초A';

INSERT INTO instructor_career_history(instructor_id, description)
  SELECT id, name || ' 경력' FROM instructors WHERE name LIKE 'RLS테스트_강사%';
INSERT INTO instructor_certifications(instructor_id, cert_name)
  SELECT id, name || ' 자격증' FROM instructors WHERE name LIKE 'RLS테스트_강사%';
INSERT INTO instructor_specialties(instructor_id, specialty)
  SELECT id, CASE WHEN name LIKE '%A' THEN 'AI교육' ELSE '드론전문가' END
  FROM instructors WHERE name LIKE 'RLS테스트_강사%';
INSERT INTO instructor_documents(instructor_id, doc_type)
  SELECT id, '이력서' FROM instructors WHERE name LIKE 'RLS테스트_강사%';

-- ================================================================
-- #2  staff → 전 테이블 조회 가능
-- ================================================================
SELECT set_config('request.jwt.claim.sub',
  (SELECT id::text FROM auth.users WHERE email = 'rlstest_staff@test.local'), true);
SET ROLE authenticated;

INSERT INTO public._rls_verify_results
SELECT 'staff → session_requests 전체', count(*) = 2, count(*) || '건', '2건' FROM session_requests;
INSERT INTO public._rls_verify_results
SELECT 'staff → schools 조회', count(*) >= 2, count(*) || '건', '>=2건' FROM schools;
INSERT INTO public._rls_verify_results
SELECT 'staff → instructors 전체', count(*) >= 2, count(*) || '건', '>=2건' FROM instructors;
INSERT INTO public._rls_verify_results
SELECT 'staff → programs 조회', count(*) >= 1, count(*) || '건', '>=1건' FROM programs;
INSERT INTO public._rls_verify_results
SELECT 'staff → class_sessions 조회', count(*) >= 1, count(*) || '건', '>=1건' FROM class_sessions;
INSERT INTO public._rls_verify_results
SELECT 'staff → instructor_documents 전체', count(*) >= 2, count(*) || '건', '>=2건' FROM instructor_documents;
INSERT INTO public._rls_verify_results
SELECT 'staff → assignments 조회(빈 테이블, 오류 없음)', count(*) = 0, count(*) || '건', '0건(오류없음)' FROM assignments;
INSERT INTO public._rls_verify_results
SELECT 'staff → payments 조회(빈 테이블, 오류 없음)', count(*) = 0, count(*) || '건', '0건(오류없음)' FROM payments;
INSERT INTO public._rls_verify_results
SELECT 'staff → app_accounts 조회', count(*) >= 3, count(*) || '건', '>=3건' FROM app_accounts;

RESET ROLE;

-- ================================================================
-- #3  school A → 본인 학교 신청건만
-- ================================================================
SELECT set_config('rls_test.sch_a',
  (SELECT id::text FROM schools WHERE name = 'RLS테스트_초A'), true);
SELECT set_config('request.jwt.claim.sub',
  (SELECT id::text FROM auth.users WHERE email = 'rlstest_schoola@test.local'), true);
SET ROLE authenticated;

-- 주: school 계정은 schools 테이블 접근이 없으므로(staff 전용) 학교 id 는
--     역할 전환 전에 GUC 로 저장해 두고 비교한다.
INSERT INTO public._rls_verify_results
SELECT 'school A → 본인 학교 신청건만 조회',
       count(*) = 1 AND bool_and(school_id = current_setting('rls_test.sch_a')::uuid),
       count(*) || '건', '1건(A학교)' FROM session_requests;
INSERT INTO public._rls_verify_results
SELECT 'school A → 학교 B 신청건 안 보임',
       NOT EXISTS (SELECT 1 FROM session_requests
                   WHERE school_id = (SELECT id FROM schools WHERE name = 'RLS테스트_중B')),
       (SELECT count(*)::text FROM session_requests
        WHERE school_id = (SELECT id FROM schools WHERE name = 'RLS테스트_중B')) || '건', '0건';
INSERT INTO public._rls_verify_results
SELECT 'school A → instructors 접근 차단', count(*) = 0, count(*) || '건', '0건' FROM instructors;
INSERT INTO public._rls_verify_results
SELECT 'school A → class_sessions 접근 차단', count(*) = 0, count(*) || '건', '0건' FROM class_sessions;

RESET ROLE;

-- ================================================================
-- #4  instructor A → 본인 데이터만
-- ================================================================
SELECT set_config('request.jwt.claim.sub',
  (SELECT id::text FROM auth.users WHERE email = 'rlstest_insa@test.local'), true);
SET ROLE authenticated;

INSERT INTO public._rls_verify_results
SELECT 'instructor A → 본인 프로필만',
       count(*) = 1 AND bool_and(name = 'RLS테스트_강사A'), count(*) || '건', '1건(본인)' FROM instructors;
INSERT INTO public._rls_verify_results
SELECT 'instructor A → 본인 경력만', count(*) = 1, count(*) || '건', '1건' FROM instructor_career_history;
INSERT INTO public._rls_verify_results
SELECT 'instructor A → 본인 자격증만', count(*) = 1, count(*) || '건', '1건' FROM instructor_certifications;
INSERT INTO public._rls_verify_results
SELECT 'instructor A → 본인 전문분야만', count(*) = 1, count(*) || '건', '1건' FROM instructor_specialties;
INSERT INTO public._rls_verify_results
SELECT 'instructor A → 본인 서류만', count(*) = 1, count(*) || '건', '1건' FROM instructor_documents;
INSERT INTO public._rls_verify_results
SELECT 'instructor A → 강사 B 데이터 안 보임',
       NOT EXISTS (SELECT 1 FROM instructors WHERE name = 'RLS테스트_강사B'), '안 보임', '안 보임';
INSERT INTO public._rls_verify_results
SELECT 'instructor A → session_requests 접근 차단', count(*) = 0, count(*) || '건', '0건' FROM session_requests;

RESET ROLE;

-- ================================================================
-- #5 / #6  계정 중복 방지 partial unique index
-- ================================================================
DO $$
DECLARE
  ins_a uuid := (SELECT id FROM instructors WHERE name = 'RLS테스트_강사A');
  sch_a uuid := (SELECT id FROM schools WHERE name = 'RLS테스트_초A');
  u1 uuid := gen_random_uuid();
  u2 uuid := gen_random_uuid();
BEGIN
  BEGIN
    INSERT INTO auth.users(id, email) VALUES (u1, 'rlstest_dupins@test.local');
    INSERT INTO app_accounts(id, role, instructor_id) VALUES (u1, 'instructor', ins_a);
    INSERT INTO public._rls_verify_results
      VALUES ('#5 같은 instructor_id 강사계정 2개 → 거부', false, '허용됨(문제)', '거부돼야 함');
  EXCEPTION WHEN unique_violation THEN
    INSERT INTO public._rls_verify_results
      VALUES ('#5 같은 instructor_id 강사계정 2개 → 거부', true, 'unique_violation', '거부됨');
  END;

  BEGIN
    INSERT INTO auth.users(id, email) VALUES (u2, 'rlstest_dupsch@test.local');
    INSERT INTO app_accounts(id, role, school_id) VALUES (u2, 'school', sch_a);
    INSERT INTO public._rls_verify_results
      VALUES ('#6 같은 school_id 학교계정 2개 → 거부', false, '허용됨(문제)', '거부돼야 함');
  EXCEPTION WHEN unique_violation THEN
    INSERT INTO public._rls_verify_results
      VALUES ('#6 같은 school_id 학교계정 2개 → 거부', true, 'unique_violation', '거부됨');
  END;
END $$;

-- ---------- 테스트 데이터 정리 ----------
DELETE FROM class_sessions      WHERE school_id IN (SELECT id FROM schools WHERE name LIKE 'RLS테스트%');
DELETE FROM session_requests    WHERE school_id IN (SELECT id FROM schools WHERE name LIKE 'RLS테스트%');
DELETE FROM auth.users          WHERE email LIKE 'rlstest\_%';           -- app_accounts 는 ON DELETE CASCADE
DELETE FROM instructors         WHERE name LIKE 'RLS테스트%';            -- 경력/자격증/전문분야/서류 CASCADE
DELETE FROM schools             WHERE name LIKE 'RLS테스트%';
DELETE FROM programs            WHERE name LIKE 'RLS테스트%';

-- ---------- 결과 ----------
SELECT
  CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS "결과",
  step AS "검증 항목",
  got  AS "실제",
  want AS "기대"
FROM public._rls_verify_results
ORDER BY ok, step;
