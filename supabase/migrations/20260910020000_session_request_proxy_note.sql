-- ================================================================
-- 작업지시서 #008 — 관리자 대리입력: session_requests 비고란
-- ================================================================
-- 대리입력 시 submitted_by 에는 관리자 이름이 들어가고,
-- 원 신청 담당교사·특이사항은 proxy_note 에 남긴다.
-- ================================================================

ALTER TABLE public.session_requests
  ADD COLUMN IF NOT EXISTS proxy_note TEXT;

COMMENT ON COLUMN public.session_requests.proxy_note IS
  '관리자 대리입력 비고 (원 신청자·특이사항). submitted_by 는 관리자 이름.';
