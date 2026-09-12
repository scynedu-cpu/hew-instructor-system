-- ================================================================
-- 작업지시서 #013 — QR 기반 익명 교육만족도 설문
-- ================================================================
-- 종이 설문지를 QR 기반 온라인 설문으로 전환. 강의 종료 후 담당 강사가
-- 세션별 QR을 보여주면 교육생이 로그인 없이 스캔해서 응답 → 완전 익명으로
-- 개별 응답 단위 저장. 문항은 코드에 고정하지 않고 담당자가 언제든
-- 추가·수정·비활성화 가능하도록 survey_questions 테이블로 분리한다.
--
-- 학교명·참가 프로그램은 QR이 class_sessions 에 묶여 있어 시스템이 이미
-- 알고 있으므로 별도 문항으로 만들지 않는다(지시서 2-1 참고).
-- ================================================================

-- ------------------------------------------------------------
-- 1. 설문 문항 — 담당자가 추가/수정/비활성화. "삭제"는 is_active=false 로만
--    처리해 기존 응답(survey_answers)과의 연결을 끊지 않는다.
-- ------------------------------------------------------------
CREATE TABLE survey_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_type TEXT NOT NULL CHECK (question_type IN (
    'rating_5',       -- 5점 척도
    'single_choice',  -- 단일선택 (options 에 선택지 직접 입력)
    'short_text',     -- 단답형
    'long_text'       -- 서술형
  )),
  question_text TEXT NOT NULL,
  options TEXT[],                          -- single_choice 전용 선택지 목록. 그 외 타입은 NULL
  display_order INT NOT NULL DEFAULT 0,    -- 공개 폼 렌더링 순서
  is_active BOOLEAN NOT NULL DEFAULT true, -- 화면상 "삭제" = false
  created_at TIMESTAMPTZ DEFAULT now(),
  CHECK (question_type <> 'single_choice' OR (options IS NOT NULL AND array_length(options, 1) >= 2))
);

-- ------------------------------------------------------------
-- 2. 세션별 설문 QR 링크 — 세션당 1개, 담당자가 "설문 QR 보기" 클릭 시
--    없으면 생성, 있으면 재사용(#005 캘린더 카드 상세에서 호출)
-- ------------------------------------------------------------
CREATE TABLE survey_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL UNIQUE REFERENCES class_sessions(id),
  token TEXT NOT NULL UNIQUE,       -- /survey/{token} 공개 URL 에 쓰는 랜덤 토큰
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ------------------------------------------------------------
-- 3. 개별 응답 — 완전 익명(응답자 식별정보 일체 없음). 같은 세션에
--    여러 건 쌓여도 각각 별개 행.
-- ------------------------------------------------------------
CREATE TABLE survey_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES class_sessions(id),
  submitted_at TIMESTAMPTZ DEFAULT now()
);

-- ------------------------------------------------------------
-- 4. 응답별 문항 답변 — 척도는 answer_rating, 그 외 타입은 answer_text
-- ------------------------------------------------------------
CREATE TABLE survey_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  response_id UUID NOT NULL REFERENCES survey_responses(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES survey_questions(id),
  answer_rating SMALLINT CHECK (answer_rating BETWEEN 1 AND 5),
  answer_text TEXT,
  CHECK (answer_rating IS NOT NULL OR answer_text IS NOT NULL)
);

CREATE INDEX idx_survey_responses_session ON survey_responses(session_id);
CREATE INDEX idx_survey_answers_response ON survey_answers(response_id);
CREATE INDEX idx_survey_answers_question ON survey_answers(question_id);

-- ================================================================
-- RLS
-- (이 프로젝트는 public 스키마 신규 테이블에 자동으로 RLS 를 켜는
--  이벤트 트리거가 있음 — 20260909010000 마이그레이션 상단 설명 참고.
--  그래서 여기서도 ENABLE ROW LEVEL SECURITY 는 따로 안 해도 됨)
-- ================================================================

-- survey_questions: staff 전체 접근 + 활성 문항은 누구나(anon 포함) 조회
-- — 공개 설문 폼 렌더링용(지시서 2-4)
CREATE POLICY "staff_all_survey_questions" ON survey_questions
  FOR ALL USING (public.is_staff()) WITH CHECK (public.is_staff());
CREATE POLICY "public_read_active_survey_questions" ON survey_questions
  FOR SELECT USING (is_active = true);

