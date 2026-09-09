-- ================================================================
-- 작업지시서 #002 — 신청 승인 시 class_sessions 자동 생성 (원자적 처리)
-- ================================================================
-- staff 가 신청을 승인하면 상태 변경 + class_sessions 1건 생성을
-- 한 트랜잭션에서 처리한다. SECURITY INVOKER 이므로 RLS(staff 전용)가
-- 그대로 적용된다.
--   scheduled_date = 희망일자 중 첫 값 (없으면 NULL) — 실제 확정은 매칭 단계에서
--   session_status = 'unassigned'
-- ================================================================

CREATE OR REPLACE FUNCTION public.approve_session_request(
  p_request_id uuid,
  p_reviewer text
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY INVOKER
  SET search_path = public
AS $$
DECLARE
  r public.session_requests;
  new_session_id uuid;
BEGIN
  SELECT * INTO r FROM public.session_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION '신청서를 찾을 수 없습니다.' USING ERRCODE = 'no_data_found';
  END IF;
  IF r.request_status IN ('approved', 'rejected') THEN
    RAISE EXCEPTION '이미 처리된 신청입니다 (현재 상태: %).', r.request_status
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  UPDATE public.session_requests
     SET request_status = 'approved',
         reviewed_by    = p_reviewer,
         reviewed_at    = now()
   WHERE id = p_request_id;

  INSERT INTO public.class_sessions (
    request_id, school_id, program_id, academic_year,
    scheduled_date, time_slot, student_count,
    required_specialty, required_instructor_count, session_status
  ) VALUES (
    r.id, r.school_id, r.program_id, r.academic_year,
    (r.requested_dates)[1], r.preferred_time_slot, r.expected_student_count,
    r.required_specialty, COALESCE(r.required_instructor_count, 1), 'unassigned'
  )
  RETURNING id INTO new_session_id;

  RETURN new_session_id;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_session_request(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.approve_session_request(uuid, text) TO authenticated;
