-- ================================================================
-- 작업지시서 #013-1 — 설문 문항 그룹화 (공통 + 프로그램 성격별)
-- ================================================================
-- #013 문항 구조를 "공통 문항 + 프로그램 성격별(A~E) 전용 문항"으로
-- 확장한다. QR 생성 시점에 그 세션 프로그램의 그룹을 기준으로 공통+그룹
-- 문항을 자동 조합해 담당자에게 보여주고(전부 체크), 제외만 가능하게
-- 한 뒤 확정하면 survey_links + survey_link_questions 로 그 세션의
-- 문항 구성을 고정한다. 이후 survey_questions/programs.survey_group이
-- 바뀌어도 이미 확정된 세션의 구성은 그대로 유지된다.
-- ================================================================

-- ------------------------------------------------------------
-- 1. 설문 문항 그룹 (A~E 고정 5개)
-- ------------------------------------------------------------
CREATE TABLE survey_question_groups (
  group_code TEXT PRIMARY KEY CHECK (group_code IN ('A','B','C','D','E')),
  label TEXT NOT NULL,
  display_order INT NOT NULL
);

INSERT INTO survey_question_groups (group_code, label, display_order) VALUES
  ('A', '직업체험/현장체험형', 1),
  ('B', '직업인특강/토크콘서트형', 2),
  ('C', 'AI·디지털체험형', 3),
  ('D', '창업·경제교육형', 4),
  ('E', '전환기/성장지원형', 5);

CREATE POLICY "staff_all_survey_question_groups" ON survey_question_groups
  FOR ALL USING (public.is_staff()) WITH CHECK (public.is_staff());
-- 그룹 라벨 자체는 민감정보가 아니고 문항 관리 화면 구성에 필요하므로 공개 조회도 허용
CREATE POLICY "public_read_survey_question_groups" ON survey_question_groups
  FOR SELECT USING (true);

-- ------------------------------------------------------------
-- 2. survey_questions — scope(공통/그룹) + survey_group 컬럼 추가
-- ------------------------------------------------------------
ALTER TABLE survey_questions
  ADD COLUMN scope TEXT NOT NULL DEFAULT 'common' CHECK (scope IN ('common', 'group')),
  ADD COLUMN survey_group TEXT REFERENCES survey_question_groups(group_code);

ALTER TABLE survey_questions
  ADD CONSTRAINT survey_questions_group_consistency CHECK (
    (scope = 'common' AND survey_group IS NULL) OR
    (scope = 'group' AND survey_group IS NOT NULL)
  );

CREATE INDEX idx_survey_questions_scope_group ON survey_questions(scope, survey_group);

-- #013 초기 문항(신분/성별/학년/기존 5점척도 5개/기존 기타의견)은 이번 지시서의
-- 새 공통 8문항으로 대체된다. 이미 답변이 쌓여 있을 수 있어 삭제하지 않고
-- 비활성화만 하고, display_order 를 뒤로 밀어 새 문항과 섞이지 않게 한다.
UPDATE survey_questions
   SET is_active = false,
       display_order = display_order + 900
 WHERE question_text IN (
   '신분', '성별', '학년',
   '이 프로그램이 진로탐색에 도움이 되었습니까?',
   '프로그램 운영방식(시간, 진행 등)은 적절했습니까?',
   '강사의 지도는 충실했습니까?',
   '교육 장소는 안전했습니까?',
   '다음에도 이런 프로그램에 참여할 의향이 있습니까?',
   '기타의견(좋았던 점, 아쉬운 점, 바라는 점 등을 자유롭게 적어주세요)'
 );

-- ------------------------------------------------------------
-- 3. 새 문항 등록 — 공통 8개(평점5+서술3) + 그룹별 5개 x 5그룹 = 33개
--    (지시서 원문 그대로. scope별로 display_order 1부터 별도 채번)
-- ------------------------------------------------------------

-- 공통 평점형 5개
INSERT INTO survey_questions (question_type, question_text, scope, survey_group, display_order) VALUES
  ('rating_5', '오늘 프로그램은 흥미로웠다.', 'common', NULL, 1),
  ('rating_5', '오늘 프로그램 내용은 이해하기 쉬웠다.', 'common', NULL, 2),
  ('rating_5', '오늘 프로그램은 나에게 도움이 되었다.', 'common', NULL, 3),
  ('rating_5', '강사(진행자)의 설명과 진행은 적절했다.', 'common', NULL, 4),
  ('rating_5', '비슷한 프로그램이 있다면 다시 참여하고 싶다.', 'common', NULL, 5);

-- 공통 서술형 3개
INSERT INTO survey_questions (question_type, question_text, scope, survey_group, display_order) VALUES
  ('long_text', '오늘 프로그램에서 가장 기억에 남는 점은 무엇인가요?', 'common', NULL, 6),
  ('long_text', '오늘 프로그램에서 아쉬웠던 점이나 개선하면 좋을 점은 무엇인가요?', 'common', NULL, 7),
  ('long_text', '앞으로 더 듣거나 참여해보고 싶은 주제는 무엇인가요?', 'common', NULL, 8);