-- survey_links: staff만 조회·생성. 공개 페이지는 URL의 토큰 하나만으로
-- 접근하며 링크 목록 자체를 조회하지 않아야 하므로, anon 용 SELECT 정책은
-- 만들지 않고 아래 get_survey_context() RPC(SECURITY DEFINER)로 토큰 1건만
-- 우회 조회하게 한다(지시서 2-4).
CREATE POLICY "staff_all_survey_links" ON survey_links
  FOR ALL USING (public.is_staff()) WITH CHECK (public.is_staff());

-- survey_responses / survey_answers: staff만 조회 가능. 익명 사용자의 제출은
-- 테이블 RLS로 직접 열어주는 대신 아래 submit_survey_response() RPC로만
-- 받는다 — 응답 1건 + 답변 N건 저장을 한 트랜잭션으로 묶고, 활성 문항인지
-- 서버에서 검증한 뒤에만 저장하기 위함(익명 INSERT 정책만으로는 이 검증을
-- 표현하기 어렵고, 익명은 어차피 조회가 전혀 안 되므로 RPC 결과를 직접
-- 읽어서 확인할 수도 없음 — 완전 익명 요건과도 맞음).
CREATE POLICY "staff_all_survey_responses" ON survey_responses
  FOR ALL USING (public.is_staff()) WITH CHECK (public.is_staff());
CREATE POLICY "staff_all_survey_answers" ON survey_answers
  FOR ALL USING (public.is_staff()) WITH CHECK (public.is_staff());

-- ================================================================
-- RPC — 공개 설문 페이지 전용 (anon 허용, SECURITY DEFINER 로 RLS 우회)
-- ================================================================

-- 토큰 → 세션 컨텍스트(학교명/프로그램명/예정일). 잘못된 토큰이면 0행 반환.
CREATE OR REPLACE FUNCTION public.get_survey_context(p_token text)
  RETURNS TABLE(session_id uuid, school_name text, program_name text, scheduled_date date)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT cs.id, s.name, p.name, cs.scheduled_date
  FROM survey_links l
  JOIN class_sessions cs ON cs.id = l.session_id
  JOIN schools s ON s.id = cs.school_id
  JOIN programs p ON p.id = cs.program_id
  WHERE l.token = p_token;
$$;

REVOKE ALL ON FUNCTION public.get_survey_context(text) FROM public;
GRANT EXECUTE ON FUNCTION public.get_survey_context(text) TO anon, authenticated;

-- 익명 응답 제출 — 응답 1건 + 답변 N건을 한 트랜잭션으로 저장.
-- p_answers 형식: [{"question_id":"...","answer_rating":5}, {"question_id":"...","answer_text":"..."}]
-- 존재하지 않거나 비활성화된 문항 id 는 조용히 건너뛴다(응답 자체는 저장).
CREATE OR REPLACE FUNCTION public.submit_survey_response(p_token text, p_answers jsonb)
  RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_session_id uuid;
  v_response_id uuid;
  v_answer jsonb;
  v_question_id uuid;
BEGIN
  SELECT l.session_id INTO v_session_id FROM survey_links l WHERE l.token = p_token;
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
      SELECT 1 FROM survey_questions q WHERE q.id = v_question_id AND q.is_active = true
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

REVOKE ALL ON FUNCTION public.submit_survey_response(text, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.submit_survey_response(text, jsonb) TO anon, authenticated;

-- ================================================================
-- 초기 문항 시드 — "프로그램_만족도_설문지_양재내곡교육지원센터.hwp" 원본 기준
-- ================================================================
INSERT INTO survey_questions (question_type, question_text, options, display_order) VALUES
  ('single_choice', '신분', ARRAY['초등학생','중학생','고등학생','학부모','교직원','기타'], 1),
  ('single_choice', '성별', ARRAY['남자','여자'], 2),
  ('short_text', '학년', NULL, 3),
  ('rating_5', '이 프로그램이 진로탐색에 도움이 되었습니까?', NULL, 4),
  ('rating_5', '프로그램 운영방식(시간, 진행 등)은 적절했습니까?', NULL, 5),
  ('rating_5', '강사의 지도는 충실했습니까?', NULL, 6),
  ('rating_5', '교육 장소는 안전했습니까?', NULL, 7),
  ('rating_5', '다음에도 이런 프로그램에 참여할 의향이 있습니까?', NULL, 8),
  ('long_text', '기타의견(좋았던 점, 아쉬운 점, 바라는 점 등을 자유롭게 적어주세요)', NULL, 9);
