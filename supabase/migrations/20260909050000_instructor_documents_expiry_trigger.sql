-- ================================================================
-- 작업지시서 #003 — instructor_documents 만료일/상태 자동 계산 트리거
-- ================================================================
-- expires_at, status 를 DB 가 단일 소스로 계산한다. (앱은 doc_type, issued_at 만 보냄)
--   expires_at = instructor_doc_expiry(doc_type, issued_at)
--   status     = instructor_doc_status(expires_at)   -- 기준일 CURRENT_DATE
-- 시간이 지나 stale 해진 status 는 #004 배치가 재계산 (또는 화면은 항상 today 로 재판정).
-- ================================================================

CREATE OR REPLACE FUNCTION public.instructor_documents_set_expiry()
  RETURNS trigger
  LANGUAGE plpgsql
AS $$
BEGIN
  NEW.expires_at := public.instructor_doc_expiry(NEW.doc_type, NEW.issued_at);
  NEW.status     := public.instructor_doc_status(NEW.expires_at);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_instructor_documents_set_expiry ON public.instructor_documents;
CREATE TRIGGER trg_instructor_documents_set_expiry
  BEFORE INSERT OR UPDATE OF doc_type, issued_at, expires_at
  ON public.instructor_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.instructor_documents_set_expiry();

-- 기존 행 정합성 보정
UPDATE public.instructor_documents
   SET expires_at = public.instructor_doc_expiry(doc_type, issued_at),
       status     = public.instructor_doc_status(public.instructor_doc_expiry(doc_type, issued_at));
