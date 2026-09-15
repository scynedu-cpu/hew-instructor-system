-- ================================================================
-- 강사료 정산 — "건당 고정단가" → "프로그램별 시간당 단가"로 변경
-- ================================================================
-- 요청: 진로 토크 콘서트는 시간당 100,000원, 그 외 모든 프로그램은
-- 시간당 50,000원. 향후 다른 프로그램도 개별 단가를 등록할 수 있도록
-- payment_rate_settings 에 program_id 를 추가한다(NULL = 그 외 전체에
-- 적용되는 기본 단가). 실제 시간(lecture_confirmations.actual_hours)은
-- 이미 강의 완료 처리 때마다 담당자가 입력해 저장돼 있던 값이라 새로
-- 만들 필요 없이 그대로 곱해 쓰면 된다.
--
-- 과거 정산(payments/payment_items) 은 "완료 건수 × 단일 단가" 모델의
-- 스냅샷이므로 소급 재계산하지 않고 그대로 둔다(이 파일에서 손대는 컬럼은
-- 전부 nullable 로 추가 — 과거 row 는 새 컬럼이 NULL인 채로 남는다).
-- ================================================================

-- ----------------------------------------------------------------
-- 1. 단가에 프로그램 차원 추가 — NULL 이면 "그 외 프로그램"에 적용되는 기본 단가
-- ----------------------------------------------------------------
ALTER TABLE public.payment_rate_settings
  ADD COLUMN program_id UUID REFERENCES public.programs(id);

COMMENT ON COLUMN public.payment_rate_settings.rate IS '시간당 강사료(원/시간)';
COMMENT ON COLUMN public.payment_rate_settings.program_id IS 'NULL = 그 외 모든 프로그램에 적용되는 기본 단가. 특정 프로그램 지정 시 그 프로그램에서만 이 단가가 우선 적용된다.';

-- ----------------------------------------------------------------
-- 2. payments/payment_items — 정산 1건에 여러 프로그램(=여러 단가)이
--    섞일 수 있으므로 payments.rate 는 더 이상 단일값일 수 없다(nullable로
--    전환, 과거 단일단가 스냅샷은 그대로 유지). 실제 단가/시간/금액은
--    강의(payment_items) 단위로 기록한다.
-- ----------------------------------------------------------------
ALTER TABLE public.payments ALTER COLUMN rate DROP NOT NULL;
COMMENT ON COLUMN public.payments.rate IS '(구) 건당 단일단가 스냅샷 — 시간당·프로그램별 단가 도입 이전 정산만 값이 있음. 이후 정산은 NULL(단가가 프로그램마다 다를 수 있어 payment_items 참고).';

ALTER TABLE public.payment_items
  ADD COLUMN hours NUMERIC(4,2),
  ADD COLUMN rate NUMERIC(12,2),
  ADD COLUMN amount NUMERIC(14,2);

COMMENT ON COLUMN public.payment_items.hours IS '해당 강의의 실제 강의시간(lecture_confirmations.actual_hours 스냅샷)';
COMMENT ON COLUMN public.payment_items.rate IS '해당 강의에 적용된 시간당 단가(집계 시점 스냅샷)';
COMMENT ON COLUMN public.payment_items.amount IS 'hours * rate (집계 시점 스냅샷)';

-- ----------------------------------------------------------------
-- 3. 현재 적용 단가 — 프로그램별 우선, 없으면 기본(program_id IS NULL) 단가
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_payment_rate(p_program_id uuid)
  RETURNS NUMERIC
  LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT rate FROM public.payment_rate_settings
      WHERE program_id = p_program_id AND effective_from <= CURRENT_DATE
      ORDER BY effective_from DESC, created_at DESC LIMIT 1),
    (SELECT rate FROM public.payment_rate_settings
      WHERE program_id IS NULL AND effective_from <= CURRENT_DATE
      ORDER BY effective_from DESC, created_at DESC LIMIT 1)
  );
$$;
-- p_program_id 가 NULL로 호출되면 "program_id = NULL" 비교는 항상 false 라
-- 자동으로 기본 단가 분기로 떨어진다 — "기본 단가 조회"와 "특정 프로그램
-- 단가(없으면 기본으로 대체)" 조회를 같은 함수로 처리 가능.

