-- ================================================================
-- 작업지시서 #014-1 — 만족도설문 심화분석 (2-3. 서술형 응답 AI 분석)
-- ================================================================
-- 서술형 문항(기억에 남는 점/아쉬운 점/더 듣고 싶은 주제) 응답을 Claude API로
-- 분석한 결과(주제명+언급횟수+대표 예시)를 저장. 같은 문항+범위로 다시
-- 분석하면 덮어쓴다(재방문 시 재분석 없이 즉시 표시하기 위한 캐시 역할).
--
-- 나머지 분석(문항별 평균/순위/교차표/참여율)은 그때그때 실데이터를 직접
-- 집계해서 보여주면 되므로 별도 테이블이 필요 없다 — 이 테이블 하나만 추가.
-- ================================================================

CREATE TABLE survey_text_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID NOT NULL REFERENCES survey_questions(id) ON DELETE CASCADE,
  -- 분석 범위 — 지시서 2-3 "전체/특정 학교/특정 프로그램그룹/특정 강사" 중 하나.
  -- scope_type='all' 일 땐 scope_value=''(빈 문자열)로 고정해 UNIQUE 제약이
  -- NULL 비교 문제 없이 동작하게 한다.
  scope_type TEXT NOT NULL CHECK (scope_type IN ('all', 'school', 'program_group', 'instructor')),
  scope_value TEXT NOT NULL DEFAULT '',
  response_count INT NOT NULL, -- 분석에 사용된 서술형 응답 건수(재방문 시 참고용 표시)
  topics JSONB NOT NULL,       -- [{ "topic": string, "count": int, "examples": string[] }, ...]
  analyzed_by TEXT,
  analyzed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (question_id, scope_type, scope_value)
);

CREATE INDEX idx_survey_text_insights_question ON survey_text_insights(question_id);

-- staff 전용 — 구청 제출용 보고서 생성 등도 담당자만 다룬다(#014와 동일 정책)
CREATE POLICY "staff_all_survey_text_insights" ON survey_text_insights
  FOR ALL USING (public.is_staff()) WITH CHECK (public.is_staff());
