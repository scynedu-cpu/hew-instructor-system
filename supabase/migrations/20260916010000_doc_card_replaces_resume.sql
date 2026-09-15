-- ================================================================
-- "이력서" 서류 종류 폐지 — "강사카드"와 동일 서류(고객 확인)
-- ================================================================
-- 신청 배경: 이력서와 강사카드는 실제로 같은 서류라 별도 항목으로 둘 필요가
-- 없다. "강사카드"에 이력서가 갖고 있던 유효기간(발급+3년) 규칙을 그대로
-- 옮기고, 기존에 '이력서'로 저장된 서류는 '강사카드'로 재분류한다.
-- (앱 쪽 화이트리스트는 src/lib/documents.ts DOC_TYPES 에서 이미 '이력서'를
--  제거함 — 이 마이그레이션은 DB 쪽 계산 규칙 + 제약 + 기존 데이터를 맞춘다.)
-- ================================================================

-- 1) 만료일 계산 규칙: 이력서 3년 → 강사카드 3년
CREATE OR REPLACE FUNCTION public.instructor_doc_expiry(p_doc_type text, p_issued_at date)
  RETURNS date
  LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_issued_at IS NULL THEN NULL
    WHEN p_doc_type = '성범죄경력조회동의서' THEN p_issued_at + INTERVAL '1 year'
    WHEN p_doc_type = '강사카드'              THEN p_issued_at + INTERVAL '3 year'
    ELSE NULL
  END::date;
$$;

-- 2) 기존 '이력서' 서류를 '강사카드'로 재분류 (재실행해도 안전 — 남아있는
--    '이력서' 행이 있을 때만 수행)
UPDATE instructor_documents
   SET doc_type = '강사카드'
 WHERE doc_type = '이력서';

-- 3) doc_type 허용값에서 '이력서' 제거 (제약명은 초기 스키마의 기본 자동 생성명)
ALTER TABLE instructor_documents DROP CONSTRAINT IF EXISTS instructor_documents_doc_type_check;
ALTER TABLE instructor_documents ADD CONSTRAINT instructor_documents_doc_type_check CHECK (doc_type IN (
  '강사카드','개인정보동의서','신분증사본','통장사본',
  '결격조회동의서','성범죄경력조회동의서'
));

-- 4) 규칙이 바뀐 문서(이번에 재분류된 강사카드 포함)의 만료일/상태 재계산
--    — 트리거는 신규 INSERT/UPDATE에만 걸리므로 기존 행은 직접 보정
--    (20260909050000 의 "기존 행 정합성 보정"과 동일 패턴)
UPDATE instructor_documents
   SET expires_at = public.instructor_doc_expiry(doc_type, issued_at),
       status     = public.instructor_doc_status(public.instructor_doc_expiry(doc_type, issued_at));
