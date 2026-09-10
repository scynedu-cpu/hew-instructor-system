-- ================================================================
-- 작업지시서 #007 — 강사료 정산
-- ================================================================
-- 강사료 = 조직 전체 단일 고정단가 × 완료된 강의 건수.
-- 기존 payments 테이블(assignment 단위)은 설계가 달라 새 구조로 교체한다.
-- (코드/데이터에서 참조 없음 — DROP 후 재생성)
-- ================================================================

DROP TABLE IF EXISTS public.payments CASCADE;

-- ----------------------------------------------------------------
-- 1. 단가 이력 — 변경 시 새 row 추가, 과거 row 는 그대로 보존
-- ----------------------------------------------------------------
CREATE TABLE public.payment_rate_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rate NUMERIC(12,2) NOT NULL CHECK (rate >= 0),   -- 강의 1건당 강사료
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  note TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ----------------------------------------------------------------
-- 2. 강사별 정산 (한 기간 집계 결과 = 강사당 1 row)
-- ----------------------------------------------------------------
CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instructor_id UUID NOT NULL REFERENCES public.instructors(id),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  quantity INT NOT NULL CHECK (quantity > 0),      -- 집계된 강의 건수
  rate NUMERIC(12,2) NOT NULL,                     -- 집계 시점 단가 스냅샷
  amount NUMERIC(14,2) NOT NULL,                   -- rate * quantity
  payment_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (payment_status IN ('pending','paid')),
  settled_by TEXT,
  settled_at TIMESTAMPTZ DEFAULT now(),
  paid_by TEXT,
  paid_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ----------------------------------------------------------------
-- 3. 정산에 포함된 개별 강의 — lecture_confirmation 당 최대 1건 (중복정산 방지)
-- ----------------------------------------------------------------
CREATE TABLE public.payment_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  lecture_confirmation_id UUID NOT NULL UNIQUE
    REFERENCES public.lecture_confirmations(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ----------------------------------------------------------------
-- RLS — 신규 테이블은 rls_auto_enable 이 RLS 를 켜므로 staff 정책만 부여
-- ----------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['payment_rate_settings','payments','payment_items'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'staff_all_' || t, t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL USING (public.is_staff()) WITH CHECK (public.is_staff())',
      'staff_all_' || t, t);
  END LOOP;
END $$;

-- ----------------------------------------------------------------
-- 4. 현재 적용 중인 단가
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_payment_rate()
  RETURNS NUMERIC
  LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$
  SELECT rate
  FROM public.payment_rate_settings
  WHERE effective_from <= CURRENT_DATE
  ORDER BY effective_from DESC, created_at DESC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.current_payment_rate() FROM public;
GRANT EXECUTE ON FUNCTION public.current_payment_rate() TO authenticated;

-- ----------------------------------------------------------------
-- 5. 정산 대상 미리보기 (아직 어떤 payment_items 에도 없는 완료 강의)
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.preview_lecture_payments(
  p_period_start date,
  p_period_end date
)
  RETURNS TABLE (instructor_id uuid, instructor_name text, quantity bigint)
  LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$
  SELECT a.instructor_id, i.name, count(*)
  FROM public.lecture_confirmations lc
  JOIN public.assignments a ON a.id = lc.assignment_id
  JOIN public.instructors i ON i.id = a.instructor_id
  WHERE lc.actual_date IS NOT NULL
    AND lc.actual_date BETWEEN p_period_start AND p_period_end
    AND NOT EXISTS (
      SELECT 1 FROM public.payment_items pi WHERE pi.lecture_confirmation_id = lc.id
    )
  GROUP BY a.instructor_id, i.name
  ORDER BY i.name;
$$;

REVOKE ALL ON FUNCTION public.preview_lecture_payments(date, date) FROM public;
GRANT EXECUTE ON FUNCTION public.preview_lecture_payments(date, date) TO authenticated;

-- ----------------------------------------------------------------
-- 6. 정산 집계 — 강사별 payments row 생성 + payment_items 연결
--    반환값: 생성된 payments 건수
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.settle_lecture_payments(
  p_period_start date,
  p_period_end date,
  p_settled_by text
)
  RETURNS integer
  LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
DECLARE
  v_rate numeric;
  v_created int := 0;
  v_payment_id uuid;
  r record;
BEGIN
  IF p_period_start IS NULL OR p_period_end IS NULL OR p_period_end < p_period_start THEN
    RAISE EXCEPTION '정산 기간이 올바르지 않습니다.' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  v_rate := public.current_payment_rate();
  IF v_rate IS NULL THEN
    RAISE EXCEPTION '적용 중인 단가가 없습니다. 먼저 단가를 설정하세요.'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  FOR r IN
    SELECT a.instructor_id AS instructor_id,
           count(*)::int   AS qty,
           array_agg(lc.id) AS lc_ids
    FROM public.lecture_confirmations lc
    JOIN public.assignments a ON a.id = lc.assignment_id
    WHERE lc.actual_date IS NOT NULL
      AND lc.actual_date BETWEEN p_period_start AND p_period_end
      AND NOT EXISTS (
        SELECT 1 FROM public.payment_items pi WHERE pi.lecture_confirmation_id = lc.id
      )
    GROUP BY a.instructor_id
  LOOP
    INSERT INTO public.payments (
      instructor_id, period_start, period_end, quantity, rate, amount, settled_by
    ) VALUES (
      r.instructor_id, p_period_start, p_period_end, r.qty, v_rate, v_rate * r.qty,
      COALESCE(NULLIF(p_settled_by, ''), '담당자')
    )
    RETURNING id INTO v_payment_id;

    INSERT INTO public.payment_items (payment_id, lecture_confirmation_id)
    SELECT v_payment_id, unnest(r.lc_ids);

    v_created := v_created + 1;
  END LOOP;

  RETURN v_created;
END;
$$;

REVOKE ALL ON FUNCTION public.settle_lecture_payments(date, date, text) FROM public;
GRANT EXECUTE ON FUNCTION public.settle_lecture_payments(date, date, text) TO authenticated;

-- ----------------------------------------------------------------
-- 7. 지급 처리
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_payment_paid(p_payment_id uuid, p_paid_by text)
  RETURNS void
  LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
DECLARE
  v_status text;
BEGIN
  SELECT payment_status INTO v_status FROM public.payments WHERE id = p_payment_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION '정산 건을 찾을 수 없습니다.' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_status = 'paid' THEN
    RAISE EXCEPTION '이미 지급완료된 건입니다.' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  UPDATE public.payments
     SET payment_status = 'paid',
         paid_at = now(),
         paid_by = COALESCE(NULLIF(p_paid_by, ''), '담당자')
   WHERE id = p_payment_id;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_payment_paid(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.mark_payment_paid(uuid, text) TO authenticated;
