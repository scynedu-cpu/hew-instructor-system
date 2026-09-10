-- ================================================================
-- 작업지시서 #006 — 서류 만료 알림 검증용 데모 데이터
-- ================================================================
-- 실행:  npx supabase db query --linked -f supabase/tests/seed_doc_expiry_demo.sql
-- 정리:  npx supabase db query --linked -f supabase/tests/seed_doc_expiry_demo_teardown.sql
--
-- 시나리오:
--   김민수 · 성범죄경력조회동의서 : 만료 20일 뒤  → 배치가 expiring_soon 으로 갱신 + 임박 메일
--   김민수 · 이력서              : 만료 10일 지남 → 배치가 expired 로 갱신 + 만료 메일
--   박서연 · 이력서              : 정상(만료 여유)  → 알림 없음 (대조군)
--
-- 트릭: issued_at 을 바꾸면 트리거가 expires_at·status 를 "오늘" 기준으로 다시 계산한다.
--       그래서 두 번째 UPDATE 로 status 만 'valid' 로 되돌려(트리거 미발동 컬럼) stale 상태를 만든다.
--       → 배치의 refresh 가 실제로 status 를 갱신하는지 확인 가능.
-- ================================================================

BEGIN;

-- 대조군: 박서연 이력서 (정상)
DELETE FROM instructor_documents d
 USING instructors i
 WHERE d.instructor_id = i.id AND i.name = '박서연' AND d.doc_type = '이력서';
INSERT INTO instructor_documents (instructor_id, doc_type, issued_at)
SELECT id, '이력서', current_date - 200 FROM instructors WHERE name = '박서연';

-- 김민수 성범죄경력조회동의서 → 만료 20일 뒤 (issued + 1년 = 오늘 + 20일)
UPDATE instructor_documents
   SET issued_at = current_date - interval '345 days'
 WHERE doc_type = '성범죄경력조회동의서'
   AND instructor_id = (SELECT id FROM instructors WHERE name = '김민수');

-- 김민수 이력서 → 만료 10일 지남 (issued + 3년 = 오늘 - 10일)
UPDATE instructor_documents
   SET issued_at = (current_date - interval '3 years' - interval '10 days')::date
 WHERE doc_type = '이력서'
   AND instructor_id = (SELECT id FROM instructors WHERE name = '김민수');

-- status 를 stale('valid') 로 되돌리고 알림 시각 초기화 (트리거는 status 컬럼에 안 걸림)
UPDATE instructor_documents
   SET status = 'valid', expiry_notified_at = NULL, expired_notified_at = NULL
 WHERE instructor_id IN (SELECT id FROM instructors WHERE name IN ('김민수', '박서연'));

COMMIT;

SELECT i.name, d.doc_type, d.issued_at, d.expires_at, d.status,
       d.expiry_notified_at, d.expired_notified_at
FROM instructor_documents d
JOIN instructors i ON i.id = d.instructor_id
WHERE i.name IN ('김민수', '박서연')
ORDER BY i.name, d.doc_type;
