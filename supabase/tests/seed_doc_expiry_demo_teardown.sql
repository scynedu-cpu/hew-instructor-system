-- ================================================================
-- 작업지시서 #006 데모 데이터 정리 — seed_doc_expiry_demo.sql 원복
-- ================================================================
-- seed_test_accounts.sql 의 김민수 서류 기본값으로 되돌리고, 박서연 이력서 제거.
BEGIN;

DELETE FROM instructor_documents d
 USING instructors i
 WHERE d.instructor_id = i.id AND i.name = '박서연' AND d.doc_type = '이력서';

-- 김민수 서류 기본값 복원 (seed_test_accounts.sql 과 동일)
UPDATE instructor_documents
   SET issued_at = current_date - 300, expiry_notified_at = NULL, expired_notified_at = NULL
 WHERE doc_type = '성범죄경력조회동의서'
   AND instructor_id = (SELECT id FROM instructors WHERE name = '김민수');

UPDATE instructor_documents
   SET issued_at = current_date - 400, expiry_notified_at = NULL, expired_notified_at = NULL
 WHERE doc_type = '이력서'
   AND instructor_id = (SELECT id FROM instructors WHERE name = '김민수');

COMMIT;

SELECT i.name, d.doc_type, d.issued_at, d.expires_at, d.status
FROM instructor_documents d JOIN instructors i ON i.id = d.instructor_id
WHERE i.name IN ('김민수','박서연') ORDER BY i.name, d.doc_type;
