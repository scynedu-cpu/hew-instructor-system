-- ================================================================
-- 작업지시서 #004 완료기준 검증 — 매칭 함수 / 배정 로직
-- ================================================================
-- 실행:  npx supabase db query --linked -f supabase/tests/matching_verification.sql
-- 성격:  임시 검증. 테스트 데이터를 스스로 만들고 마지막에 정리한다.
--        결과표(_match_verify_results)만 남으며, 확인 후
--        `DROP TABLE public._match_verify_results;` 로 지우면 된다.
--
-- 검증 항목 (작업지시서 #004 "완료 기준"):
--   #1 예정일 확정 시 후보 3명이 정확히 계산·저장
--   #2 같은 시간대 이미 배정된 강사는 하드필터로 제외
--   #3 match_score = 전문분야 80% + 평점 20% 공식대로
--   #4 임시배정 시 assignments(provisional) + confirm_due_date = 예정일 - 1개월
--   #5 confirm_due_date 지난 provisional 이 최종확정 대기 목록에 노출
--   #6 최종확정 유지/변경 모두 동작
--   #7 변경 시 assignment_history(change_context='final_confirm') + is_changed_at_final
--   #8 최종확정 후 class_sessions.session_status='confirmed'
-- ================================================================

DROP TABLE IF EXISTS public._match_verify_results;
CREATE TABLE public._match_verify_results (
  step text, ok boolean, got text, want text
);

DO $$
DECLARE
  v_school uuid;
  v_program uuid;
  v_i1 uuid; v_i2 uuid; v_i3 uuid; v_i4 uuid; v_i5 uuid;
  v_sess_a uuid; v_sess_b uuid;
  v_cand_id uuid;
  v_assignment_a uuid;
  v_hist_count int;
  v_rec record;
BEGIN
  -- ---------- seed ----------
  INSERT INTO schools(name, level) VALUES ('MATCHTEST_초', '초등학교') RETURNING id INTO v_school;
  INSERT INTO programs(name, category) VALUES ('MATCHTEST_프로그램', '특강형') RETURNING id INTO v_program;

  INSERT INTO instructors(name, status, rating_avg) VALUES ('MATCHTEST_강사1','active',5.00) RETURNING id INTO v_i1;
  INSERT INTO instructors(name, status, rating_avg) VALUES ('MATCHTEST_강사2','active',4.00) RETURNING id INTO v_i2;
  INSERT INTO instructors(name, status, rating_avg) VALUES ('MATCHTEST_강사3','active',3.00) RETURNING id INTO v_i3;
  INSERT INTO instructors(name, status, rating_avg) VALUES ('MATCHTEST_강사4','active',5.00) RETURNING id INTO v_i4;
  INSERT INTO instructors(name, status, rating_avg) VALUES ('MATCHTEST_강사5','inactive',5.00) RETURNING id INTO v_i5;

  -- required_specialty 로 테스트 전용 문자열을 써서 실제 seed 강사(김민수 등)와 섞이지 않게 한다.
  INSERT INTO instructor_specialties(instructor_id, specialty) VALUES
    (v_i1,'MATCHTEST_전문분야'), (v_i2,'MATCHTEST_전문분야'), (v_i3,'MATCHTEST_전문분야'),
    (v_i4,'MATCHTEST_기타'), (v_i5,'MATCHTEST_전문분야');

  -- 같은 날짜 + 같은 시간대 세션 2건
  INSERT INTO class_sessions(school_id, program_id, academic_year, scheduled_date, time_slot, required_specialty, session_status)
    VALUES (v_school, v_program, 2026, date '2026-05-01', '10:00~12:00', 'MATCHTEST_전문분야', 'unassigned') RETURNING id INTO v_sess_a;
  INSERT INTO class_sessions(school_id, program_id, academic_year, scheduled_date, time_slot, required_specialty, session_status)
    VALUES (v_school, v_program, 2026, date '2026-05-01', '10:00~12:00', 'MATCHTEST_전문분야', 'unassigned') RETURNING id INTO v_sess_b;

  -- ================================================================
  -- #1 후보 3명 정확히 계산
  -- ================================================================
  PERFORM public.generate_assignment_candidates(v_sess_a);

  INSERT INTO public._match_verify_results
  SELECT '#1 세션A 후보 정확히 3건', count(*) = 3, count(*)||'건', '3건'
  FROM assignment_candidates WHERE session_id = v_sess_a;

  INSERT INTO public._match_verify_results
  SELECT '#1 rank 1~3 부여', array_agg(rank ORDER BY rank)::text = '{1,2,3}', array_agg(rank ORDER BY rank)::text, '{1,2,3}'
  FROM assignment_candidates WHERE session_id = v_sess_a;

  INSERT INTO public._match_verify_results
  SELECT '#1 점수 내림차순 정렬(1위=강사1)', instructor_id = v_i1, '강사1='||(instructor_id = v_i1)::text, 'true'
  FROM assignment_candidates WHERE session_id = v_sess_a AND rank = 1;

  -- ================================================================
  -- #3 match_score 공식 (전문분야 80% + 평점 20%)
  --   강사1: 100*0.8 + (5.0/5*100)*0.2 = 80 + 20 = 100.00
  --   강사2: 100*0.8 + (4.0/5*100)*0.2 = 80 + 16 =  96.00
  --   강사3: 100*0.8 + (3.0/5*100)*0.2 = 80 + 12 =  92.00
  -- ================================================================
  INSERT INTO public._match_verify_results
  SELECT '#3 강사1 점수 = 100.00', match_score = 100.00, match_score::text, '100.00'
  FROM assignment_candidates WHERE session_id = v_sess_a AND instructor_id = v_i1;

  INSERT INTO public._match_verify_results
  SELECT '#3 강사2 점수 = 96.00', match_score = 96.00, match_score::text, '96.00'
  FROM assignment_candidates WHERE session_id = v_sess_a AND instructor_id = v_i2;

  INSERT INTO public._match_verify_results
  SELECT '#3 강사3 점수 = 92.00', match_score = 92.00, match_score::text, '92.00'
  FROM assignment_candidates WHERE session_id = v_sess_a AND instructor_id = v_i3;

  -- 전문분야 불일치(강사4, 점수 20) 는 상위 3명 밖 → 후보에 없음
  INSERT INTO public._match_verify_results
  SELECT '#3 전문분야 불일치 강사4 후보 제외', NOT EXISTS (
    SELECT 1 FROM assignment_candidates WHERE session_id = v_sess_a AND instructor_id = v_i4
  ), 'present='||EXISTS(SELECT 1 FROM assignment_candidates WHERE session_id = v_sess_a AND instructor_id = v_i4)::text, 'false';

  -- 비활성 강사5 는 점수와 무관하게 제외
  INSERT INTO public._match_verify_results
  SELECT '#2 비활성 강사5 후보 제외', NOT EXISTS (
    SELECT 1 FROM assignment_candidates WHERE session_id = v_sess_a AND instructor_id = v_i5
  ), 'present='||EXISTS(SELECT 1 FROM assignment_candidates WHERE session_id = v_sess_a AND instructor_id = v_i5)::text, 'false';

  -- ================================================================
  -- #2 하드필터 — 강사1 을 같은 날짜/시간대 세션B 에 배정 후 세션A 재계산
  -- ================================================================
  INSERT INTO assignments(session_id, instructor_id, assignment_type, assigned_by, provisional_at, confirm_due_date)
    VALUES (v_sess_b, v_i1, 'provisional', 'MATCHTEST', now(), date '2026-04-01');
  UPDATE class_sessions SET session_status = 'provisional' WHERE id = v_sess_b;

  PERFORM public.generate_assignment_candidates(v_sess_a);

  INSERT INTO public._match_verify_results
  SELECT '#2 같은 시간대 배정된 강사1 제외', NOT EXISTS (
    SELECT 1 FROM assignment_candidates WHERE session_id = v_sess_a AND instructor_id = v_i1
  ), 'present='||EXISTS(SELECT 1 FROM assignment_candidates WHERE session_id = v_sess_a AND instructor_id = v_i1)::text, 'false';

  INSERT INTO public._match_verify_results
  SELECT '#2 재계산 후 1위 = 강사2', instructor_id = v_i2, '강사2='||(instructor_id = v_i2)::text, 'true'
  FROM assignment_candidates WHERE session_id = v_sess_a AND rank = 1;

  INSERT INTO public._match_verify_results
  SELECT '#2 재계산 후 후보 3건(강사2,3,4)', count(*) = 3, count(*)||'건', '3건'
  FROM assignment_candidates WHERE session_id = v_sess_a;

  -- ================================================================
  -- #4 임시배정 — assign_provisional
  -- ================================================================
  SELECT id INTO v_cand_id FROM assignment_candidates WHERE session_id = v_sess_a AND rank = 1;

  v_assignment_a := public.assign_provisional(v_sess_a, v_i2, v_cand_id, 'MATCHTEST_담당자');
  SELECT * INTO v_rec FROM assignments WHERE id = v_assignment_a;

  INSERT INTO public._match_verify_results VALUES
    ('#4 assignments provisional 생성',
     v_rec.assignment_type = 'provisional' AND v_rec.selected_from_candidate_id = v_cand_id AND v_rec.instructor_id = v_i2,
     v_rec.assignment_type, 'provisional'),
    ('#4 confirm_due_date = 예정일 - 1개월',
     v_rec.confirm_due_date = date '2026-04-01', v_rec.confirm_due_date::text, '2026-04-01');

  INSERT INTO public._match_verify_results
  SELECT '#4 세션 상태 provisional', session_status = 'provisional', session_status, 'provisional'
  FROM class_sessions WHERE id = v_sess_a;

  -- ================================================================
  -- #5 최종확정 대기 목록 (confirm_due_date 2026-04-01 <= 오늘)
  -- ================================================================
  INSERT INTO public._match_verify_results
  SELECT '#5 최종확정 대기 목록에 노출', EXISTS (
    SELECT 1 FROM public.assignments_pending_final_confirm() WHERE id = v_assignment_a
  ), 'present', 'present';

  -- ================================================================
  -- #6 / #7 / #8 최종확정 — 강사 변경 (강사2 → 강사3)
  -- ================================================================
  PERFORM public.generate_assignment_candidates(v_sess_a);  -- 재계산 (상세 진입 시 동작)
  SELECT count(*) INTO v_hist_count FROM assignment_history WHERE assignment_id = v_assignment_a;

  PERFORM public.confirm_assignment(v_assignment_a, v_i3, 'MATCHTEST_담당자', '테스트 변경 사유');

  SELECT * INTO v_rec FROM assignments WHERE id = v_assignment_a;

  INSERT INTO public._match_verify_results VALUES
    ('#6 변경 최종확정 → instructor_id 갱신', v_rec.instructor_id = v_i3, (v_rec.instructor_id = v_i3)::text, 'true'),
    ('#6 assignment_type = confirmed', v_rec.assignment_type = 'confirmed', v_rec.assignment_type, 'confirmed'),
    ('#7 is_changed_at_final = true', v_rec.is_changed_at_final, v_rec.is_changed_at_final::text, 'true');

  INSERT INTO public._match_verify_results
  SELECT '#7 assignment_history change_context=final_confirm 기록',
         count(*) = v_hist_count + 1
         AND bool_or(change_context = 'final_confirm' AND from_instructor_id = v_i2 AND to_instructor_id = v_i3),
         count(*)||'건', (v_hist_count + 1)||'건(final_confirm)'
  FROM assignment_history WHERE assignment_id = v_assignment_a;

  INSERT INTO public._match_verify_results
  SELECT '#8 세션 상태 confirmed', session_status = 'confirmed', session_status, 'confirmed'
  FROM class_sessions WHERE id = v_sess_a;

  -- ================================================================
  -- #6 최종확정 — 유지 케이스 (세션B: 강사1 유지)
  -- ================================================================
  DECLARE v_assignment_b uuid;
  BEGIN
    SELECT id INTO v_assignment_b FROM assignments WHERE session_id = v_sess_b;
    PERFORM public.confirm_assignment(v_assignment_b, v_i1, 'MATCHTEST_담당자', NULL);
    SELECT * INTO v_rec FROM assignments WHERE id = v_assignment_b;
    INSERT INTO public._match_verify_results VALUES
      ('#6 유지 최종확정 → confirmed, 강사 동일', v_rec.assignment_type = 'confirmed' AND v_rec.instructor_id = v_i1 AND NOT v_rec.is_changed_at_final,
       v_rec.assignment_type||' / changed='||v_rec.is_changed_at_final::text, 'confirmed / changed=false');
    INSERT INTO public._match_verify_results
    SELECT '#6 유지 시 assignment_history 미기록', count(*) = 0, count(*)||'건', '0건'
    FROM assignment_history WHERE assignment_id = v_assignment_b;
  END;

  -- ---------- cleanup ----------
  DELETE FROM assignment_history WHERE assignment_id IN (SELECT id FROM assignments WHERE session_id IN (v_sess_a, v_sess_b));
  DELETE FROM assignments WHERE session_id IN (v_sess_a, v_sess_b);
  DELETE FROM assignment_candidates WHERE session_id IN (v_sess_a, v_sess_b);
  DELETE FROM class_sessions WHERE id IN (v_sess_a, v_sess_b);
  DELETE FROM instructor_specialties WHERE instructor_id IN (v_i1, v_i2, v_i3, v_i4, v_i5);
  DELETE FROM instructors WHERE id IN (v_i1, v_i2, v_i3, v_i4, v_i5);
  DELETE FROM programs WHERE id = v_program;
  DELETE FROM schools WHERE id = v_school;
END $$;

SELECT
  CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS "결과",
  step AS "검증 항목",
  got  AS "실제",
  want AS "기대"
FROM public._match_verify_results
ORDER BY ok, step;
