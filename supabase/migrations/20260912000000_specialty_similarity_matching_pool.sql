-- ================================================================
-- 작업지시서 #004-1 — 전문분야 매칭, 유사도 기반으로 변경
-- ================================================================
-- 기존 generate_assignment_candidates() 는 전문분야 일치를
-- "문자열 완전 일치 → 100/0" 으로만 판정했는데, 실제로는 강사가
-- "직업상담"으로 등록돼 있고 세션이 "진로상담"을 요구하는 것처럼 의미상
-- 관련 있어도 0점 처리돼 매칭이 거의 안 됐다.
--
-- 유사도 판정은 Claude API 로 세션당 1회 배치 호출해야 하는데, PL/pgSQL
-- 함수는 외부 HTTP 호출을 할 수 없다(별도 pg_net/http 확장 도입은 작업지시서
-- 범위 제외). 그래서 "후보 추리기(하드필터)"는 그대로 SQL 에 남기고,
-- "전문분야 점수 계산 + 최종 저장"만 TypeScript(src/lib/matching.ts)로 옮긴다.
--
-- - get_matching_candidate_pool(): 기존 generate_assignment_candidates() 의
--   하드필터(status='active' + 같은 날짜·시간대 중복배정 제외)를 그대로
--   재사용해서, 후보 강사 목록 + 각자의 전문분야 배열을 반환.
-- - set_session_schedule(): 내부에서 하던
--   PERFORM generate_assignment_candidates(...) 호출을 제거 — 이제
--   TypeScript 쪽에서 일정 확정 후 별도로 후보 계산을 호출한다.
-- - 기존 generate_assignment_candidates() 자체는 삭제하지 않고 그대로 둔다
--   (더 이상 앱에서 호출하지 않는 완전일치 버전 — 참고/롤백용).
-- ================================================================

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
  GROUP BY i.id, i.name, i.rating_avg;
END;
$$;

REVOKE ALL ON FUNCTION public.get_matching_candidate_pool(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_matching_candidate_pool(uuid) TO authenticated;

-- 일정 확정만 하고, 후보 계산은 더 이상 이 함수 안에서 하지 않음
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
END;
$$;
