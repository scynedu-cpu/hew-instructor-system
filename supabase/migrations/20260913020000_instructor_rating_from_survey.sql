-- ================================================================
-- 작업지시서 #016 — 만족도설문 기반 강사 평판 반영
-- ================================================================
-- 매칭 공식(#004: 전문분야 80% + 평점 20%)이 쓰는 instructors.rating_avg 를
-- 담당자 수기 입력에서 QR 만족도설문의 강사 평가 문항 응답 자동 집계로
-- 전환한다. survey_answers INSERT 시점에 트리거로 즉시 반영 — 클라이언트
-- 로직에 의존하지 않음(지시서 2-3).
-- ================================================================

-- ------------------------------------------------------------
-- 1. 강사 평가 전용 문항 플래그 — 문구가 바뀌어도 연결이 끊기지 않도록
--    id 가 아니라 이 플래그로 식별한다.
-- ------------------------------------------------------------
ALTER TABLE survey_questions
  ADD COLUMN is_instructor_rating BOOLEAN NOT NULL DEFAULT false;

UPDATE survey_questions
   SET is_instructor_rating = true
 WHERE question_text = '강사(진행자)의 설명과 진행은 적절했다.'
   AND scope = 'common';

-- ------------------------------------------------------------
-- 2. survey_answers — 이 응답이 어느 강사 몫인지 기록
--    (강사 평가 문항 응답에만 채워짐, 그 외엔 NULL)
--    응답 제출 시점의 현재 배정 강사로 "고정"된다 — 이후 그 세션의
--    배정 강사가 바뀌어도 이미 저장된 과거 응답의 귀속은 유지되고,
--    새로 들어오는 응답만 바뀐 시점의 최신 강사에게 귀속된다(지시서 완료기준).
-- ------------------------------------------------------------
ALTER TABLE survey_answers
  ADD COLUMN instructor_id UUID REFERENCES instructors(id);

CREATE INDEX idx_survey_answers_instructor ON survey_answers(instructor_id);

-- ------------------------------------------------------------
-- 3. 트리거 — INSERT 시점에 귀속 강사를 확정하고, 그 강사의 rating_avg 를
--    (기존 응답 평균 + 이번 응답)으로 즉시 재계산한다.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_instructor_rating()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_is_rating boolean;
  v_session_id uuid;
  v_instructor_id uuid;
  v_avg numeric;
BEGIN
  SELECT is_instructor_rating INTO v_is_rating
  FROM survey_questions WHERE id = NEW.question_id;

  IF NOT COALESCE(v_is_rating, false) OR NEW.answer_rating IS NULL THEN
    RETURN NEW;  -- 강사 평가 문항이 아니거나 척도 응답이 없음 — 귀속 대상 아님
  END IF;

  SELECT session_id INTO v_session_id
  FROM survey_responses WHERE id = NEW.response_id;

  -- 세션당 assignments 는 1건(강사 교체는 새 row 가 아니라 instructor_id
  -- UPDATE 로 처리됨 — #005 swap_session_instructor) → 항상 "현재" 강사
  SELECT instructor_id INTO v_instructor_id
  FROM assignments WHERE session_id = v_session_id;

  IF v_instructor_id IS NULL THEN
    RETURN NEW;  -- 배정된 강사가 없는 세션(수기 등록 등) — 귀속 불가
  END IF;

  NEW.instructor_id := v_instructor_id;

  -- 이 강사에게 이미 귀속된 응답 + 지금 들어오는 응답(NEW, 아직 커밋 전이라
  -- UNION ALL 로 합쳐서 계산)의 단순 평균 — 시간가중 없음(지시서 3. 범위 제외)
  SELECT avg(rating) INTO v_avg
  FROM (
    SELECT answer_rating AS rating FROM survey_answers WHERE instructor_id = v_instructor_id
    UNION ALL
    SELECT NEW.answer_rating
  ) t;

  UPDATE instructors SET rating_avg = round(v_avg, 2) WHERE id = v_instructor_id;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_apply_instructor_rating
  BEFORE INSERT ON survey_answers
  FOR EACH ROW
  EXECUTE FUNCTION public.apply_instructor_rating();

-- ------------------------------------------------------------
-- 4. 신규 강사 기본값 3.5(중립값)로 변경 + 기존 데이터 1회성 정리
-- ------------------------------------------------------------
ALTER TABLE instructors ALTER COLUMN rating_avg SET DEFAULT 3.5;

-- 강사평가 응답이 하나도 귀속되지 않은 기존 강사는 3.5로 일괄 보정.
-- (이 시점엔 is_instructor_rating 플래그가 방금 생겼으므로 과거 응답은
--  전부 instructor_id 가 비어있다 — 응답 기반으로 계산된 값이 있는 강사는
--  없으므로 전원 대상. 향후 실제 응답이 쌓이면 트리거가 자동으로 덮어씀)
UPDATE instructors
   SET rating_avg = 3.5
 WHERE id NOT IN (
   SELECT DISTINCT instructor_id FROM survey_answers WHERE instructor_id IS NOT NULL
 );
