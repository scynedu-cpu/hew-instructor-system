-- ================================================================
-- 작업지시서 #004 — 브라우저 검증용 데모 데이터 (선택)
-- ================================================================
-- 실행:  npx supabase db query --linked -f supabase/tests/seed_matching_demo.sql
-- 재실행 안전(idempotent). 정리:
--   npx supabase db query --linked -f supabase/tests/seed_matching_demo_teardown.sql
--
-- 추가 내용:
--   - AI교육 강사 3명 추가 (김민수 포함 총 4명 → 후보 상위 3명 계산 확인용)
--   - 양재초등학교 'AI교육' 신청서에 희망일자 2건 부여
-- ================================================================

BEGIN;

DELETE FROM instructors WHERE name IN ('DEMO_이지훈', 'DEMO_최유나', 'DEMO_강태호');

INSERT INTO instructors (name, mobile_phone, status, rating_avg, form_submitted_at) VALUES
  ('DEMO_이지훈', '010-5000-0001', 'active', 4.80, current_date),
  ('DEMO_최유나', '010-5000-0002', 'active', 4.00, current_date),
  ('DEMO_강태호', '010-5000-0003', 'active', 3.50, current_date);

INSERT INTO instructor_specialties (instructor_id, specialty)
SELECT id, 'AI교육' FROM instructors WHERE name IN ('DEMO_이지훈', 'DEMO_최유나', 'DEMO_강태호')
UNION ALL
SELECT id, '드론전문가' FROM instructors WHERE name = 'DEMO_강태호';

-- 양재초 AI교육 신청서에 희망일자 부여 (초기 배정 화면에서 빠른선택 확인용)
UPDATE session_requests
   SET requested_dates = ARRAY[current_date + 40, current_date + 47]::date[]
 WHERE required_specialty = 'AI교육'
   AND school_id = (SELECT id FROM schools WHERE name = '양재초등학교');

COMMIT;

-- 참고: AI교육 후보 점수 (specialty 100*0.8 + rating/5*100*0.2)
--   DEMO_이지훈 4.80 → 99.20
--   김민수      4.50 → 98.00
--   DEMO_최유나 4.00 → 96.00   (상위 3명)
--   DEMO_강태호 3.50 → 94.00
SELECT i.name, i.rating_avg,
       round(80 + i.rating_avg / 5 * 100 * 0.2, 2) AS 예상_match_score
FROM instructors i
JOIN instructor_specialties s ON s.instructor_id = i.id AND s.specialty = 'AI교육'
ORDER BY 예상_match_score DESC;
