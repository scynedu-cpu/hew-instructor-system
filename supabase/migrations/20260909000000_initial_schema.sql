-- ================================================================
-- 양재모 교육지원센터 강사·스케줄 통합관리 시스템 - 데이터베이스 스키마
-- 대상: Supabase (PostgreSQL)
-- 작업지시서 #001 기준 최초 마이그레이션
-- ================================================================

-- ------------------------------------------------------------
-- 1. 학교
-- ------------------------------------------------------------
CREATE TABLE schools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  level TEXT NOT NULL CHECK (level IN ('초등학교','중학교','고등학교')),
  district TEXT,
  teacher_name TEXT,
  teacher_phone TEXT,
  teacher_email TEXT,
  ggomgil_id TEXT,              -- 꿈길 ID
  ggomgil_pw TEXT,              -- 꿈길 PW (앱 레벨 암호화 권장)
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ------------------------------------------------------------
-- 2. 강사
-- 실제 "_양식_강사_카드.hwp" 내용 기준으로 필드 구성
-- (주민등록번호 등 민감정보는 이 표에 원문으로 저장하지 않음 —
--  instructor_documents의 file_url로 원본 서류만 안전하게 보관 권장)
-- ------------------------------------------------------------
CREATE TABLE instructors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  photo_url TEXT,                          -- 사진
  name TEXT NOT NULL,                      -- 성명
  birth_date DATE,                         -- 생년월일
  address TEXT,                            -- 주소
  home_phone TEXT,                         -- 자택전화
  mobile_phone TEXT,                       -- 휴대전화
  email TEXT,
  bank_account TEXT,                       -- 통장사본 정보(계좌, 마스킹 저장 권장)
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  rating_avg NUMERIC(3,2) DEFAULT 0,        -- 만족도·담당자평가 반영 평균 점수
  form_submitted_at DATE,                  -- 강사카드 작성일
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 학력 및 경력사항 (강사카드 표 — 연도별 여러 건)
CREATE TABLE instructor_career_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instructor_id UUID NOT NULL REFERENCES instructors(id) ON DELETE CASCADE,
  year_month TEXT,                 -- 원본이 "년/월"만 있는 자유서식이라 TEXT
  description TEXT,                -- 학력/경력 내용
  issuing_org TEXT                 -- 기타/발령청
);

-- 자격증 (강사카드 표 — 여러 건)
CREATE TABLE instructor_certifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instructor_id UUID NOT NULL REFERENCES instructors(id) ON DELETE CASCADE,
  cert_name TEXT NOT NULL,
  issued_date DATE,
  issuing_org TEXT
);

-- 강사 전문분야 (M:N) — 예: AI교육, 드론전문가, 로봇공학자, 진로토크콘서트
CREATE TABLE instructor_specialties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instructor_id UUID NOT NULL REFERENCES instructors(id) ON DELETE CASCADE,
  specialty TEXT NOT NULL
);

-- 강사 제출 서류 (유효기간 자동관리 대상)
CREATE TABLE instructor_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instructor_id UUID NOT NULL REFERENCES instructors(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL CHECK (doc_type IN (
    '강사카드','개인정보동의서','신분증사본','통장사본',
    '결격조회동의서','성범죄경력조회동의서','이력서'
  )),
  file_url TEXT,
  issued_at DATE,
  expires_at DATE,              -- 성범죄조회: 발급+1년 / 이력서: 발급+3년
  status TEXT NOT NULL DEFAULT 'valid' CHECK (status IN ('valid','expiring_soon','expired')),
  expiry_notified_at TIMESTAMPTZ,  -- 담당자 이메일로 만료 알림 발송한 시각(중복발송 방지용)
  created_at TIMESTAMPTZ DEFAULT now()
);
-- 알림 발송 대상은 담당자(staff) 이메일 고정 — 문서별로 수신자를 따로 저장하지 않고
-- 앱 설정(환경변수 등)의 담당자 이메일로 일괄 발송. status가 'expiring_soon'으로
-- 바뀐 문서 중 expiry_notified_at이 비어있는 건을 골라 이메일 발송 후 시각 기록.

