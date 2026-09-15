-- ================================================================
-- 버그수정 — 일정 변경(캘린더 드래그/상세패널) 시 최종확정 마감일 미갱신
-- ================================================================
-- confirm_due_date(= scheduled_date - 1개월)는 임시배정 시점에 딱 한 번만
-- 계산되고(#004 select_provisional), 이후 캘린더에서 날짜를 옮겨도
-- reschedule_session() 이 class_sessions 만 갱신하고 assignments 는
-- 건드리지 않았다. 그 결과 날짜를 앞당긴 경우 마감일이 미래에 멈춰 있어
-- "최종확정 필요" 목록(confirm_due_date <= 오늘)에 영영 안 뜨는 문제가
-- 있었다 — 날짜를 뒤로 미룬 경우도 마감일이 실제보다 너무 이르게 남는
-- 문제는 동일.
--
-- 수정: 날짜가 실제로 바뀌고 그 세션에 임시배정(provisional)이 있으면
-- confirm_due_date 를 새 날짜 기준으로 다시 계산한다.
-- ================================================================

CREATE OR REPLACE FUNCTION public.reschedule_session(
  p_session_id uuid,
  p_new_date date,
  p_new_time_slot text,
  p_changed_by text,
  p_reason text DEFAULT NULL
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY INVOKER
  SET search_path = public
AS $$
DECLARE
  v_session public.class_sessions;
BEGIN
  IF p_new_date IS NULL THEN
    RAISE EXCEPTION '이동할 날짜는 필수입니다.' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT * INTO v_session FROM public.class_sessions WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION '세션을 찾을 수 없습니다.' USING ERRCODE = 'no_data_found';
  END IF;

  -- 변경 없음 → 아무것도 하지 않음
  IF v_session.scheduled_date IS NOT DISTINCT FROM p_new_date
     AND v_session.time_slot IS NOT DISTINCT FROM NULLIF(p_new_time_slot, '') THEN
    RETURN;
  END IF;

  INSERT INTO public.session_schedule_history (
    session_id, previous_date, previous_time_slot, new_date, new_time_slot, changed_by, reason
  ) VALUES (
    p_session_id, v_session.scheduled_date, v_session.time_slot,
    p_new_date, NULLIF(p_new_time_slot, ''),
    COALESCE(NULLIF(p_changed_by, ''), '담당자'), p_reason
  );

  UPDATE public.class_sessions
     SET scheduled_date = p_new_date,
         time_slot      = NULLIF(p_new_time_slot, '')
   WHERE id = p_session_id;

  -- 날짜가 실제로 바뀐 임시배정 건은 최종확정 마감일도 새 날짜 기준으로 재계산
  IF v_session.scheduled_date IS DISTINCT FROM p_new_date THEN
    UPDATE public.assignments
       SET confirm_due_date = p_new_date - INTERVAL '1 month'
     WHERE session_id = p_session_id
       AND assignment_type = 'provisional';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.reschedule_session(uuid, date, text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.reschedule_session(uuid, date, text, text, text) TO authenticated;
