-- ================================================================
-- 작업지시서 #001 보강 — 나머지 테이블 staff 전용 RLS 정책
-- ================================================================
-- 배경: 이 Supabase 프로젝트에는 public 스키마의 모든 신규 테이블에
--   자동으로 RLS 를 켜는 이벤트 트리거(rls_auto_enable)가 있다.
--   그래서 최초 마이그레이션에서 정책을 안 만든 테이블들은
--   RLS 는 켜져 있지만 정책이 없어 => 아무도(서비스롤 제외) 조회 불가.
--
-- 이번 단계 방침:
--   - 담당자(staff) 는 전 테이블 전체 접근 (완료기준 #2)
--   - 학교(school)/강사(instructor) 의 그 외 테이블 접근은
--     해당 화면을 만드는 이후 작업지시서에서 테이블별로 부여
--   - app_accounts 는 staff 전체 + 본인 행 조회만 허용
-- ================================================================

-- 재실행 가능하도록 DROP POLICY IF EXISTS 후 CREATE
DO $$
DECLARE
  t text;
  staff_tables text[] := ARRAY[
    'schools','programs','class_sessions','assignment_candidates','assignments',
    'assignment_history','session_schedule_history','lecture_confirmations',
    'satisfaction_surveys','payments','app_account_holder_history','app_accounts'
  ];
BEGIN
  FOREACH t IN ARRAY staff_tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'staff_all_' || t, t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL USING (public.is_staff()) WITH CHECK (public.is_staff())',
      'staff_all_' || t, t);
  END LOOP;
END $$;

-- app_accounts — 로그인 사용자 본인 행 조회 허용
DROP POLICY IF EXISTS "self_select_app_accounts" ON app_accounts;
CREATE POLICY "self_select_app_accounts" ON app_accounts
  FOR SELECT USING (id = auth.uid());
