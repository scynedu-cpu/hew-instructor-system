-- ================================================================
-- hew_schema.sql 반영 — instructor_documents.expired_notified_at 추가
-- ================================================================
-- 기존 expiry_notified_at(임박 알림 발송 시각)과 별도로,
-- '만료(expired)' 알림을 발송한 시각을 기록한다. (작업지시서 #006)
-- ================================================================

ALTER TABLE public.instructor_documents
  ADD COLUMN IF NOT EXISTS expired_notified_at TIMESTAMPTZ;
