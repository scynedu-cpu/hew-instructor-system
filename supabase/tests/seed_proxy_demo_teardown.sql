-- ================================================================
-- 작업지시서 #008 검증 데이터 정리
-- ================================================================
BEGIN;

-- 대리입력 테스트로 만든 강사 프로필 제거 (하위 테이블 CASCADE)
DELETE FROM instructors WHERE name IN ('홍정민', '이수민');

-- 대리입력 테스트 신청서 제거 (담당자 이름으로 접수된 것 중 데모 학교)
DELETE FROM class_sessions cs USING session_requests sr
 WHERE cs.request_id = sr.id
   AND sr.submitted_by = '담당자'
   AND sr.proxy_note IS NOT NULL;
DELETE FROM session_requests
 WHERE submitted_by = '담당자' AND proxy_note IS NOT NULL;

COMMIT;
