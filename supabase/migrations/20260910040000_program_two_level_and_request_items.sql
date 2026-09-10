-- ================================================================
-- 작업지시서 #009 — 학교 신청 화면 개선 (실제 양식 반영)
-- ================================================================
-- 1) programs: 2단계 분류(category 대분류 + sub_program 세부) + is_active
--    matching_keyword = 세부 있으면 세부, 없으면 대분류 (자동계산)
-- 2) session_requests(헤더) + session_request_items(명세) — 신청서 1건에
--    프로그램 여러 개, 각 프로그램마다 희망일자/시간/인원/비고
-- 3) 승인 시 명세 1건 = class_sessions 1건
-- ================================================================

-- ------------------------------------------------------------
-- 1. programs 2단계 분류
-- ------------------------------------------------------------
ALTER TABLE public.programs ADD COLUMN IF NOT EXISTS sub_program TEXT;
ALTER TABLE public.programs ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.programs ADD COLUMN IF NOT EXISTS matching_keyword TEXT
  GENERATED ALWAYS AS (COALESCE(NULLIF(btrim(sub_program), ''), category, name)) STORED;

-- 기존 seed 는 category 가 유형("현장체험형") 이었음 → 대분류로 재정의(= name)
UPDATE public.programs
   SET category = name
 WHERE category IS DISTINCT FROM name AND sub_program IS NULL;

COMMENT ON COLUMN public.programs.category IS '대분류 (예: 현장직업체험, 직업인특강)';
COMMENT ON COLUMN public.programs.sub_program IS '세부항목 (예: 로봇공학자). 없으면 대분류가 매칭 키워드';
COMMENT ON COLUMN public.programs.matching_keyword IS '강사 매칭 키워드 = COALESCE(sub_program, category)';

-- ------------------------------------------------------------
-- 2. 신청서 명세
-- ------------------------------------------------------------
ALTER TABLE public.session_requests ADD COLUMN IF NOT EXISTS teacher_name TEXT;
ALTER TABLE public.session_requests ALTER COLUMN program_id DROP NOT NULL;

CREATE TABLE IF NOT EXISTS public.session_request_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES public.session_requests(id) ON DELETE CASCADE,
  program_id UUID NOT NULL REFERENCES public.programs(id),
  requested_dates DATE[],
  dates_tbd BOOLEAN NOT NULL DEFAULT false,   -- "일자 미정"
  preferred_time_slot TEXT,
  expected_student_count TEXT,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.class_sessions
  ADD COLUMN IF NOT EXISTS request_item_id UUID REFERENCES public.session_request_items(id);

-- 기존 신청서 → 명세 1건씩 이관
INSERT INTO public.session_request_items
  (request_id, program_id, requested_dates, preferred_time_slot, expected_student_count)
SELECT sr.id, sr.program_id, sr.requested_dates, sr.preferred_time_slot, sr.expected_student_count
FROM public.session_requests sr
WHERE sr.program_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.session_request_items i WHERE i.request_id = sr.id);

-- ------------------------------------------------------------
-- 3. RLS — session_request_items
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.session_request_school(p_request_id uuid)
  RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT school_id FROM public.session_requests WHERE id = p_request_id;
$$;

ALTER TABLE public.session_request_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_all_session_request_items" ON public.session_request_items;
CREATE POLICY "staff_all_session_request_items" ON public.session_request_items
  FOR ALL USING (public.is_staff()) WITH CHECK (public.is_staff());

DROP POLICY IF EXISTS "school_own_session_request_items" ON public.session_request_items;
CREATE POLICY "school_own_session_request_items" ON public.session_request_items
  FOR ALL
  USING (public.is_school(public.session_request_school(request_id)))
  WITH CHECK (public.is_school(public.session_request_school(request_id)));

-- ------------------------------------------------------------
-- 4. 승인 = 명세마다 class_sessions 1건 생성
--    required_specialty ← programs.matching_keyword
-- ------------------------------------------------------------
-- 반환타입이 uuid → integer 로 바뀌므로 DROP 후 재생성
DROP FUNCTION IF EXISTS public.approve_session_request(uuid, text);

CREATE FUNCTION public.approve_session_request(
  p_request_id uuid,
  p_reviewer text
)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY INVOKER
  SET search_path = public
AS $$
DECLARE
  r public.session_requests;
  it public.session_request_items;
  v_keyword text;
  v_count int := 0;
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
     SET request_status = 'approved', reviewed_by = p_reviewer, reviewed_at = now()
   WHERE id = p_request_id;

  FOR it IN
    SELECT * FROM public.session_request_items WHERE request_id = p_request_id ORDER BY created_at
  LOOP
    SELECT matching_keyword INTO v_keyword FROM public.programs WHERE id = it.program_id;

    INSERT INTO public.class_sessions (
      request_id, request_item_id, school_id, program_id, academic_year,
      scheduled_date, time_slot, student_count,
      required_specialty, required_instructor_count, session_status
    ) VALUES (
      r.id, it.id, r.school_id, it.program_id, r.academic_year,
      CASE WHEN it.dates_tbd THEN NULL ELSE (it.requested_dates)[1] END,
      it.preferred_time_slot, it.expected_student_count,
      v_keyword, 1, 'unassigned'
    );
    v_count := v_count + 1;
  END LOOP;

  IF v_count = 0 THEN
    RAISE EXCEPTION '신청서에 프로그램(명세)이 없습니다.' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_session_request(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.approve_session_request(uuid, text) TO authenticated;
