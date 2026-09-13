-- ================================================================
-- 작업지시서 #017 — 담당자 강사평판 수동조정
-- ================================================================
-- #016 으로 자동 계산되는 instructors.rating_avg(설문 기반) 를 그대로
-- 두고, 담당자가 필요할 때 조정점수를 얹어 "설문 70% + 조정 30%" 로 섞은
-- effective_rating 을 매칭(#004)에 사용한다. 조정을 끄면 effective_rating
-- 은 다시 rating_avg 와 같아진다(공식 자체가 계산컬럼이라 별도 로직 없음).
-- ================================================================

-- ------------------------------------------------------------
-- 1. instructors — 담당자 조정 상태 + effective_rating 계산컬럼
-- ------------------------------------------------------------
ALTER TABLE instructors
  ADD COLUMN manager_adjustment_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN manager_adjustment_score NUMERIC(3,2)
    CHECK (manager_adjustment_score IS NULL OR manager_adjustment_score BETWEEN 1.0 AND 5.0),
  ADD COLUMN manager_adjustment_reason TEXT,
  ADD COLUMN manager_adjustment_by TEXT,
  ADD COLUMN manager_adjustment_at TIMESTAMPTZ;

ALTER TABLE instructors
  ADD COLUMN effective_rating NUMERIC(4,2) GENERATED ALWAYS AS (
    CASE
      WHEN manager_adjustment_enabled AND manager_adjustment_score IS NOT NULL
        THEN round(rating_avg * 0.7 + manager_adjustment_score * 0.3, 2)
      ELSE rating_avg
    END
  ) STORED;

-- ------------------------------------------------------------
-- 2. 조정 이력 — 저장할 때마다 변경 전/후 값을 기록(감사 이력)
-- ------------------------------------------------------------
CREATE TABLE instructor_rating_adjustment_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instructor_id UUID NOT NULL REFERENCES instructors(id) ON DELETE CASCADE,
  enabled_before BOOLEAN NOT NULL,
  enabled_after BOOLEAN NOT NULL,
  score_before NUMERIC(3,2),
  score_after NUMERIC(3,2),
  reason TEXT,
  changed_by TEXT,
  changed_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_instructor_rating_adjustment_history_instructor
  ON instructor_rating_adjustment_history(instructor_id);

-- staff 전용 — 담당자가 조정하는 화면이라 강사 본인 조회 권한은 부여하지 않음
CREATE POLICY "staff_all_rating_adjustment_history" ON instructor_rating_adjustment_history
  FOR ALL USING (public.is_staff()) WITH CHECK (public.is_staff());

-- ------------------------------------------------------------
-- 3. 매칭 하드필터/점수 계산 — rating_avg 대신 effective_rating 사용
--    (#004-1 이후 초기 임시배정·최종확정 재계산 양쪽이 공용으로 쓰는
--    get_matching_candidate_pool() 하나만 고치면 양쪽 다 적용됨).
--    반환 컬럼명 자체를 rating_avg → effective_rating 으로 바꿔 값의
--    의미를 명확히 한다(반환 타입이 바뀌므로 DROP 후 재생성 필요).
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_matching_candidate_pool(uuid);

CREATE FUNCTION public.get_matching_candidate_pool(p_session_id uuid)
  RETURNS TABLE(instructor_id uuid, name text, effective_rating numeric, specialties text[])
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
    i.effective_rating,
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
  GROUP BY i.id, i.name, i.effective_rating;
END;
$$;

REVOKE ALL ON FUNCTION public.get_matching_candidate_pool(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_matching_candidate_pool(uuid) TO authenticated;
