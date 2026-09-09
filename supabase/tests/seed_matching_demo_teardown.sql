-- ================================================================
-- 작업지시서 #004 데모 데이터 정리 — seed_matching_demo.sql 원복
-- ================================================================
BEGIN;

-- 데모 강사가 배정된 세션이 있으면 배정/후보/이력부터 제거
DELETE FROM assignment_history ah
  USING assignments a
 WHERE ah.assignment_id = a.id
   AND a.instructor_id IN (SELECT id FROM instructors WHERE name IN ('DEMO_이지훈','DEMO_최유나','DEMO_강태호'));

DELETE FROM assignments
 WHERE instructor_id IN (SELECT id FROM instructors WHERE name IN ('DEMO_이지훈','DEMO_최유나','DEMO_강태호'));

-- assignment_candidates.instructor_id 는 ON DELETE 규칙이 없어 강사보다 먼저 지워야 한다
DELETE FROM assignment_candidates
 WHERE instructor_id IN (SELECT id FROM instructors WHERE name IN ('DEMO_이지훈','DEMO_최유나','DEMO_강태호'));

DELETE FROM instructors WHERE name IN ('DEMO_이지훈','DEMO_최유나','DEMO_강태호');

-- 데모로 만들어진 class_sessions / 후보 정리 (양재초 AI교육 신청서 기준)
DELETE FROM assignment_candidates ac
  USING class_sessions cs, session_requests sr, schools sc
 WHERE ac.session_id = cs.id
   AND cs.request_id = sr.id
   AND sr.school_id = sc.id AND sc.name = '양재초등학교' AND sr.required_specialty = 'AI교육';

DELETE FROM assignments a
  USING class_sessions cs, session_requests sr, schools sc
 WHERE a.session_id = cs.id
   AND cs.request_id = sr.id
   AND sr.school_id = sc.id AND sc.name = '양재초등학교' AND sr.required_specialty = 'AI교육';

DELETE FROM class_sessions cs
  USING session_requests sr, schools sc
 WHERE cs.request_id = sr.id
   AND sr.school_id = sc.id AND sc.name = '양재초등학교' AND sr.required_specialty = 'AI교육';

UPDATE session_requests
   SET request_status = 'submitted', requested_dates = NULL, reviewed_by = NULL, reviewed_at = NULL
 WHERE required_specialty = 'AI교육'
   AND school_id = (SELECT id FROM schools WHERE name = '양재초등학교');

COMMIT;