-- ------------------------------------------------------------
-- 3. 프로그램 마스터 (현장체험/센터체험/직업인특강/전환기교육 등)
-- ------------------------------------------------------------
CREATE TABLE programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,           -- 예: 센터체험, 직업인특강, 전환기교육
  category TEXT                 -- 예: 현장체험형, 특강형, 동아리형
);

-- ------------------------------------------------------------
-- 4. 학교 교육 신청 (정식 신청서 워크플로우)
-- ※ 실제 신청서 양식을 아직 못 받아 연간일정 엑셀 구조 기준으로
--   추정 설계함 — 실물 양식 확보 시 필드 재검토 필요
-- ------------------------------------------------------------
CREATE TABLE session_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id),
  program_id UUID NOT NULL REFERENCES programs(id),
  academic_year INT NOT NULL,
  requested_dates DATE[],           -- 학교가 제시하는 희망일자(복수 가능)
  preferred_time_slot TEXT,         -- 예: "10:00~12:00", "1,2교시"
  expected_student_count TEXT,      -- "120명", "8학급" 등 자유서식 → TEXT
  required_specialty TEXT,
  required_instructor_count INT DEFAULT 1,
  request_status TEXT NOT NULL DEFAULT 'submitted' CHECK (request_status IN (
    'submitted',   -- 학교가 신청서 제출
    'reviewing',   -- HEW 검토중
    'approved',    -- 승인 → class_sessions 생성
    'rejected'
  )),
  submitted_by TEXT,                -- 학교 담당교사
  submitted_at TIMESTAMPTZ DEFAULT now(),
  reviewed_by TEXT,                 -- HEW 담당자
  reviewed_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ------------------------------------------------------------
-- 5. 학교별 확정 수업 일정 (신청서가 승인되면 여기 생성됨)
-- ------------------------------------------------------------
CREATE TABLE class_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID REFERENCES session_requests(id),  -- 어떤 신청서에서 나왔는지 (수기 등록 시 NULL 허용)
  school_id UUID NOT NULL REFERENCES schools(id),
  program_id UUID NOT NULL REFERENCES programs(id),
  academic_year INT NOT NULL,               -- 학년도 (예: 2026)
  scheduled_date DATE,                      -- 예정일 (미정이면 NULL)
  time_slot TEXT,                           -- 예: "10:00~12:00", "1,2교시"
  student_count TEXT,                       -- 원본이 "120명"/"8학급" 등 자유서식 → TEXT
  required_specialty TEXT,                  -- 필요 전문분야 (매칭 조건)
  required_instructor_count INT DEFAULT 1,  -- 동시 필요 강사 수 (예: 드론+로봇 2명)
  session_status TEXT NOT NULL DEFAULT 'unassigned' CHECK (session_status IN (
    'unassigned',    -- 강사 미배정
    'provisional',   -- 임시배정 완료 (학기초)
    'confirmed',     -- 최종확정 (강의 1개월 전)
    'completed',     -- 강의 완료
    'cancelled'
  )),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ------------------------------------------------------------
-- 6. 추천 후보 강사 — 시스템이 세션마다 최대 3명만 제안
-- match_score = 전문분야 일치도(가중치 0.8) + 평점(가중치 0.2)
-- 예: match_score = specialty_match(0~100) * 0.8 + (rating_avg/5*100) * 0.2
-- 가용성(스케줄 중복 여부)은 점수에 반영하지 않고, 이미 확정된
-- assignments와 시간대가 겹치는 강사는 애초에 후보 목록에서 제외하는
-- 하드 필터로 처리(점수 계산 전 단계에서 걸러냄)
-- ------------------------------------------------------------
CREATE TABLE assignment_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES class_sessions(id) ON DELETE CASCADE,
  instructor_id UUID NOT NULL REFERENCES instructors(id),
  rank SMALLINT NOT NULL CHECK (rank BETWEEN 1 AND 3),   -- 추천 순위 1~3위
  match_score NUMERIC(5,2),        -- 전문분야80% + 평점20% 종합 점수
  generated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (session_id, rank)
);
-- 담당자 화면에는 항상 이 테이블에서 session_id 기준 최신 3건(rank 1~3)만 보여준다.

