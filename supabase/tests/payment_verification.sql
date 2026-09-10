-- ================================================================
-- 작업지시서 #007 완료기준 검증 — 강사료 정산
-- ================================================================
-- 실행:  npx supabase db query --linked -f supabase/tests/payment_verification.sql
-- 자체 seed·정리. 결과표(_pay_verify)만 남으며 확인 후 DROP.
-- ================================================================

DROP TABLE IF EXISTS public._pay_verify;
CREATE TABLE public._pay_verify (step text, ok boolean, got text, want text);

DO $$
DECLARE
  v_school uuid; v_prog uuid;
  v_i1 uuid; v_i2 uuid;
  v_s1 uuid; v_s2 uuid; v_s3 uuid;
  v_a1 uuid; v_a2 uuid; v_a3 uuid;
  v_rate_old_id uuid;
  v_created int;
  v_pay1 payments; v_pay2 payments;
  v_p_i1 uuid;
  v_rec record;
BEGIN
  -- ---------- 단가: 과거값 + 현재값 ----------
  INSERT INTO payment_rate_settings(rate, effective_from, note, created_by)
    VALUES (80000, current_date - 400, 'PAYTEST 이전 단가', 'PAYTEST')
    RETURNING id INTO v_rate_old_id;
  INSERT INTO payment_rate_settings(rate, effective_from, note, created_by)
    VALUES (100000, current_date - 10, 'PAYTEST 현재 단가', 'PAYTEST');

  INSERT INTO public._pay_verify
  SELECT '#1 현재 적용 단가 = 100000', public.current_payment_rate() = 100000,
         public.current_payment_rate()::text, '100000';
  INSERT INTO public._pay_verify
  SELECT '#1 단가 변경 이력 보존(2건 이상)', count(*) >= 2, count(*)||'건', '>=2건'
  FROM payment_rate_settings WHERE created_by = 'PAYTEST';

  -- ---------- seed: 학교/프로그램/강사/세션/배정 ----------
  INSERT INTO schools(name, level) VALUES ('PAYTEST_초', '초등학교') RETURNING id INTO v_school;
  INSERT INTO programs(name) VALUES ('PAYTEST_프로그램') RETURNING id INTO v_prog;
  INSERT INTO instructors(name, status) VALUES ('PAYTEST_강사1','active') RETURNING id INTO v_i1;
  INSERT INTO instructors(name, status) VALUES ('PAYTEST_강사2','active') RETURNING id INTO v_i2;

  INSERT INTO class_sessions(school_id, program_id, academic_year, scheduled_date, session_status)
    VALUES (v_school, v_prog, 2026, date '2026-06-05', 'completed') RETURNING id INTO v_s1;
  INSERT INTO class_sessions(school_id, program_id, academic_year, scheduled_date, session_status)
    VALUES (v_school, v_prog, 2026, date '2026-06-18', 'completed') RETURNING id INTO v_s2;
  INSERT INTO class_sessions(school_id, program_id, academic_year, scheduled_date, session_status)
    VALUES (v_school, v_prog, 2026, date '2026-07-03', 'completed') RETURNING id INTO v_s3;

  INSERT INTO assignments(session_id, instructor_id, assignment_type, assigned_by)
    VALUES (v_s1, v_i1, 'confirmed', 'PAYTEST') RETURNING id INTO v_a1;
  INSERT INTO assignments(session_id, instructor_id, assignment_type, assigned_by)
    VALUES (v_s2, v_i1, 'confirmed', 'PAYTEST') RETURNING id INTO v_a2;
  INSERT INTO assignments(session_id, instructor_id, assignment_type, assigned_by)
    VALUES (v_s3, v_i2, 'confirmed', 'PAYTEST') RETURNING id INTO v_a3;

  -- 완료 강의: 강사1 6월 2건, 강사2 6월 1건, 강사1 7월 1건
  INSERT INTO lecture_confirmations(assignment_id, actual_date, actual_hours)
    VALUES (v_a1, date '2026-06-05', 2), (v_a2, date '2026-06-18', 2), (v_a3, date '2026-06-20', 3);
  INSERT INTO lecture_confirmations(assignment_id, actual_date, actual_hours)
    VALUES (v_a1, date '2026-07-03', 2);

  -- ---------- #2/#3 6월 정산 ----------
  v_created := public.settle_lecture_payments(date '2026-06-01', date '2026-06-30', 'PAYTEST_담당자');
  INSERT INTO public._pay_verify VALUES ('#2 6월 정산 → payments 2명분 생성', v_created = 2, v_created||'명', '2명');

  SELECT * INTO v_pay1 FROM payments WHERE instructor_id = v_i1 AND period_start = date '2026-06-01';
  SELECT * INTO v_pay2 FROM payments WHERE instructor_id = v_i2 AND period_start = date '2026-06-01';

  INSERT INTO public._pay_verify VALUES
    ('#2 강사1 건수 = 2', v_pay1.quantity = 2, v_pay1.quantity::text, '2'),
    ('#3 강사1 금액 = 단가*2 = 200000', v_pay1.amount = 200000, v_pay1.amount::text, '200000'),
    ('#3 강사1 rate 스냅샷 = 100000', v_pay1.rate = 100000, v_pay1.rate::text, '100000'),
    ('#2 강사2 건수 = 1', v_pay2.quantity = 1, v_pay2.quantity::text, '1'),
    ('#3 강사2 금액 = 100000', v_pay2.amount = 100000, v_pay2.amount::text, '100000');

  -- payment_items 연결 확인
  INSERT INTO public._pay_verify
  SELECT '#6 강사1 정산에 강의 2건 연결', count(*) = 2, count(*)||'건', '2건'
  FROM payment_items WHERE payment_id = v_pay1.id;

  -- ---------- #4 같은 기간 재집계 → 0건 ----------
  v_created := public.settle_lecture_payments(date '2026-06-01', date '2026-06-30', 'PAYTEST_담당자');
  INSERT INTO public._pay_verify VALUES ('#4 6월 재집계 → 새 정산 0건', v_created = 0, v_created||'건', '0건');

  -- ---------- #4 7월 정산 → 강사1 1건만 (6월 건 제외) ----------
  v_created := public.settle_lecture_payments(date '2026-07-01', date '2026-07-31', 'PAYTEST_담당자');
  SELECT * INTO v_rec FROM payments WHERE instructor_id = v_i1 AND period_start = date '2026-07-01';
  INSERT INTO public._pay_verify VALUES
    ('#4 7월 정산 → 1명분', v_created = 1, v_created||'명', '1명'),
    ('#4 7월 강사1 건수 = 1 (6월 건 미포함)', v_rec.quantity = 1, v_rec.quantity::text, '1');

  -- ---------- #5 지급완료 처리 ----------
  PERFORM public.mark_payment_paid(v_pay1.id, 'PAYTEST_담당자');
  SELECT * INTO v_rec FROM payments WHERE id = v_pay1.id;
  INSERT INTO public._pay_verify VALUES
    ('#5 지급완료 → status=paid', v_rec.payment_status = 'paid', v_rec.payment_status, 'paid'),
    ('#5 paid_at 기록됨', v_rec.paid_at IS NOT NULL, (v_rec.paid_at IS NOT NULL)::text, 'true');

  -- 중복 지급 방지
  BEGIN
    PERFORM public.mark_payment_paid(v_pay1.id, 'PAYTEST_담당자');
    INSERT INTO public._pay_verify VALUES ('#5 이미 지급된 건 재처리 거부', false, '허용됨', '거부돼야 함');
  EXCEPTION WHEN others THEN
    INSERT INTO public._pay_verify VALUES ('#5 이미 지급된 건 재처리 거부', true, 'exception', '거부됨');
  END;

  -- ---------- 정리 ----------
  DELETE FROM payment_items pi USING payments p
    WHERE pi.payment_id = p.id AND p.settled_by = 'PAYTEST_담당자';
  DELETE FROM payments WHERE settled_by = 'PAYTEST_담당자';
  DELETE FROM lecture_confirmations WHERE assignment_id IN (v_a1, v_a2, v_a3);
  DELETE FROM assignments WHERE id IN (v_a1, v_a2, v_a3);
  DELETE FROM class_sessions WHERE id IN (v_s1, v_s2, v_s3);
  DELETE FROM instructors WHERE id IN (v_i1, v_i2);
  DELETE FROM programs WHERE id = v_prog;
  DELETE FROM schools WHERE id = v_school;
  DELETE FROM payment_rate_settings WHERE created_by = 'PAYTEST';
END $$;

SELECT CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS "결과", step AS "검증 항목",
       got AS "실제", want AS "기대"
FROM public._pay_verify ORDER BY ok, step;
