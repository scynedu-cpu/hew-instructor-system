-- ================================================================
-- 작업지시서 #015 — 강사 불가기간 등록 및 매칭 제외
-- ================================================================
-- 강사별로 "이 기간엔 강의 불가"를 미리 등록해두고, 매칭 하드필터에서
-- 세션의 scheduled_date 가 그 기간과 겹치면 후보에서 아예 제외한다.
-- 캘린더 드래그 경고에도 동일한 개념으로 반영(instructor_time_conflicts 확장).
-- ================================================================

-- ------------------------------------------------------------
-- 1. 강사 불가기간 — 경력/자격증과 같은 형태의 다건 리스트
-- ------------------------------------------------------------
CREATE TABLE instructor_unavailable_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instructor_id UUID NOT NULL REFERENCES instructors(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  reason TEXT,                -- 사유(선택)
  created_at TIMESTAMPTZ DEFAULT now(),
  CHECK (end_date >= start_date)
);

CREATE INDEX idx_instructor_unavailable_periods_instructor
  ON instructor_unavailable_periods(instructor_id);

-- RLS — instructor_career_history 등과 동일 패턴: staff 전체 + 강사 본인
CREATE POLICY "staff_full_access_unavailable" ON instructor_unavailable_periods
  FOR ALL USING (public.is_staff()) WITH CHECK (public.is_staff());
CREATE POLICY "instructor_own_unavailable" ON instructor_unavailable_periods
  FOR ALL USING (public.is_instructor(instructor_id)) WITH CHECK (public.is_instructor(instructor_id));

-- ------------------------------------------------------------
-- 2. 매칭 하드필터 확장 — get_matching_candidate_pool()
--    기존 "같은 날짜·시간대 중복배정" 조건에 "불가기간과 겹침" 조건을 추가.
--    반환 타입은 그대로라 CREATE OR REPLACE 로 충분(#004-1 이후 로직 그대로,
--    초기 임시배정·최종확정 재계산 양쪽에서 이 함수 하나를 공용으로 쓰므로
--    여기 한 곳만 고치면 양쪽 다 적용됨 — 지시서 2-2).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_matching_candidate_pool(p_session_id uuid)
  RETURNS TABLE(instructor_id uuid, name text, rating_avg numeric, specialties text[])
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

  RETURN QUERY
  SELECT
    i.id,
    i.name,
    i.rating_avg,
    COALESCE(
      array_agg(isp.specialty) FILTER (WHERE isp.specialty IS NOT NULL),
      ARRAY[]::text[]
    ) AS specialties
  FROM public.instructors i
  LEFT JOIN public.instructor_specialties isp ON isp.instructor_id = i.id
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
    AND NOT EXISTS (
      SELECT 1
      FROM public.instructor_unavailable_periods up
      WHERE up.instructor_id = i.id
        AND v_session.scheduled_date BETWEEN up.start_date AND up.end_date
    )
  GROUP BY i.id, i.name, i.rating_avg;
END;
$$;

-- ------------------------------------------------------------
-- 3. 캘린더 드래그 경고 확장 — instructor_time_conflicts()
--    기존엔 "같은 강사의 다른 배정과 겹침"만 반환했는데, 컬럼을 추가해
--    "불가기간과 겹침"도 같은 결과셋에 UNION ALL 로 얹는다(#005 재사용,
--    지시서 2-3). 반환 타입(컬럼 구성)이 바뀌므로 DROP 후 재생성 필요.
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.instructor_time_conflicts(uuid, date, text, uuid);

CREATE FUNCTION public.instructor_time_conflicts(
  p_instructor_id uuid,
  p_date date,
  p_time_slot text,
  p_exclude_session_id uuid
)
  RETURNS TABLE (
    conflict_type text,           -- 'schedule' | 'unavailable'
    session_id uuid,              -- schedule 인 경우만
    school_name text,             -- schedule 인 경우만
    program_name text,            -- schedule 인 경우만
    scheduled_date date,
    time_slot text,               -- schedule 인 경우만
    session_status text,          -- schedule 인 경우만
    unavailable_period_id uuid,   -- unavailable 인 경우만
    unavailable_reason text       -- unavailable 인 경우만
  )
  LANGUAGE sql
  SECURITY INVOKER
  STABLE
  SET search_path = public
AS $$
  SELECT 'schedule'::text, cs.id, sc.name, pr.name, cs.scheduled_date, cs.time_slot,
         cs.session_status, NULL::uuid, NULL::text
  FROM public.assignments a
  JOIN public.class_sessions cs ON cs.id = a.session_id
  JOIN public.schools sc ON sc.id = cs.school_id
  JOIN public.programs pr ON pr.id = cs.program_id
  WHERE a.instructor_id = p_instructor_id
    AND cs.id <> p_exclude_session_id
    AND cs.scheduled_date = p_date
    AND cs.time_slot IS NOT DISTINCT FROM p_time_slot
    AND cs.session_status <> 'cancelled'

  UNION ALL

  SELECT 'unavailable'::text, NULL::uuid, NULL::text, NULL::text, p_date, NULL::text,
         NULL::text, up.id, up.reason
  FROM public.instructor_unavailable_periods up
  WHERE up.instructor_id = p_instructor_id
    AND p_date IS NOT NULL
    AND p_date BETWEEN up.start_date AND up.end_date

  ORDER BY scheduled_date;
$$;

REVOKE ALL ON FUNCTION public.instructor_time_conflicts(uuid, date, text, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.instructor_time_conflicts(uuid, date, text, uuid) TO authenticated;