-- ------------------------------------------------------------
-- 7. 실제 배정 — 임시배정과 최종확정을 한 레코드에서 상태로 관리
-- ------------------------------------------------------------
CREATE TABLE assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL UNIQUE REFERENCES class_sessions(id) ON DELETE CASCADE,
  instructor_id UUID NOT NULL REFERENCES instructors(id),
  assignment_type TEXT NOT NULL CHECK (assignment_type IN ('provisional','confirmed')),
  selected_from_candidate_id UUID REFERENCES assignment_candidates(id), -- 후보 3명 중 선택한 건
  assigned_by TEXT NOT NULL,             -- 담당자 이름
  provisional_at TIMESTAMPTZ,            -- 학기초 임시배정 시각
  confirm_due_date DATE,                 -- 최종확정 마감일 = scheduled_date - 1개월
  confirmed_at TIMESTAMPTZ,              -- 최종확정 시각
  is_changed_at_final BOOLEAN DEFAULT false, -- 최종확정 때 임시배정과 다른 강사로 바뀌었는지
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 배정 변경 이력 (임시→확정 전환, 캘린더에서 강사 교체 등 감사기록)
CREATE TABLE assignment_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  from_instructor_id UUID REFERENCES instructors(id),
  to_instructor_id UUID REFERENCES instructors(id),
  change_context TEXT DEFAULT 'final_confirm' CHECK (change_context IN (
    'final_confirm',    -- 강의 1개월전 최종확정 단계에서 변경
    'calendar_edit'      -- 담당자가 자체 캘린더 화면에서 강사를 바로 교체
  )),
  changed_by TEXT,
  changed_at TIMESTAMPTZ DEFAULT now(),
  reason TEXT
);

-- 자체 캘린더 화면에서 드래그로 일정(날짜/시간)을 옮겼을 때의 변경 이력
CREATE TABLE session_schedule_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES class_sessions(id) ON DELETE CASCADE,
  previous_date DATE,
  previous_time_slot TEXT,
  new_date DATE NOT NULL,
  new_time_slot TEXT,
  changed_by TEXT,           -- 담당자 이름
  changed_at TIMESTAMPTZ DEFAULT now(),
  reason TEXT
);
-- 캘린더에서 카드를 드래그하면 class_sessions.scheduled_date/time_slot을
-- 갱신하면서 이 테이블에 이전 값을 기록. 강사를 그 자리에서 바꾸면
-- assignments.instructor_id 갱신 + assignment_history(change_context='calendar_edit')에도 기록.

-- ------------------------------------------------------------
-- 8. 결과 활용 (이력·정산)
-- ------------------------------------------------------------
CREATE TABLE lecture_confirmations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES assignments(id),
  actual_date DATE,
  actual_hours NUMERIC(4,2),
  file_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE satisfaction_surveys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES class_sessions(id),
  respondent_count INT,
  avg_score NUMERIC(3,2),
  raw_data_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES assignments(id),
  hours NUMERIC(4,2),
  rate NUMERIC(10,2),
  amount NUMERIC(12,2),
  payment_status TEXT DEFAULT 'pending' CHECK (payment_status IN ('pending','paid')),
  paid_at DATE
);

-- ================================================================
-- 9. 접근 제어 — 로그인 계정 및 화면별 권한
-- 학교 신청 화면(session_requests)은 학교 계정에게,
-- 강사 정보 입력 화면(instructors 등)은 강사 계정에게만 오픈.
-- HEW 담당자(staff)는 전체 조회/수정 가능.
-- ================================================================

-- Supabase auth.users와 1:1로 연결되는 계정-소속 매핑 테이블
CREATE TABLE app_accounts (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('staff','school','instructor')),
  school_id UUID REFERENCES schools(id),         -- role='school'일 때만 값 존재
  instructor_id UUID REFERENCES instructors(id), -- role='instructor'일 때만 값 존재
  display_name TEXT,                             -- 현재 이 계정을 쓰는 사람 이름
                                                  -- (학교: 담당교사 교체 시 이 값만 갱신,
                                                  --  강사: instructors.name과 보통 동일)
  created_at TIMESTAMPTZ DEFAULT now(),
  CHECK (
    (role = 'school'     AND school_id IS NOT NULL AND instructor_id IS NULL) OR
    (role = 'instructor' AND instructor_id IS NOT NULL AND school_id IS NULL) OR
    (role = 'staff'      AND school_id IS NULL AND instructor_id IS NULL)
  )
);

