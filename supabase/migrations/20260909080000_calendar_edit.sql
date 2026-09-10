-- ================================================================
-- 작업지시서 #005 — 자체 캘린더 화면 (일정 드래그 이동 / 강사 교체)
-- ================================================================
-- 필요한 테이블 RLS(class_sessions / session_schedule_history / assignments /
-- assignment_history / instructors / schools / programs)는 #001·#001보강에서
-- staff FOR ALL 로 이미 부여됨. 아래 함수는 모두 SECURITY INVOKER.
--
-- 충돌(같은 강사가 같은 날짜·시간대에 다른 세션에 배정)은 "완전 차단"이 아니라
-- 화면에서 경고 → 담당자 확인 후 진행하는 방식이므로, 변경 함수 자체는
-- 충돌 여부와 무관하게 실행된다. 충돌 조회는 별도 함수로 제공한다.
-- ================================================================

-- ----------------------------------------------------------------
-- 1. 충돌 조회 — 특정 강사가 (날짜, 시간대)에 이미 배정된 다른 세션 목록
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.instructor_time_conflicts(
  p_instructor_id uuid,
  p_date date,
  p_time_slot text,
  p_exclude_session_id uuid
)
  RETURNS TABLE (
    session_id uuid,
    school_name text,
    program_name text,
    scheduled_date date,
    time_slot text,
    session_status text
  )
  LANGUAGE sql
  SECURITY INVOKER
  STABLE
  SET search_path = public
AS $$
  SELECT cs.id, sc.name, pr.name, cs.scheduled_date, cs.time_slot, cs.session_status
  FROM public.assignments a
  JOIN public.class_sessions cs ON cs.id = a.session_id
  JOIN public.schools sc ON sc.id = cs.school_id
  JOIN public.programs pr ON pr.id = cs.program_id
  WHERE a.instructor_id = p_instructor_id
    AND cs.id <> p_exclude_session_id
    AND cs.scheduled_date = p_date
    AND cs.time_slot IS NOT DISTINCT FROM p_time_slot
    AND cs.session_status <> 'cancelled'
  ORDER BY cs.scheduled_date;
$$;

REVOKE ALL ON FUNCTION public.instructor_time_conflicts(uuid, date, text, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.instructor_time_conflicts(uuid, date, text, uuid) TO authenticated;

-- ----------------------------------------------------------------
-- 2. 일정 변경 (드래그 이동 / 상세패널 편집)
--    class_sessions.scheduled_date/time_slot 갱신 + session_schedule_history 기록
-- ----------------------------------------------------------------
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
END;
$$;

REVOKE ALL ON FUNCTION public.reschedule_session(uuid, date, text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.reschedule_session(uuid, date, text, text, text) TO authenticated;

-- ----------------------------------------------------------------
-- 3. 강사 교체 (캘린더 상세패널 — 전체 강사 중 자유 선택)
--    assignments.instructor_id 갱신 + assignment_history(change_context='calendar_edit')
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.swap_session_instructor(
  p_session_id uuid,
  p_new_instructor_id uuid,
  p_changed_by text,
  p_reason text DEFAULT NULL
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY INVOKER
  SET search_path = public
AS $$
DECLARE
  v_assignment public.assignments;
BEGIN
  SELECT * INTO v_assignment FROM public.assignments WHERE session_id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION '이 세션에 배정된 강사가 없습니다. 먼저 강사 배정을 진행하세요.'
      USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.instructors WHERE id = p_new_instructor_id) THEN
    RAISE EXCEPTION '강사를 찾을 수 없습니다.' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_assignment.instructor_id = p_new_instructor_id THEN
    RETURN;  -- 동일 강사 → 변경 없음
  END IF;

  INSERT INTO public.assignment_history (
    assignment_id, from_status, to_status,
    from_instructor_id, to_instructor_id,
    change_context, changed_by, reason
  ) VALUES (
    v_assignment.id, v_assignment.assignment_type, v_assignment.assignment_type,
    v_assignment.instructor_id, p_new_instructor_id,
    'calendar_edit', COALESCE(NULLIF(p_changed_by, ''), '담당자'), p_reason
  );

  UPDATE public.assignments
     SET instructor_id = p_new_instructor_id,
         updated_at    = now()
   WHERE id = v_assignment.id;
END;
$$;

REVOKE ALL ON FUNCTION public.swap_session_instructor(uuid, uuid, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.swap_session_instructor(uuid, uuid, text, text) TO authenticated;
