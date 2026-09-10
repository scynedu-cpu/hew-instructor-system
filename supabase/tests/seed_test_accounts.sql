-- ================================================================
-- 작업지시서 #001 — RLS 검증용 테스트 계정 3종 + 최소 매핑 데이터
-- ================================================================
-- 실행:  npx supabase db query --linked -f supabase/tests/seed_test_accounts.sql
-- 재실행 안전(idempotent): 같은 이메일/이름의 기존 행을 지우고 다시 만든다.
--
-- 로그인 계정 (모두 비밀번호: hew-test-1234! )
--   staff@hew.test        → 담당자(staff)      : 전체 접근
--   school-a@hew.test     → 학교(school)       : 양재초등학교 신청건만
--   instructor-a@hew.test → 강사(instructor)   : 김민수 강사 본인 데이터만
-- ================================================================

BEGIN;

-- ---------- 기존 테스트 데이터 정리 ----------
DELETE FROM auth.users WHERE email IN ('staff@hew.test', 'school-a@hew.test', 'instructor-a@hew.test');
DELETE FROM class_sessions   WHERE school_id IN (SELECT id FROM schools WHERE name IN ('양재초등학교', '매헌중학교'));
DELETE FROM session_requests WHERE school_id IN (SELECT id FROM schools WHERE name IN ('양재초등학교', '매헌중학교'));
DELETE FROM instructors WHERE name IN ('김민수', '박서연');
DELETE FROM schools     WHERE name IN ('양재초등학교', '매헌중학교');
DELETE FROM programs    WHERE category IN ('센터체험', '직업인특강', '현장직업체험')
                           OR name IN ('센터체험', '직업인특강');

-- ---------- 최소 매핑 데이터 ----------
INSERT INTO schools (name, level, district, teacher_name)
VALUES ('양재초등학교', '초등학교', '서초구', '최담임'),
       ('매헌중학교',   '중학교',   '서초구', '정담임');

-- 프로그램: 2단계 분류 (대분류 category + 세부 sub_program). matching_keyword 는 자동계산.
INSERT INTO programs (name, category, sub_program) VALUES
  ('센터체험',                '센터체험',      NULL),
  ('직업인특강',              '직업인특강',    NULL),
  ('현장직업체험 · AI교육',   '현장직업체험',  'AI교육'),
  ('현장직업체험 · 드론전문가','현장직업체험',  '드론전문가');

INSERT INTO instructors (name, mobile_phone, email, status, rating_avg, form_submitted_at)
VALUES ('김민수', '010-1111-2222', 'kim@example.com', 'active', 4.5, current_date),
       ('박서연', '010-3333-4444', 'park@example.com', 'active', 4.2, current_date);

INSERT INTO instructor_specialties (instructor_id, specialty)
SELECT id, 'AI교육'      FROM instructors WHERE name = '김민수'
UNION ALL SELECT id, '진로토크콘서트' FROM instructors WHERE name = '김민수'
UNION ALL SELECT id, '드론전문가'    FROM instructors WHERE name = '박서연';

INSERT INTO instructor_certifications (instructor_id, cert_name, issued_date, issuing_org)
SELECT id, '청소년지도사 2급', date '2021-03-02', '여성가족부' FROM instructors WHERE name = '김민수';

INSERT INTO instructor_career_history (instructor_id, year_month, description, issuing_org)
SELECT id, '2020/03', 'OO대학교 컴퓨터공학과 졸업', 'OO대학교' FROM instructors WHERE name = '김민수';

INSERT INTO instructor_documents (instructor_id, doc_type, issued_at, expires_at, status)
SELECT id, '성범죄경력조회동의서', current_date - 300, current_date + 65, 'valid'  FROM instructors WHERE name = '김민수'
UNION ALL
SELECT id, '이력서',              current_date - 400, current_date + 695, 'valid' FROM instructors WHERE name = '김민수';

-- 신청서(헤더) + 명세(session_request_items)
WITH req_a AS (
  INSERT INTO session_requests (school_id, academic_year, submitted_by, teacher_name, request_status)
  SELECT s.id, 2026, '최담임', '최담임', 'submitted' FROM schools s WHERE s.name = '양재초등학교'
  RETURNING id
)
INSERT INTO session_request_items (request_id, program_id, requested_dates, preferred_time_slot, expected_student_count)
SELECT r.id, p.id, ARRAY[date '2026-10-15']::date[], '10:00~12:00', '120명'
FROM req_a r, programs p WHERE p.category = '센터체험' AND p.sub_program IS NULL;

WITH req_b AS (
  INSERT INTO session_requests (school_id, academic_year, submitted_by, teacher_name, request_status)
  SELECT s.id, 2026, '정담임', '정담임', 'submitted' FROM schools s WHERE s.name = '매헌중학교'
  RETURNING id
)
INSERT INTO session_request_items (request_id, program_id, requested_dates, preferred_time_slot, expected_student_count)
SELECT r.id, p.id, ARRAY[date '2026-10-22']::date[], '3,4교시', '8학급'
FROM req_b r, programs p WHERE p.category = '현장직업체험' AND p.sub_program = '드론전문가';

-- ---------- 로그인 계정 3종 ----------
WITH new_users AS (
  -- ⚠ 토큰 컬럼(confirmation_token 등)은 nullable 인데 GoTrue 는 NULL 을 못 읽어
  --   500 "Database error querying schema" 를 낸다. 반드시 '' 로 채운다.
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change,
    email_change_token_new, email_change_token_current,
    phone_change, phone_change_token, reauthentication_token
  )
  SELECT
    '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
    email, extensions.crypt('hew-test-1234!', extensions.gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, meta::jsonb,
    '', '', '', '', '', '', '', ''
  FROM (VALUES
    ('staff@hew.test',      '{"name":"담당자"}'),
    ('school-a@hew.test',   '{"name":"양재초 최담임"}'),
    ('instructor-a@hew.test','{"name":"김민수"}')
  ) AS v(email, meta)
  RETURNING id, email
)
INSERT INTO auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
SELECT id::text, id, jsonb_build_object('sub', id::text, 'email', email, 'email_verified', true),
       'email', now(), now(), now()
FROM new_users;

-- ---------- app_accounts 매핑 ----------
INSERT INTO app_accounts (id, role, display_name)
SELECT id, 'staff', '담당자' FROM auth.users WHERE email = 'staff@hew.test';

INSERT INTO app_accounts (id, role, school_id, display_name)
SELECT u.id, 'school', s.id, '양재초 최담임'
FROM auth.users u, schools s
WHERE u.email = 'school-a@hew.test' AND s.name = '양재초등학교';

INSERT INTO app_accounts (id, role, instructor_id, display_name)
SELECT u.id, 'instructor', i.id, '김민수'
FROM auth.users u, instructors i
WHERE u.email = 'instructor-a@hew.test' AND i.name = '김민수';

COMMIT;

SELECT a.role, a.display_name, u.email, s.name AS school, i.name AS instructor
FROM app_accounts a
JOIN auth.users u ON u.id = a.id
LEFT JOIN schools s ON s.id = a.school_id
LEFT JOIN instructors i ON i.id = a.instructor_id
ORDER BY a.role;