-- 계정 1개 = 강사 1명 / 학교 1개 = 계정 1개를 DB 레벨에서 강제
-- (강사 계정 공유 방지의 구조적 안전장치 — 운영 절차와 함께 적용 필요)
CREATE UNIQUE INDEX idx_app_accounts_one_per_instructor
  ON app_accounts(instructor_id) WHERE role = 'instructor';
CREATE UNIQUE INDEX idx_app_accounts_one_per_school
  ON app_accounts(school_id) WHERE role = 'school';

-- 학교 담당교사 교체 이력 (계정 id는 유지, 이름/비밀번호만 교체될 때 기록)
CREATE TABLE app_account_holder_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES app_accounts(id) ON DELETE CASCADE,
  previous_holder_name TEXT,
  new_holder_name TEXT NOT NULL,
  changed_by TEXT,           -- 변경 처리한 HEW 담당자
  changed_at TIMESTAMPTZ DEFAULT now(),
  reason TEXT                -- 예: "담당교사 인사이동"
);

-- ----------------------------------------------------------------
-- RLS 헬퍼 — auth.uid() 계정이 staff / school(school_id) / instructor(instructor_id)
-- 인지 판정. SECURITY DEFINER 로 app_accounts 를 우회 조회하므로
-- app_accounts 자체에는 RLS 를 걸지 않아도 되고, 정책 서브쿼리도 단순해진다.
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_staff()
  RETURNS BOOLEAN
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM app_accounts a
    WHERE a.id = auth.uid() AND a.role = 'staff'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_school(target_school_id UUID)
  RETURNS BOOLEAN
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM app_accounts a
    WHERE a.id = auth.uid() AND a.role = 'school' AND a.school_id = target_school_id
  );
$$;

CREATE OR REPLACE FUNCTION public.is_instructor(target_instructor_id UUID)
  RETURNS BOOLEAN
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM app_accounts a
    WHERE a.id = auth.uid() AND a.role = 'instructor' AND a.instructor_id = target_instructor_id
  );
$$;

-- [화면1] 학교 신청 화면 — session_requests: 본인 학교 건만 조회/수정
ALTER TABLE session_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_full_access_requests" ON session_requests
  FOR ALL USING (public.is_staff()) WITH CHECK (public.is_staff());

CREATE POLICY "school_own_requests" ON session_requests
  FOR ALL USING (public.is_school(school_id)) WITH CHECK (public.is_school(school_id));

-- [화면2] 강사 정보 입력 화면 — instructors 및 하위 테이블: 본인 건만 조회/수정
ALTER TABLE instructors ENABLE ROW LEVEL SECURITY;
ALTER TABLE instructor_career_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE instructor_certifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE instructor_specialties ENABLE ROW LEVEL SECURITY;
ALTER TABLE instructor_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_full_access_instructors" ON instructors
  FOR ALL USING (public.is_staff()) WITH CHECK (public.is_staff());

CREATE POLICY "instructor_own_profile" ON instructors
  FOR ALL USING (public.is_instructor(id)) WITH CHECK (public.is_instructor(id));

-- 하위 테이블(경력/자격증/전문분야/서류): instructor_id 로 동일 패턴
--  → staff 전체허용 + instructor 본인허용
CREATE POLICY "staff_full_access_career" ON instructor_career_history
  FOR ALL USING (public.is_staff()) WITH CHECK (public.is_staff());
CREATE POLICY "instructor_own_career" ON instructor_career_history
  FOR ALL USING (public.is_instructor(instructor_id)) WITH CHECK (public.is_instructor(instructor_id));

CREATE POLICY "staff_full_access_cert" ON instructor_certifications
  FOR ALL USING (public.is_staff()) WITH CHECK (public.is_staff());