-- A형 — 직업체험/현장체험형
INSERT INTO survey_questions (question_type, question_text, scope, survey_group, display_order) VALUES
  ('rating_5', '다양한 직업의 실제 모습을 이해하는 데 도움이 되었다.', 'group', 'A', 1),
  ('rating_5', '직업 현장이나 직무에 대한 궁금증이 해소되었다.', 'group', 'A', 2),
  ('rating_5', '내가 관심 있는 진로를 생각해보는 계기가 되었다.', 'group', 'A', 3),
  ('rating_5', '체험 활동의 구성과 시간이 적절했다.', 'group', 'A', 4),
  ('rating_5', '실제 직업 세계에 대한 관심이 높아졌다.', 'group', 'A', 5);

-- B형 — 직업인특강/토크콘서트형
INSERT INTO survey_questions (question_type, question_text, scope, survey_group, display_order) VALUES
  ('rating_5', '강연자의 경험이 진로를 생각하는 데 도움이 되었다.', 'group', 'B', 1),
  ('rating_5', '직업과 일의 의미에 대해 더 생각해보게 되었다.', 'group', 'B', 2),
  ('rating_5', '해당 직업에 대해 구체적으로 이해하게 되었다.', 'group', 'B', 3),
  ('rating_5', '사례와 이야기가 공감되고 인상적이었다.', 'group', 'B', 4),
  ('rating_5', '나의 진로 계획에 참고할 만한 내용을 얻었다.', 'group', 'B', 5);

-- C형 — AI·디지털체험형
INSERT INTO survey_questions (question_type, question_text, scope, survey_group, display_order) VALUES
  ('rating_5', 'AI 기술이 우리 생활과 직업에 어떻게 활용되는지 이해하게 되었다.', 'group', 'C', 1),
  ('rating_5', 'AI를 창의적으로 활용해볼 수 있다는 자신감이 생겼다.', 'group', 'C', 2),
  ('rating_5', '활동을 통해 새로운 기술에 대한 흥미가 높아졌다.', 'group', 'C', 3),
  ('rating_5', '직접 만들어보는 과정이 유익했다.', 'group', 'C', 4),
  ('rating_5', '미래 진로와 AI의 관계를 생각해보게 되었다.', 'group', 'C', 5);

-- D형 — 창업·경제교육형
INSERT INTO survey_questions (question_type, question_text, scope, survey_group, display_order) VALUES
  ('rating_5', '창업이나 경제 활동에 대해 쉽게 이해할 수 있었다.', 'group', 'D', 1),
  ('rating_5', '문제를 새롭게 보고 해결 방법을 생각해보게 되었다.', 'group', 'D', 2),
  ('rating_5', '도전정신이나 주도성의 중요성을 느꼈다.', 'group', 'D', 3),
  ('rating_5', '돈, 소비, 저축, 투자 등 경제 개념 이해에 도움이 되었다.', 'group', 'D', 4),
  ('rating_5', '실생활과 연결해서 생각해볼 수 있었다.', 'group', 'D', 5);

-- E형 — 전환기/성장지원형
INSERT INTO survey_questions (question_type, question_text, scope, survey_group, display_order) VALUES
  ('rating_5', '나 자신에 대해 더 이해하는 데 도움이 되었다.', 'group', 'E', 1),
  ('rating_5', '앞으로의 학교생활이나 성장에 대해 생각해보게 되었다.', 'group', 'E', 2),
  ('rating_5', '다른 사람과 사회를 바라보는 관점이 넓어졌다.', 'group', 'E', 3),
  ('rating_5', '나의 강점이나 관심을 발견하는 데 도움이 되었다.', 'group', 'E', 4),
  ('rating_5', '앞으로 실천해보고 싶은 점이 생겼다.', 'group', 'E', 5);

-- ------------------------------------------------------------
-- 4. programs.survey_group — 기존 등록 프로그램 전부 채우고 이후 필수화
--    (지시서 확정 표 기준. 현재 DB에 존재하는 category: 전환기 프로그램/
--    직업인특강/현장직업체험 3종 — 나머지(AI와 미래신직업 등)는 아직
--    등록된 프로그램이 없어 채울 대상이 없고, 그룹 자체는 위에서 이미
--    등록해뒀으니 향후 그 category 로 프로그램을 신규 등록할 때
--    프로그램 관리 화면에서 담당자가 지정하면 된다)
-- ------------------------------------------------------------
ALTER TABLE programs ADD COLUMN survey_group TEXT REFERENCES survey_question_groups(group_code);

UPDATE programs SET survey_group = 'E' WHERE category = '전환기 프로그램';
UPDATE programs SET survey_group = 'B' WHERE category = '직업인특강';
UPDATE programs SET survey_group = 'A' WHERE category = '현장직업체험';

-- 위 UPDATE 로 다 못 채운 프로그램이 남아있으면(향후 목록이 늘어난 경우
-- 이 마이그레이션 재실행 시점 기준) NOT NULL 제약 추가가 실패해 즉시
-- 드러나도록 그대로 진행한다.
ALTER TABLE programs ALTER COLUMN survey_group SET NOT NULL;