REVOKE ALL ON FUNCTION public.current_payment_rate(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.current_payment_rate(uuid) TO authenticated;

-- 이전 시그니처(인자 없음)는 더 이상 쓰지 않음 — 화면 코드도 함께 수정.
DROP FUNCTION IF EXISTS public.current_payment_rate();

-- ----------------------------------------------------------------
-- 4. 정산 대상 미리보기 — 시간·예상 금액까지 함께 반환
-- ----------------------------------------------------------------
DROP FUNCTION IF EXISTS public.preview_lecture_payments(date, date);

CREATE OR REPLACE FUNCTION public.preview_lecture_payments(
  p_period_start date,
  p_period_end date
)
  RETURNS TABLE (
    instructor_id uuid, instructor_name text,
    quantity bigint, total_hours numeric, estimated_amount numeric
  )
  LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$
  SELECT x.instructor_id, i.name, count(*), sum(x.hours), sum(x.amount)
  FROM (
    SELECT lc.id AS lc_id, a.instructor_id, lc.actual_hours AS hours,
           rt.rate, lc.actual_hours * rt.rate AS amount
    FROM public.lecture_confirmations lc
    JOIN public.assignments a ON a.id = lc.assignment_id
    JOIN public.class_sessions cs ON cs.id = a.session_id
    CROSS JOIN LATERAL (SELECT public.current_payment_rate(cs.program_id) AS rate) rt
    WHERE lc.actual_date IS NOT NULL
      AND lc.actual_date BETWEEN p_period_start AND p_period_end
      AND NOT EXISTS (
        SELECT 1 FROM public.payment_items pi WHERE pi.lecture_confirmation_id = lc.id
      )
  ) x
  JOIN public.instructors i ON i.id = x.instructor_id
  GROUP BY x.instructor_id, i.name
  ORDER BY i.name;
$$;

REVOKE ALL ON FUNCTION public.preview_lecture_payments(date, date) FROM public;
GRANT EXECUTE ON FUNCTION public.preview_lecture_payments(date, date) TO authenticated;

-- ----------------------------------------------------------------
-- 5. 정산 집계 — 강의별로 그 강의 프로그램의 시간당 단가 × 실제 시간을
--    적용해 payment_items 에 개별 기록하고, payments.amount 는 합산값
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
  v_created int := 0;
  v_payment_id uuid;
  r record;
BEGIN
  IF p_period_start IS NULL OR p_period_end IS NULL OR p_period_end < p_period_start THEN
    RAISE EXCEPTION '정산 기간이 올바르지 않습니다.' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  FOR r IN
    SELECT x.instructor_id, count(*)::int AS qty, sum(x.amount) AS total_amount
    FROM (
      SELECT lc.id AS lc_id, a.instructor_id, lc.actual_hours AS hours,
             rt.rate, lc.actual_hours * rt.rate AS amount
      FROM public.lecture_confirmations lc
      JOIN public.assignments a ON a.id = lc.assignment_id
      JOIN public.class_sessions cs ON cs.id = a.session_id
      CROSS JOIN LATERAL (SELECT public.current_payment_rate(cs.program_id) AS rate) rt
      WHERE lc.actual_date IS NOT NULL
        AND lc.actual_date BETWEEN p_period_start AND p_period_end
        AND NOT EXISTS (
          SELECT 1 FROM public.payment_items pi WHERE pi.lecture_confirmation_id = lc.id
        )
    ) x
    GROUP BY x.instructor_id
  LOOP
    IF r.total_amount IS NULL THEN
      RAISE EXCEPTION '적용 가능한 단가가 없습니다. 먼저 기본 단가를 등록하세요.'
        USING ERRCODE = 'invalid_parameter_value';
    END IF;

    INSERT INTO public.payments (
      instructor_id, period_start, period_end, quantity, rate, amount, settled_by
    ) VALUES (
      r.instructor_id, p_period_start, p_period_end, r.qty, NULL, r.total_amount,
      COALESCE(NULLIF(p_settled_by, ''), '담당자')
    )
    RETURNING id INTO v_payment_id;

    INSERT INTO public.payment_items (payment_id, lecture_confirmation_id, hours, rate, amount)
    SELECT v_payment_id, x.lc_id, x.hours, x.rate, x.amount
    FROM (
      SELECT lc.id AS lc_id, a.instructor_id, lc.actual_hours AS hours,
             rt.rate, lc.actual_hours * rt.rate AS amount
      FROM public.lecture_confirmations lc
      JOIN public.assignments a ON a.id = lc.assignment_id
      JOIN public.class_sessions cs ON cs.id = a.session_id
      CROSS JOIN LATERAL (SELECT public.current_payment_rate(cs.program_id) AS rate) rt
      WHERE lc.actual_date IS NOT NULL
        AND lc.actual_date BETWEEN p_period_start AND p_period_end
        AND NOT EXISTS (
          SELECT 1 FROM public.payment_items pi WHERE pi.lecture_confirmation_id = lc.id
        )
    ) x
    WHERE x.instructor_id = r.instructor_id;

    v_created := v_created + 1;
  END LOOP;

  RETURN v_created;
END;
$$;

REVOKE ALL ON FUNCTION public.settle_lecture_payments(date, date, text) FROM public;
GRANT EXECUTE ON FUNCTION public.settle_lecture_payments(date, date, text) TO authenticated;

-- ----------------------------------------------------------------
-- 6. 요청 단가 등록 — 진로토크콘서트 시간당 100,000원, 그 외 기본 50,000원
--    (오늘 날짜부터 적용. 기존 단가 이력은 그대로 보존됨)
-- ----------------------------------------------------------------
INSERT INTO public.payment_rate_settings (rate, effective_from, program_id, note, created_by)
VALUES (
  50000, CURRENT_DATE, NULL,
  '시간당 단가 체계로 전환 — 그 외 모든 프로그램 기본 단가', '시스템'
);

INSERT INTO public.payment_rate_settings (rate, effective_from, program_id, note, created_by)
SELECT 100000, CURRENT_DATE, p.id,
       '진로 토크 콘서트 전용 시간당 단가', '시스템'
FROM public.programs p
WHERE p.category = '진로토크콘서트'
LIMIT 1;
