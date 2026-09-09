-- ================================================================
-- 작업지시서 #002 — 학교 신청 화면에 필요한 읽기 정책
-- ================================================================
-- - programs: 신청 폼의 프로그램 드롭다운용 → 로그인 사용자 전체 SELECT 허용
-- - schools:  학교 계정이 본인 학교 정보(이름 등) 조회 → is_school(id)
-- (staff 정책은 #001 에서 이미 부여됨. instructor 접근은 강사 화면 작업지시서에서.)
-- ================================================================

DROP POLICY IF EXISTS "authenticated_read_programs" ON programs;
CREATE POLICY "authenticated_read_programs" ON programs
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "school_read_own_school" ON schools;
CREATE POLICY "school_read_own_school" ON schools
  FOR SELECT USING (public.is_school(id));
