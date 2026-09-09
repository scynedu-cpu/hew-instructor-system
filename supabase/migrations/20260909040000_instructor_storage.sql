-- ================================================================
-- 작업지시서 #003 — 강사 제출서류/사진 Storage 버킷 + 정책 + 서류 상태 헬퍼
-- ================================================================
-- instructors 및 하위 테이블의 RLS(instructor 본인 / staff 전체)는 #001 에서
-- 이미 FOR ALL(USING+WITH CHECK) 로 부여됨 → 추가 테이블 정책 불필요.
-- 이 마이그레이션은 Storage 와 서류 만료/상태 계산만 담당.
-- ================================================================

-- ------------------------------------------------------------
-- 1. Storage 버킷
--   instructor-documents : 비공개 (제출서류, 서명 URL 로만 접근)
--   instructor-photos    : 공개 (프로필 사진)
--   경로 규칙: <instructor_id>/<...>  (첫 폴더 = 강사 id → 본인 것만 접근)
-- ------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('instructor-documents', 'instructor-documents', false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('instructor-photos', 'instructor-photos', true)
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------
-- 2. storage.objects 정책
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "inst_docs_instructor_own" ON storage.objects;
CREATE POLICY "inst_docs_instructor_own" ON storage.objects
  FOR ALL TO authenticated
  USING (
    bucket_id = 'instructor-documents'
    AND public.is_instructor(NULLIF((storage.foldername(name))[1], '')::uuid)
  )
  WITH CHECK (
    bucket_id = 'instructor-documents'
    AND public.is_instructor(NULLIF((storage.foldername(name))[1], '')::uuid)
  );

DROP POLICY IF EXISTS "inst_docs_staff" ON storage.objects;
CREATE POLICY "inst_docs_staff" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'instructor-documents' AND public.is_staff())
  WITH CHECK (bucket_id = 'instructor-documents' AND public.is_staff());

DROP POLICY IF EXISTS "inst_photos_read" ON storage.objects;
CREATE POLICY "inst_photos_read" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'instructor-photos');

DROP POLICY IF EXISTS "inst_photos_instructor_own_write" ON storage.objects;
CREATE POLICY "inst_photos_instructor_own_write" ON storage.objects
  FOR ALL TO authenticated
  USING (
    bucket_id = 'instructor-photos'
    AND public.is_instructor(NULLIF((storage.foldername(name))[1], '')::uuid)
  )
  WITH CHECK (
    bucket_id = 'instructor-photos'
    AND public.is_instructor(NULLIF((storage.foldername(name))[1], '')::uuid)
  );

DROP POLICY IF EXISTS "inst_photos_staff_write" ON storage.objects;
CREATE POLICY "inst_photos_staff_write" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'instructor-photos' AND public.is_staff())
  WITH CHECK (bucket_id = 'instructor-photos' AND public.is_staff());

-- ------------------------------------------------------------
-- 3. 서류 만료일 / 상태 계산 헬퍼 (앱과 동일 규칙 — #004 배치에서도 재사용)
--   성범죄경력조회동의서 → 발급 + 1년
--   이력서              → 발급 + 3년
--   그 외               → 만료 없음
--   상태: 오늘 >= 만료   → expired
--         만료 - 30일 이하 → expiring_soon
--         그 외            → valid
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.instructor_doc_expiry(p_doc_type text, p_issued_at date)
  RETURNS date
  LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_issued_at IS NULL THEN NULL
    WHEN p_doc_type = '성범죄경력조회동의서' THEN p_issued_at + INTERVAL '1 year'
    WHEN p_doc_type = '이력서'              THEN p_issued_at + INTERVAL '3 year'
    ELSE NULL
  END::date;
$$;

CREATE OR REPLACE FUNCTION public.instructor_doc_status(p_expires_at date)
  RETURNS text
  LANGUAGE sql STABLE
AS $$
  SELECT CASE
    WHEN p_expires_at IS NULL THEN 'valid'
    WHEN CURRENT_DATE >= p_expires_at THEN 'expired'
    WHEN CURRENT_DATE >= p_expires_at - 30 THEN 'expiring_soon'
    ELSE 'valid'
  END;
$$;
