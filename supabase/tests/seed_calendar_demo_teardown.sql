-- ================================================================
-- 작업지시서 #005 데모 데이터 정리 — seed_calendar_demo.sql 원복
-- ================================================================
BEGIN;

-- 데모 세션(수기 등록, 2026-09, 특정 시간대)에 딸린 배정/이력 정리
DELETE FROM class_sessions
 WHERE academic_year = 2026 AND request_id IS NULL
   AND school_id IN (SELECT id FROM schools WHERE name IN ('양재초등학교','매헌중학교'))
   AND time_slot IN ('10:00~12:00','2·3교시','3·4교시')
   AND scheduled_date BETWEEN date '2026-09-01' AND date '2026-10-31';
-- (assignments / assignment_history / session_schedule_history / assignment_candidates
--  는 session_id ON DELETE CASCADE)

-- DEMO 강사 정리 (candidates 는 FK ON DELETE 규칙 없음 → 먼저 삭제)
DELETE FROM assignment_candidates
 WHERE instructor_id IN (SELECT id FROM instructors WHERE name LIKE 'DEMO\_%');
DELETE FROM assignment_history ah USING assignments a
 WHERE ah.assignment_id = a.id
   AND a.instructor_id IN (SELECT id FROM instructors WHERE name LIKE 'DEMO\_%');
DELETE FROM assignments
 WHERE instructor_id IN (SELECT id FROM instructors WHERE name LIKE 'DEMO\_%');
DELETE FROM instructors WHERE name LIKE 'DEMO\_%';

COMMIT;
