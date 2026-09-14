-- ================================================================
-- 작업지시서 #019 — 강사별 강의이력 조회 및 경력증명서 발급
-- ================================================================
-- 강의이력 자체는 lecture_confirmations(#012)에 이미 쌓여 있으므로 별도
-- 이력 테이블은 만들지 않는다. 여기서는 (1) 증명서에 쓸 기관 정보(직인
-- 포함, 단일 행), (2) 발급할 때마다 남기는 이력 + 문서번호 채번만 추가한다.
-- ================================================================

-- ------------------------------------------------------------
-- 1. 기관 설정 — 항상 1행만 존재(단일설정). id를 boolean 으로 고정해
--    PRIMARY KEY 제약으로 "행 1개"를 강제하는 흔한 패턴.
-- ------------------------------------------------------------
CREATE TABLE org_settings (
  id BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),
  org_name TEXT NOT NULL DEFAULT '',
  ceo_name TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  seal_image_path TEXT, -- Storage 경로 (org-assets 버킷). 아직 미등록이면 NULL
  updated_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO org_settings (id) VALUES (true);

CREATE POLICY "staff_all_org_settings" ON org_settings
  FOR ALL USING (public.is_staff()) WITH CHECK (public.is_staff());

-- ------------------------------------------------------------
-- 2. 문서번호 채번 — 연도별 일련번호(HEW-2026-0001). 동시 발급 시에도
--    번호가 겹치지 않도록 UPSERT 1문장으로 원자적 증가.
-- ------------------------------------------------------------
CREATE TABLE career_certificate_counters (
  year INT PRIMARY KEY,
  next_seq INT NOT NULL DEFAULT 1
);

CREATE POLICY "staff_all_career_certificate_counters" ON career_certificate_counters
  FOR ALL USING (public.is_staff()) WITH CHECK (public.is_staff());

CREATE OR REPLACE FUNCTION public.next_career_certificate_no()
  RETURNS text
  LANGUAGE plpgsql
  SECURITY INVOKER
  SET search_path = public
AS $$
DECLARE
  v_year int := extract(year from now())::int;
  v_seq int;
BEGIN
  INSERT INTO career_certificate_counters (year, next_seq)
  VALUES (v_year, 2)
  ON CONFLICT (year) DO UPDATE SET next_seq = career_certificate_counters.next_seq + 1
  RETURNING next_seq - 1 INTO v_seq;

  RETURN 'HEW-' || v_year || '-' || lpad(v_seq::text, 4, '0');
END;
$$;

REVOKE ALL ON FUNCTION public.next_career_certificate_no() FROM public;
GRANT EXECUTE ON FUNCTION public.next_career_certificate_no() TO authenticated;

-- ------------------------------------------------------------
-- 3. 발급 이력 — 발급할 때마다 1건. 같은 강사에게 다시 발급해도 새 문서
--    번호로 별개 행이 남고(지시서 2-3), 과거 PDF도 file_path 로 재다운로드.
-- ------------------------------------------------------------
CREATE TABLE career_certificate_issuances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instructor_id UUID NOT NULL REFERENCES instructors(id),
  document_no TEXT NOT NULL UNIQUE,
  period_from DATE, -- NULL = 전체기간
  period_to DATE,   -- NULL = 전체기간
  total_count INT NOT NULL,
  total_hours NUMERIC(6,1) NOT NULL,
  file_path TEXT NOT NULL, -- Storage 경로 (career-certificates 버킷)
  issued_by TEXT,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_career_certificate_issuances_instructor
  ON career_certificate_issuances(instructor_id);

CREATE POLICY "staff_all_career_certificate_issuances" ON career_certificate_issuances
  FOR ALL USING (public.is_staff()) WITH CHECK (public.is_staff());

-- ------------------------------------------------------------
-- 4. Storage 버킷 — 직인 이미지 / 발급된 PDF. 둘 다 staff 전용(비공개).
--    지시서 3. 범위 제외: 강사 본인 self-service 없음 → 강사 정책 불필요.
-- ------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('org-assets', 'org-assets', false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('career-certificates', 'career-certificates', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "org_assets_staff" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'org-assets' AND public.is_staff())
  WITH CHECK (bucket_id = 'org-assets' AND public.is_staff());

CREATE POLICY "career_certificates_staff" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'career-certificates' AND public.is_staff())
  WITH CHECK (bucket_id = 'career-certificates' AND public.is_staff());
