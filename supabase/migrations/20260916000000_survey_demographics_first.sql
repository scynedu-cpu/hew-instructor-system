-- ================================================================
-- 설문 문항 순서 조정 — 신분/성별/학년을 맨 앞으로 이동
-- ================================================================
-- #013-1(20260913010000)에서 새 공통 8문항으로 대체되며 display_order 가
-- 901~903 으로 밀려났던 신분/성별/학년(현재 is_active=true 로 이미 다시
-- 켜져 있으나 순서만 맨 뒤인 상태)을 공통 문항 맨 앞(1~3)으로 재배치한다.
-- 목표 순서: 신분/성별/학년 → 공통문항 → 프로그램 특성별(그룹) 문항.
-- 그룹 문항보다 앞에 오는 건 이미 scope 정렬(common < group, 20260913010000
-- 의 getSuggestedSurveyQuestions 참고)로 보장되므로, 여기서는 common scope
-- 안에서의 순서만 조정하면 된다.
--
-- 재실행해도 안전하도록 '신분'이 아직 맨 앞(display_order=1)이 아닐 때만
-- 적용한다.
-- ================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM survey_questions WHERE question_text = '신분' AND display_order <> 1
  ) THEN
    -- 기존 공통 문항(현재 1~8)을 뒤로 밀어 신분/성별/학년(1~3) 자리를 만든다.
    UPDATE survey_questions
       SET display_order = display_order + 3
     WHERE scope = 'common' AND display_order BETWEEN 1 AND 8;

    UPDATE survey_questions
       SET is_active = true,
           display_order = CASE question_text
             WHEN '신분' THEN 1
             WHEN '성별' THEN 2
             WHEN '학년' THEN 3
           END
     WHERE question_text IN ('신분', '성별', '학년');
  END IF;
END $$;