-- ------------------------------------------------------------
-- 5. 세션별 확정된 설문 문항 구성 — QR "확정" 시점의 선택 결과를 고정 보관
-- ------------------------------------------------------------
CREATE TABLE survey_link_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_link_id UUID NOT NULL REFERENCES survey_links(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES survey_questions(id),
  display_order INT NOT NULL,
  UNIQUE (survey_link_id, question_id)
);

CREATE INDEX idx_survey_link_questions_link ON survey_link_questions(survey_link_id);

-- staff만 조회·생성. 익명 공개 페이지는 아래 get_survey_link_questions() RPC
-- (SECURITY DEFINER)로 토큰 1건에 대한 문항만 우회 조회 — survey_links 와
-- 동일한 방침(링크/구성 목록 자체는 공개 조회 대상이 아님).
CREATE POLICY "staff_all_survey_link_questions" ON survey_link_questions
  FOR ALL USING (public.is_staff()) WITH CHECK (public.is_staff());

-- 이 마이그레이션 이전(#013 방식)에 이미 발급된 survey_links 는
-- survey_link_questions 개념이 없었다. 그대로 두면 공개 응답 페이지가
-- "확정된 문항 0개"로 읽어 이미 배포된 QR이 깨진다 — 방금 비활성화한
-- 예전 9개 문항을 그 시점 구성 그대로 백필해 기존 QR이 계속 동일하게
-- 동작하도록 한다(회귀 방지).
INSERT INTO survey_link_questions (survey_link_id, question_id, display_order)
SELECT l.id, q.id, q.display_order - 900
FROM survey_links l
CROSS JOIN survey_questions q
WHERE q.question_text IN (
  '신분', '성별', '학년',
  '이 프로그램이 진로탐색에 도움이 되었습니까?',
  '프로그램 운영방식(시간, 진행 등)은 적절했습니까?',
  '강사의 지도는 충실했습니까?',
  '교육 장소는 안전했습니까?',
  '다음에도 이런 프로그램에 참여할 의향이 있습니까?',
  '기타의견(좋았던 점, 아쉬운 점, 바라는 점 등을 자유롭게 적어주세요)'
)
ON CONFLICT (survey_link_id, question_id) DO NOTHING;

-- ================================================================
-- RPC
-- ================================================================

-- 공개 설문 페이지 — 토큰 → 확정된 문항 목록(display_order 순). 반드시
-- survey_link_questions 에 담긴 것만 반환한다(활성/그룹 재계산 없음 —
-- 지시서 3-3 "확정되면 고정" 요건).
CREATE OR REPLACE FUNCTION public.get_survey_link_questions(p_token text)
  RETURNS TABLE(
    id uuid, question_type text, question_text text, options text[], display_order int
  )
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT q.id, q.question_type, q.question_text, q.options, slq.display_order
  FROM survey_links l
  JOIN survey_link_questions slq ON slq.survey_link_id = l.id
  JOIN survey_questions q ON q.id = slq.question_id
  WHERE l.token = p_token
  ORDER BY slq.display_order;
$$;

REVOKE ALL ON FUNCTION public.get_survey_link_questions(text) FROM public;
GRANT EXECUTE ON FUNCTION public.get_survey_link_questions(text) TO anon, authenticated;

-- 익명 응답 제출 검증 기준 변경 — "활성 문항인지"가 아니라 "그 토큰에 확정된
-- 문항 구성에 포함돼 있는지"로 바꿔, 확정 이후 문항이 비활성화되거나
-- 그룹이 바뀌어도 이미 발급된 QR 로는 계속 정상 제출되게 한다.
CREATE OR REPLACE FUNCTION public.submit_survey_response(p_token text, p_answers jsonb)
  RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_session_id uuid;
  v_link_id uuid;
  v_response_id uuid;
  v_answer jsonb;
  v_question_id uuid;
BEGIN
  SELECT l.id, l.session_id INTO v_link_id, v_session_id FROM survey_links l WHERE l.token = p_token;
  IF v_session_id IS NULL THEN
    RAISE EXCEPTION '유효하지 않은 설문 링크입니다.' USING ERRCODE = 'no_data_found';
  END IF;

  IF p_answers IS NULL OR jsonb_array_length(p_answers) = 0 THEN
    RAISE EXCEPTION '응답 내용이 없습니다.' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  INSERT INTO survey_responses (session_id) VALUES (v_session_id)
    RETURNING id INTO v_response_id;

  FOR v_answer IN SELECT * FROM jsonb_array_elements(p_answers) LOOP
    v_question_id := NULLIF(v_answer->>'question_id', '')::uuid;
    CONTINUE WHEN v_question_id IS NULL;

    IF NOT EXISTS (
      SELECT 1 FROM survey_link_questions slq
      WHERE slq.survey_link_id = v_link_id AND slq.question_id = v_question_id
    ) THEN
      CONTINUE;
    END IF;

    INSERT INTO survey_answers (response_id, question_id, answer_rating, answer_text)
    VALUES (
      v_response_id,
      v_question_id,
      NULLIF(v_answer->>'answer_rating', '')::smallint,
      NULLIF(v_answer->>'answer_text', '')
    );
  END LOOP;
END;
$$;
