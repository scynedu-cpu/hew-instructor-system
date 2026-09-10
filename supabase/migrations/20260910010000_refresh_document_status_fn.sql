-- ================================================================
-- 작업지시서 #006 — 서류 상태 자동 갱신 함수 (매일 배치용)
-- ================================================================
-- #003 트리거는 업로드/발급일 변경 시점에만 status 를 계산했다.
-- 이 함수는 새 서류를 안 올려도 시간이 지나면 expires_at 기준으로
-- status 를 다시 맞춰준다. (계산 규칙은 #003 의 instructor_doc_status 그대로)
--
-- 배치(API 라우트)는 service_role 로 호출하므로 RLS 우회.
-- 반환값: 실제로 status 가 바뀐 행 수.
-- ================================================================

CREATE OR REPLACE FUNCTION public.refresh_instructor_document_status()
  RETURNS integer
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path = public
AS $$
  WITH upd AS (
    UPDATE public.instructor_documents d
       SET status = public.instructor_doc_status(d.expires_at)
     WHERE d.status IS DISTINCT FROM public.instructor_doc_status(d.expires_at)
    RETURNING 1
  )
  SELECT COALESCE(count(*), 0)::int FROM upd;
$$;

REVOKE ALL ON FUNCTION public.refresh_instructor_document_status() FROM public;
GRANT EXECUTE ON FUNCTION public.refresh_instructor_document_status() TO service_role;
