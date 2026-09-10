-- ================================================================
-- 작업지시서 #009 완료기준 검증 — 프로그램 2단계 분류 / 다중 프로그램 신청
-- ================================================================
-- 실행:  npx supabase db query --linked -f supabase/tests/program_request_verification.sql
-- 자체 seed·정리. 결과표(_pr_verify)만 남으며 확인 후 DROP.
-- ================================================================

DROP TABLE IF EXISTS public._pr_verify;
CREATE TABLE public._pr_verify (step text, ok boolean, got text, want text);

DO $$
DECLARE
  v_school uuid;
  v_p_single uuid;   -- 세부 없는 대분류
  v_p_sub uuid;      -- 세부 있는
  v_req uuid;
  v_kw1 text; v_kw2 text;
  v_created int;
  v_cnt int;
  r record;
BEGIN
  INSERT INTO schools(name, level) VALUES ('PRTEST_중', '중학교') RETURNING id INTO v_school;

  -- ---------- #1/#2/#3 프로그램 2단계 분류 ----------
  INSERT INTO programs(name, category, sub_program)
    VALUES ('PRTEST_직업인특강', 'PRTEST_직업인특강', NULL) RETURNING id INTO v_p_single;
  INSERT INTO programs(name, category, sub_program)
    VALUES ('PRTEST_현장 · 로봇공학자', 'PRTEST_현장직업체험', '로봇공학자') RETURNING id INTO v_p_sub;

  SELECT matching_keyword INTO v_kw1 FROM programs WHERE id = v_p_single;
  SELECT matching_keyword INTO v_kw2 FROM programs WHERE id = v_p_sub;

  INSERT INTO public._pr_verify VALUES
    ('#2 세부없는 대분류 → matching_keyword = 대분류명', v_kw1 = 'PRTEST_직업인특강', v_kw1, 'PRTEST_직업인특강'),
    ('#3 세부있는 프로그램 → matching_keyword = 세부항목명', v_kw2 = '로봇공학자', v_kw2, '로봇공학자');

  -- ---------- #4 다중 프로그램 신청 ----------
  INSERT INTO session_requests(school_id, academic_year, submitted_by, teacher_name, request_status)
    VALUES (v_school, 2026, 'PRTEST', 'PRTEST_교사', 'submitted') RETURNING id INTO v_req;

  INSERT INTO session_request_items(request_id, program_id, requested_dates, dates_tbd, preferred_time_slot, expected_student_count)
    VALUES
    (v_req, v_p_single, NULL, true, '3,4교시', '5학급'),
    (v_req, v_p_sub, ARRAY[date '2026-11-05', date '2026-11-12']::date[], false, '10:00~12:00', '90명');

  SELECT count(*) INTO v_cnt FROM session_request_items WHERE request_id = v_req;
  INSERT INTO public._pr_verify VALUES
    ('#4 신청서 1건에 명세 2건', v_cnt = 2, v_cnt||'건', '2건');

  -- ---------- #5 승인 → 명세 수만큼 class_sessions ----------
  v_created := public.approve_session_request(v_req, 'PRTEST_담당자');
  INSERT INTO public._pr_verify VALUES
    ('#5 승인 → class_sessions 2건 생성', v_created = 2, v_created||'건', '2건');

  SELECT count(*) INTO v_cnt FROM class_sessions WHERE request_id = v_req;
  INSERT INTO public._pr_verify VALUES
    ('#5 class_sessions 실제 2건', v_cnt = 2, v_cnt||'건', '2건');

  -- required_specialty ← matching_keyword
  SELECT required_specialty INTO v_kw1
  FROM class_sessions WHERE request_id = v_req AND program_id = v_p_single;
  SELECT required_specialty INTO v_kw2
  FROM class_sessions WHERE request_id = v_req AND program_id = v_p_sub;
  INSERT INTO public._pr_verify VALUES
    ('#5 세부없는 프로그램 세션 required_specialty = 대분류', v_kw1 = 'PRTEST_직업인특강', v_kw1, 'PRTEST_직업인특강'),
    ('#5 세부있는 프로그램 세션 required_specialty = 세부항목', v_kw2 = '로봇공학자', v_kw2, '로봇공학자');

  -- dates_tbd 세션은 예정일 NULL, 아니면 첫 희망일
  SELECT scheduled_date::text INTO v_kw1
  FROM class_sessions WHERE request_id = v_req AND program_id = v_p_single;
  SELECT scheduled_date::text INTO v_kw2
  FROM class_sessions WHERE request_id = v_req AND program_id = v_p_sub;
  INSERT INTO public._pr_verify VALUES
    ('#5 일자미정 명세 → 세션 예정일 NULL', v_kw1 IS NULL, COALESCE(v_kw1,'NULL'), 'NULL'),
    ('#5 일자있는 명세 → 세션 예정일 = 첫 희망일', v_kw2 = '2026-11-05', COALESCE(v_kw2,'NULL'), '2026-11-05');

  -- ---------- 정리 ----------
  DELETE FROM class_sessions WHERE request_id = v_req;
  DELETE FROM session_requests WHERE id = v_req;   -- items CASCADE
  DELETE FROM programs WHERE id IN (v_p_single, v_p_sub);
  DELETE FROM schools WHERE id = v_school;
END $$;

SELECT CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS "결과", step AS "검증 항목",
       got AS "실제", want AS "기대"
FROM public._pr_verify ORDER BY ok, step;
