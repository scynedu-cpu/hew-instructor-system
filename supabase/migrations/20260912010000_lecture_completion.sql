-- ================================================================
-- 작업지시서 #012 — 강의 완료 처리
-- ================================================================
-- lecture_confirmations 테이블 자체는 이미 #001 초기 스키마에 있고
-- staff RLS 도 이미 부여돼 있음(20260909010000) — 이번엔 강의확인서
-- 파일을 담을 Storage 버킷만 추가한다. 강사 본인이 볼 필요 없는
-- 담당자 전용 서류라 instructor-documents 와 별도 비공개 버킷으로 분리.

INSERT INTO storage.buckets (id, name, public)
VALUES ('lecture-confirmations', 'lecture-confirmations', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "lecture_confirmations_staff" ON storage.objects;
CREATE POLICY "lecture_confirmations_staff" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'lecture-confirmations' AND public.is_staff())
  WITH CHECK (bucket_id = 'lecture-confirmations' AND public.is_staff());
