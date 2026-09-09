-- ================================================================
-- 작업지시서 #004 — 강사 매칭 로직 및 배정 (임시배정 + 최종확정)
-- ================================================================
-- 필요한 테이블 RLS(class_sessions / assignment_candidates / assignments /
-- assignment_history / instructors / instructor_specialties)는 #001·#001보강에서
-- staff FOR ALL(USING+WITH CHECK) 로 이미 부여됨. 아래 함수는 모두
-- SECURITY INVOKER 이므로 호출자(staff) 의 RLS 가 그대로 적용된다.
--
-- match_score = specialty_match(0~100) * 0.8 + (rating_avg/5*100) * 0.2
--   specialty_match: required_specialty 와 정확히 일치하는 전문분야가 있으면 100, 없으면 0
-- 하드필터: 같은 scheduled_date + time_slot 에 이미 다른 세션에 배정된 강사는 후보에서 제외
--          (+ status='active' 강사만)
-- ================================================================

-- ----------------------------------------------------------------
-- 1. 매칭 함수 — 세션 1건에 대해 상위 3명을 assignment_candidates 에 갱신
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_assignment_candidates(p_session_id uuid)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY INVOKER
  SET search_path = public
AS $$
DECLARE
  v_session public.class_sessions;
BEGIN
  SELECT * INTO v_session FROM public.class_sessions WHERE id = p_session_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION '세션을 찾을 수 없습니다.' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_session.scheduled_date IS NULL THEN
    RAISE EXCEPTION '예정일이 확정되지 않아 매칭을 실행할 수 없습니다.'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- 기존 후보 삭제 후 재계산
  DELETE FROM public.assignment_candidates WHERE session_id = p_session_id;

  INSERT INTO public.assignment_candidates (session_id, instructor_id, rank, match_score)
  SELECT p_session_id, id, rn, match_score
  FROM (
    SELECT
      id,
      match_score,
      ROW_NUMBER() OVER (ORDER BY match_score DESC, rating_avg DESC NULLS LAST, name) AS rn
    FROM (
      SELECT
        i.id,
        i.name,
        i.rating_avg,
        (CASE WHEN EXISTS (
           SELECT 1 FROM public.instructor_specialties isp
           WHERE isp.instructor_id = i.id
             AND isp.specialty = v_session.required_specialty
         ) THEN 100 ELSE 0 END) * 0.8
        + (COALESCE(i.rating_avg, 0) / 5 * 100) * 0.2 AS match_score
      FROM public.instructors i
      WHERE i.status = 'active'
        AND NOT EXISTS (
          SELECT 1
          FROM public.assignments a
          JOIN public.class_sessions cs ON cs.id = a.session_id
          WHERE a.instructor_id = i.id
            AND a.session_id <> p_session_id
            AND cs.scheduled_date = v_session.scheduled_date
            AND cs.time_slot IS NOT DISTINCT FROM v_session.time_slot
        )
    ) scored
  ) ranked
  WHERE rn <= 3;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_assignment_candidates(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.generate_assignment_candidates(uuid) TO authenticated;

-- ----------------------------------------------------------------
-- 2. 예정일/시간대 확정 + 매칭 실행 (초기 배정 화면)
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_session_schedule(
  p_session_id uuid,
  p_scheduled_date date,
  p_time_slot text
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY INVOKER
  SET search_path = public
AS $$
DECLARE
  v_status text;
BEGIN
  IF p_scheduled_date IS NULL THEN
    RAISE EXCEPTION '예정일은 필수입니다.' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT session_status INTO v_status FROM public.class_sessions WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION '세션을 찾을 수 없습니다.' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_status <> 'unassigned' THEN
    RAISE EXCEPTION '미배정 세션만 이 화면에서 일정을 확정할 수 있습니다 (현재 상태: %).', v_status
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  UPDATE public.class_sessions
     SET scheduled_date = p_scheduled_date,
         time_slot      = COALESCE(NULLIF(p_time_slot, ''), time_slot)
   WHERE id = p_session_id;

  PERFORM public.generate_assignment_candidates(p_session_id);
END;
$$;

REVOKE ALL ON FUNCTION public.set_session_schedule(uuid, date, text) FROM public;
GRANT EXECUTE ON FUNCTION public.set_session_schedule(uuid, date, text) TO authenticated;

-- ----------------------------------------------------------------
-- 3. 임시배정 (학기초) — 후보 1명 선택
--    assignments(provisional) 생성 + class_sessions.session_status='provisional'
--    confirm_due_date = scheduled_date - interval '1 month'
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assign_provisional(
  p_session_id uuid,
  p_instructor_id uuid,
  p_candidate_id uuid,
  p_assigned_by text
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY INVOKER
  SET search_path = public
AS $$
DECLARE
  v_session public.class_sessions;
  v_assignment_id uuid;
BEGIN
  SELECT * INTO v_session FROM public.class_sessions WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION '세션을 찾을 수 없습니다.' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_session.session_status <> 'unassigned' THEN
    RAISE EXCEPTION '이미 배정된 세션입니다 (현재 상태: %).', v_session.session_status
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF v_session.scheduled_date IS NULL THEN
    RAISE EXCEPTION '예정일이 확정되지 않았습니다.' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- 반드시 이 세션의 추천 후보 3명 중 하나여야 함
  IF NOT EXISTS (
    SELECT 1 FROM public.assignment_candidates
    WHERE id = p_candidate_id
      AND session_id = p_session_id
      AND instructor_id = p_instructor_id
  ) THEN
    RAISE EXCEPTION '유효하지 않은 후보 선택입니다.' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  INSERT INTO public.assignments (
    session_id, instructor_id, assignment_type, selected_from_candidate_id,
    assigned_by, provisional_at, confirm_due_date
  ) VALUES (
    p_session_id, p_instructor_id, 'provisional', p_candidate_id,
    COALESCE(NULLIF(p_assigned_by, ''), '담당자'), now(),
    (v_session.scheduled_date - INTERVAL '1 month')::date
  )
  RETURNING id INTO v_assignment_id;

  UPDATE public.class_sessions
     SET session_status = 'provisional'
   WHERE id = p_session_id;

  RETURN v_assignment_id;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_provisional(uuid, uuid, uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.assign_provisional(uuid, uuid, uuid, text) TO authenticated;

-- ----------------------------------------------------------------
-- 4. 최종확정 대기 목록 — provisional 이고 confirm_due_date <= 오늘
--    (PostgREST 에서 CURRENT_DATE 비교가 어려워 함수로 제공)
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assignments_pending_final_confirm()
  RETURNS SETOF public.assignments
  LANGUAGE sql
  SECURITY INVOKER
  STABLE
  SET search_path = public
AS $$
  SELECT *
  FROM public.assignments
  WHERE assignment_type = 'provisional'
    AND confirm_due_date IS NOT NULL
    AND confirm_due_date <= CURRENT_DATE
  ORDER BY confirm_due_date;
$$;

REVOKE ALL ON FUNCTION public.assignments_pending_final_confirm() FROM public;
GRANT EXECUTE ON FUNCTION public.assignments_pending_final_confirm() TO authenticated;

-- ----------------------------------------------------------------
-- 5. 최종확정 (강의 1개월 전) — 유지 또는 강사 변경
--    유지:  assignment_type='confirmed', confirmed_at=now()
--    변경:  instructor_id 갱신 + is_changed_at_final=true
--           assignment_history(change_context='final_confirm') 기록
--    공통:  class_sessions.session_status='confirmed'
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.confirm_assignment(
  p_assignment_id uuid,
  p_instructor_id uuid,
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
  v_session public.class_sessions;
BEGIN
  SELECT * INTO v_assignment FROM public.assignments WHERE id = p_assignment_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION '배정을 찾을 수 없습니다.' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_assignment.assignment_type <> 'provisional' THEN
    RAISE EXCEPTION '임시배정 상태가 아닙니다 (현재 상태: %).', v_assignment.assignment_type
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT * INTO v_session FROM public.class_sessions WHERE id = v_assignment.session_id;

  IF p_instructor_id = v_assignment.instructor_id THEN
    -- 유지
    UPDATE public.assignments
       SET assignment_type = 'confirmed',
           confirmed_at    = now(),
           updated_at      = now()
     WHERE id = p_assignment_id;
  ELSE
    -- 변경 — 하드필터(같은 시간대 중복) 재확인
    IF EXISTS (
      SELECT 1
      FROM public.assignments a
      JOIN public.class_sessions cs ON cs.id = a.session_id
      WHERE a.instructor_id = p_instructor_id
        AND a.session_id <> v_assignment.session_id
        AND cs.scheduled_date = v_session.scheduled_date
        AND cs.time_slot IS NOT DISTINCT FROM v_session.time_slot
    ) THEN
      RAISE EXCEPTION '선택한 강사가 같은 시간대에 이미 다른 세션에 배정되어 있습니다.'
        USING ERRCODE = 'invalid_parameter_value';
    END IF;

    INSERT INTO public.assignment_history (
      assignment_id, from_status, to_status,
      from_instructor_id, to_instructor_id,
      change_context, changed_by, reason
    ) VALUES (
      p_assignment_id, 'provisional', 'confirmed',
      v_assignment.instructor_id, p_instructor_id,
      'final_confirm', COALESCE(NULLIF(p_changed_by, ''), '담당자'), p_reason
    );

    UPDATE public.assignments
       SET instructor_id       = p_instructor_id,
           assignment_type     = 'confirmed',
           confirmed_at        = now(),
           is_changed_at_final = true,
           updated_at          = now()
     WHERE id = p_assignment_id;
  END IF;

  UPDATE public.class_sessions
     SET session_status = 'confirmed'
   WHERE id = v_assignment.session_id;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_assignment(uuid, uuid, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.confirm_assignment(uuid, uuid, text, text) TO authenticated;
