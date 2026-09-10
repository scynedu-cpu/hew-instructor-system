-- ================================================================
-- 작업지시서 #005 — 브라우저 검증용 데모 데이터 (선택)
-- ================================================================
-- 실행:  npx supabase db query --linked -f supabase/tests/seed_calendar_demo.sql
-- 정리:  npx supabase db query --linked -f supabase/tests/seed_calendar_demo_teardown.sql
--
-- 시나리오 (2026-09):
--   S1 양재초·센터체험    confirmed   김민수      09-15 10:00~12:00
--   S2 매헌중·직업인특강  provisional 김민수      09-18 10:00~12:00  ← 같은 강사
--   S3 양재초·직업인특강  confirmed   박서연      09-25 2·3교시
--   → S1 을 09-18 로 드래그하면 김민수 충돌 경고
--   → S3 상세에서 강사를 DEMO_강태호 로 교체(충돌 없음)
-- ================================================================

BEGIN;

DELETE FROM instructors WHERE name = 'DEMO_강태호';
INSERT INTO instructors (name, mobile_phone, status, rating_avg, form_submitted_at)
VALUES ('DEMO_강태호', '010-5000-0003', 'active', 3.50, current_date);
INSERT INTO instructor_specialties (instructor_id, specialty)
SELECT id, unnest(ARRAY['AI교육','드론전문가']) FROM instructors WHERE name = 'DEMO_강태호';

-- 기존 데모 세션 정리 (idempotent)
DELETE FROM class_sessions
 WHERE academic_year = 2026 AND request_id IS NULL
   AND school_id IN (SELECT id FROM schools WHERE name IN ('양재초등학교','매헌중학교'))
   AND time_slot IN ('10:00~12:00','2·3교시')
   AND scheduled_date BETWEEN date '2026-09-01' AND date '2026-09-30';

DO $$
DECLARE
  v_yj uuid := (SELECT id FROM schools WHERE name = '양재초등학교');
  v_mh uuid := (SELECT id FROM schools WHERE name = '매헌중학교');
  v_center uuid := (SELECT id FROM programs WHERE name = '센터체험');
  v_talk uuid := (SELECT id FROM programs WHERE name = '직업인특강');
  v_kim uuid := (SELECT id FROM instructors WHERE name = '김민수');
  v_park uuid := (SELECT id FROM instructors WHERE name = '박서연');
  s1 uuid; s2 uuid; s3 uuid;
BEGIN
  INSERT INTO class_sessions (school_id, program_id, academic_year, scheduled_date, time_slot, student_count, required_specialty, session_status)
    VALUES (v_yj, v_center, 2026, date '2026-09-15', '10:00~12:00', '120명', 'AI교육', 'confirmed') RETURNING id INTO s1;
  INSERT INTO class_sessions (school_id, program_id, academic_year, scheduled_date, time_slot, student_count, required_specialty, session_status)
    VALUES (v_mh, v_talk, 2026, date '2026-09-18', '10:00~12:00', '8학급', 'AI교육', 'provisional') RETURNING id INTO s2;
  INSERT INTO class_sessions (school_id, program_id, academic_year, scheduled_date, time_slot, student_count, required_specialty, session_status)
    VALUES (v_yj, v_talk, 2026, date '2026-09-25', '2·3교시', '90명', '드론전문가', 'confirmed') RETURNING id INTO s3;

  INSERT INTO assignments (session_id, instructor_id, assignment_type, assigned_by, provisional_at, confirmed_at, confirm_due_date)
    VALUES (s1, v_kim, 'confirmed', '담당자', now() - interval '60 days', now() - interval '40 days', date '2026-08-15');
  INSERT INTO assignments (session_id, instructor_id, assignment_type, assigned_by, provisional_at, confirm_due_date)
    VALUES (s2, v_kim, 'provisional', '담당자', now() - interval '30 days', date '2026-08-18');
  INSERT INTO assignments (session_id, instructor_id, assignment_type, assigned_by, provisional_at, confirmed_at, confirm_due_date)
    VALUES (s3, v_park, 'confirmed', '담당자', now() - interval '50 days', now() - interval '30 days', date '2026-08-25');
END $$;

COMMIT;

SELECT cs.scheduled_date, cs.time_slot, sc.name school, pr.name program, cs.session_status, i.name instructor
FROM class_sessions cs
JOIN schools sc ON sc.id = cs.school_id
JOIN programs pr ON pr.id = cs.program_id
LEFT JOIN assignments a ON a.session_id = cs.id
LEFT JOIN instructors i ON i.id = a.instructor_id
WHERE cs.academic_year = 2026 AND cs.request_id IS NULL
  AND cs.scheduled_date BETWEEN date '2026-09-01' AND date '2026-09-30'
ORDER BY cs.scheduled_date;