CREATE POLICY "instructor_own_cert" ON instructor_certifications
  FOR ALL USING (public.is_instructor(instructor_id)) WITH CHECK (public.is_instructor(instructor_id));

CREATE POLICY "staff_full_access_specialty" ON instructor_specialties
  FOR ALL USING (public.is_staff()) WITH CHECK (public.is_staff());
CREATE POLICY "instructor_own_specialty" ON instructor_specialties
  FOR ALL USING (public.is_instructor(instructor_id)) WITH CHECK (public.is_instructor(instructor_id));

CREATE POLICY "staff_full_access_documents" ON instructor_documents
  FOR ALL USING (public.is_staff()) WITH CHECK (public.is_staff());
CREATE POLICY "instructor_own_documents" ON instructor_documents
  FOR ALL USING (public.is_instructor(instructor_id)) WITH CHECK (public.is_instructor(instructor_id));

-- [그 외 테이블] schools / programs / class_sessions / assignment_* /
--  lecture_confirmations / satisfaction_surveys / payments / session_schedule_history /
--  app_accounts / app_account_holder_history 는 이번 단계에서 RLS 미적용.
--  → 담당자(staff) 대시보드 화면 작업지시서에서 staff 전용 정책을 일괄 부여 예정.
--  ⚠ 운영 배포 전 반드시 전 테이블 RLS 를 채워야 함 (특히 app_accounts).

-- ================================================================
-- 전체 워크플로우 요약 (애플리케이션 로직)
-- ================================================================
-- [학교 신청]
-- 0) 학교 담당교사가 session_requests에 신청서 제출(request_status='submitted')
-- 0-1) HEW 담당자가 검토 후 승인하면 class_sessions 생성(request_id로 연결),
--      request_status='approved'로 갱신. 반려 시 'rejected'+rejection_reason 기록
--
-- [학기초]
-- 1) class_sessions 생성 시 required_specialty 조건으로 이미 다른 세션에
--    배정된 시간대와 겹치는 강사를 하드 필터로 제외한 뒤,
--    match_score(전문분야80% + 평점20%) 기준 상위 3명만
--    assignment_candidates에 기록(rank 1~3)
-- 2) 담당자 화면은 이 3명만 보여주고, 담당자가 1명 선택
-- 3) assignments row 생성: assignment_type='provisional',
--    provisional_at=now(), confirm_due_date=scheduled_date - interval '1 month'
--    class_sessions.session_status='provisional'로 갱신
--
-- [강의 1개월 전 — 최종확정]
-- 4) confirm_due_date가 지난 provisional 건을 담당자 대시보드에
--    "최종확정 필요"로 노출
-- 5) 매칭 로직이 assignment_candidates를 동일한 방식(전문분야80%+평점20%,
--    스케줄 중복은 하드필터)으로 재계산해서 다시 최대 3명 후보로 갱신
-- 6) 담당자가 그대로 유지하거나 다른 강사로 재선택
--    - 유지: assignment_type='confirmed', confirmed_at=now()
--    - 변경: instructor_id 갱신, is_changed_at_final=true,
--            assignment_history(change_context='final_confirm')에 이력 기록
--    class_sessions.session_status='confirmed'로 갱신
--
-- [서류 만료 알림]
-- 7) 매일(또는 정해진 주기) instructor_documents를 스캔해서 expires_at이
--    임박한 건을 status='expiring_soon'으로 갱신하고, expiry_notified_at이
--    비어있으면 담당자 이메일로 알림 발송 후 시각 기록(중복발송 방지)
--
-- [확정 스케줄 자체 캘린더 — 네이버웍스 연동 없음]
-- 8) 담당자 대시보드는 confirmed 상태의 class_sessions를 자체 캘린더 뷰로 표시
-- 9) 담당자가 캘린더에서 일정 카드를 드래그하면 scheduled_date/time_slot 갱신 +
--    session_schedule_history에 이전 값 기록
-- 10) 같은 캘린더 화면에서 강사도 바로 교체 가능 — assignments.instructor_id
--     갱신 + assignment_history(change_context='calendar_edit')에 기록
-- ================================================================
