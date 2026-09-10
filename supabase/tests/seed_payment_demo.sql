-- ================================================================
-- 작업지시서 #007 — 브라우저 검증용 데모 데이터
-- ================================================================
-- 실행:  npx supabase db query --linked -f supabase/tests/seed_payment_demo.sql
-- 정리:  npx supabase db query --linked -f supabase/tests/seed_payment_demo_teardown.sql
--
-- 단가 120,000원. 2026-09 완료 강의: 김민수 2건, 박서연 1건.
--   → 9월 정산 시 김민수 240,000원(2건), 박서연 120,000원(1건)
-- ================================================================

BEGIN;

INSERT INTO payment_rate_settings(rate, effective_from, note, created_by)
VALUES (120000, current_date - 30, 'DEMO 기본 단가', '담당자');

DO $$
DECLARE
  v_school uuid := (SELECT id FROM schools WHERE name = '양재초등학교');
  v_prog uuid := (SELECT id FROM programs WHERE name = '센터체험');
  v_kim uuid := (SELECT id FROM instructors WHERE name = '김민수');
  v_park uuid := (SELECT id FROM instructors WHERE name = '박서연');
  s1 uuid; s2 uuid; s3 uuid; a1 uuid; a2 uuid; a3 uuid;
BEGIN
  INSERT INTO class_sessions(school_id, program_id, academic_year, scheduled_date, time_slot, session_status)
    VALUES (v_school, v_prog, 2026, date '2026-09-04', '1,2교시', 'completed') RETURNING id INTO s1;
  INSERT INTO class_sessions(school_id, program_id, academic_year, scheduled_date, time_slot, session_status)
    VALUES (v_school, v_prog, 2026, date '2026-09-11', '3,4교시', 'completed') RETURNING id INTO s2;
  INSERT INTO class_sessions(school_id, program_id, academic_year, scheduled_date, time_slot, session_status)
    VALUES (v_school, v_prog, 2026, date '2026-09-05', '5,6교시', 'completed') RETURNING id INTO s3;

  INSERT INTO assignments(session_id, instructor_id, assignment_type, assigned_by)
    VALUES (s1, v_kim, 'confirmed', '담당자') RETURNING id INTO a1;
  INSERT INTO assignments(session_id, instructor_id, assignment_type, assigned_by)
    VALUES (s2, v_kim, 'confirmed', '담당자') RETURNING id INTO a2;
  INSERT INTO assignments(session_id, instructor_id, assignment_type, assigned_by)
    VALUES (s3, v_park, 'confirmed', '담당자') RETURNING id INTO a3;

  INSERT INTO lecture_confirmations(assignment_id, actual_date, actual_hours) VALUES
    (a1, date '2026-09-04', 2),
    (a2, date '2026-09-11', 2),
    (a3, date '2026-09-05', 3);
END $$;

COMMIT;

SELECT i.name, lc.actual_date, sc.name school, pr.name program
FROM lecture_confirmations lc
JOIN assignments a ON a.id = lc.assignment_id
JOIN instructors i ON i.id = a.instructor_id
JOIN class_sessions cs ON cs.id = a.session_id
JOIN schools sc ON sc.id = cs.school_id
JOIN programs pr ON pr.id = cs.program_id
WHERE a.assigned_by = '담당자' AND lc.actual_date >= date '2026-09-01'
ORDER BY i.name, lc.actual_date;
