// DB 행 타입 (작업지시서 #002 범위: schools / programs / session_requests / class_sessions / app_accounts)
// 스키마: supabase/migrations/20260909000000_initial_schema.sql

export type AccountRole = "staff" | "school" | "instructor";

export type RequestStatus = "submitted" | "reviewing" | "approved" | "rejected";

export type SessionStatus =
  | "unassigned"
  | "provisional"
  | "confirmed"
  | "completed"
  | "cancelled";

export type SchoolLevel = "초등학교" | "중학교" | "고등학교";

export interface AppAccount {
  id: string;
  role: AccountRole;
  school_id: string | null;
  instructor_id: string | null;
  display_name: string | null;
  created_at: string;
}

export interface School {
  id: string;
  name: string;
  level: SchoolLevel;
  district: string | null;
  teacher_name: string | null;
  teacher_phone: string | null;
  teacher_email: string | null;
  created_at: string;
}

export interface Program {
  id: string;
  name: string;
  category: string | null; // 대분류
  sub_program: string | null; // 세부항목
  matching_keyword: string | null; // 강사 매칭 키워드 (자동계산)
  is_active: boolean;
  survey_group: SurveyGroupCode; // 설문 문항 그룹 (작업지시서 #013-1, 필수)
}

/** 프로그램 표시명 (대분류 - 세부) */
export function programLabel(p: {
  category: string | null;
  sub_program: string | null;
  name: string;
}): string {
  const cat = p.category ?? p.name;
  return p.sub_program ? `${cat} · ${p.sub_program}` : cat;
}

export interface SessionRequest {
  id: string;
  school_id: string;
  program_id: string | null;
  academic_year: number;
  requested_dates: string[] | null;
  preferred_time_slot: string | null;
  expected_student_count: string | null;
  required_specialty: string | null;
  required_instructor_count: number;
  request_status: RequestStatus;
  submitted_by: string | null;
  teacher_name: string | null;
  submitted_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  proxy_note: string | null;
  created_at: string;
}

export interface SessionRequestItem {
  id: string;
  request_id: string;
  program_id: string;
  requested_dates: string[] | null;
  dates_tbd: boolean;
  preferred_time_slot: string | null;
  expected_student_count: string | null;
  note: string | null;
  created_at: string;
}

export interface SessionRequestItemWithProgram extends SessionRequestItem {
  program: Pick<
    Program,
    "id" | "name" | "category" | "sub_program" | "matching_keyword"
  > | null;
}

/** 목록 화면용: 신청서 + 학교/명세 조인 */
export interface SessionRequestWithRefs extends SessionRequest {
  school: Pick<School, "id" | "name" | "level"> | null;
  session_request_items: SessionRequestItemWithProgram[];
  class_sessions: { id: string; session_status: SessionStatus }[];
}

export interface ClassSession {
  id: string;
  request_id: string | null;
  school_id: string;
  program_id: string;
  academic_year: number;
  scheduled_date: string | null;
  time_slot: string | null;
  student_count: string | null;
  required_specialty: string | null;
  required_instructor_count: number;
  session_status: SessionStatus;
  created_at: string;
}

export interface Instructor {
  id: string;
  photo_url: string | null;
  name: string;
  birth_date: string | null;
  address: string | null;
  home_phone: string | null;
  mobile_phone: string | null;
  email: string | null;
  bank_account: string | null;
  status: "active" | "inactive";
  rating_avg: number; // 설문 기반 자동 점수 (#016)
  manager_adjustment_enabled: boolean; // 담당자 수동조정 사용 여부 (#017)
  manager_adjustment_score: number | null; // 1.0~5.0
  manager_adjustment_reason: string | null;
  manager_adjustment_by: string | null;
  manager_adjustment_at: string | null;
  effective_rating: number; // 매칭에 실제 쓰이는 값 — rating_avg 70% + 조정 30% (조정 꺼지면 rating_avg 와 동일)
  form_submitted_at: string | null;
  created_at: string;
}

export interface CareerRow {
  id: string;
  instructor_id: string;
  year_month: string | null;
  description: string | null;
  issuing_org: string | null;
}

export interface CertRow {
  id: string;
  instructor_id: string;
  cert_name: string;
  issued_date: string | null;
  issuing_org: string | null;
}

export interface SpecialtyRow {
  id: string;
  instructor_id: string;
  specialty: string;
}

export interface DocumentRow {
  id: string;
  instructor_id: string;
  doc_type: string;
  file_url: string | null;
  issued_at: string | null;
  expires_at: string | null;
  status: "valid" | "expiring_soon" | "expired";
  expiry_notified_at: string | null;
  expired_notified_at: string | null;
  created_at: string;
}

// ---- 작업지시서 #004: 강사 매칭 / 배정 ----

export type AssignmentType = "provisional" | "confirmed";

export type ChangeContext = "final_confirm" | "calendar_edit";

export interface AssignmentCandidate {
  id: string;
  session_id: string;
  instructor_id: string;
  rank: number;
  match_score: number | null;
  generated_at: string;
}

/** 후보 목록 화면용: 후보 + 강사(전문분야 포함) 조인 */
export interface AssignmentCandidateWithInstructor extends AssignmentCandidate {
  instructor:
    | (Pick<Instructor, "id" | "name" | "effective_rating" | "status"> & {
        instructor_specialties: { specialty: string }[];
      })
    | null;
}

export interface Assignment {
  id: string;
  session_id: string;
  instructor_id: string;
  assignment_type: AssignmentType;
  selected_from_candidate_id: string | null;
  assigned_by: string;
  provisional_at: string | null;
  confirm_due_date: string | null;
  confirmed_at: string | null;
  is_changed_at_final: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface AssignmentHistoryRow {
  id: string;
  assignment_id: string;
  from_status: string | null;
  to_status: string;
  from_instructor_id: string | null;
  to_instructor_id: string | null;
  change_context: ChangeContext;
  changed_by: string | null;
  changed_at: string;
  reason: string | null;
}

/** 예정일/시간대 확정을 위한 class_sessions + 학교/프로그램/신청명세 조인 */
export interface ClassSessionWithRefs extends ClassSession {
  request_item_id: string | null;
  school: Pick<School, "id" | "name" | "level"> | null;
  program: Pick<Program, "id" | "name" | "category" | "sub_program"> | null;
  request_item: Pick<
    SessionRequestItem,
    "requested_dates" | "preferred_time_slot" | "dates_tbd"
  > | null;
}

export interface ScheduleHistoryRow {
  id: string;
  session_id: string;
  previous_date: string | null;
  previous_time_slot: string | null;
  new_date: string;
  new_time_slot: string | null;
  changed_by: string | null;
  changed_at: string;
  reason: string | null;
}

// ---- 작업지시서 #005: 자체 캘린더 ----

export interface InstructorWithSpecialties {
  id: string;
  name: string;
  status: "active" | "inactive";
  rating_avg: number;
  specialties: string[];
}

/** 캘린더 카드용: scheduled_date 가 있는 세션 + 학교/프로그램/배정강사 */
export interface CalendarSession {
  id: string;
  scheduled_date: string;
  time_slot: string | null;
  session_status: SessionStatus;
  school_name: string;
  program_name: string;
  instructor_id: string | null;
  instructor_name: string | null;
  assignment_type: AssignmentType | null;
}

// ---- 작업지시서 #015: 강사 불가기간 (아래 TimeConflict 확장에도 사용) ----

export type ConflictType = "schedule" | "unavailable";

export interface InstructorUnavailablePeriod {
  id: string;
  instructor_id: string;
  start_date: string;
  end_date: string;
  reason: string | null;
  created_at: string;
}

/** instructor_time_conflicts() RPC 결과 — 스케줄 중복 / 불가기간 겹침 공용 */
export interface TimeConflict {
  conflict_type: ConflictType;
  session_id: string | null; // 'schedule' 인 경우만
  school_name: string | null; // 'schedule' 인 경우만
  program_name: string | null; // 'schedule' 인 경우만
  scheduled_date: string;
  time_slot: string | null; // 'schedule' 인 경우만
  session_status: string | null; // 'schedule' 인 경우만
  unavailable_period_id: string | null; // 'unavailable' 인 경우만
  unavailable_reason: string | null; // 'unavailable' 인 경우만
}

/** 다이얼로그 메시지용 — 충돌 사유(스케줄 중복/불가기간/둘 다)를 한 문장으로 */
export function conflictReasonText(conflicts: TimeConflict[]): string {
  const hasSchedule = conflicts.some((c) => c.conflict_type === "schedule");
  const hasUnavailable = conflicts.some((c) => c.conflict_type === "unavailable");
  if (hasSchedule && hasUnavailable) {
    return "이미 다른 세션에 배정되어 있고, 강의 불가기간과도 겹칩니다";
  }
  if (hasUnavailable) return "강의 불가기간과 겹칩니다";
  return "이미 다른 세션에 배정되어 있습니다";
}

// ---- 작업지시서 #007: 강사료 정산 ----

export interface PaymentRateSetting {
  id: string;
  rate: number;
  effective_from: string;
  note: string | null;
  created_by: string | null;
  created_at: string;
}

export type PaymentStatus = "pending" | "paid";

export interface Payment {
  id: string;
  instructor_id: string;
  period_start: string;
  period_end: string;
  quantity: number;
  rate: number;
  amount: number;
  payment_status: PaymentStatus;
  settled_by: string | null;
  settled_at: string | null;
  paid_by: string | null;
  paid_at: string | null;
  notes: string | null;
  created_at: string;
}

export interface PaymentWithInstructor extends Payment {
  instructor: Pick<Instructor, "id" | "name"> | null;
}

/** 정산 상세: 포함된 개별 강의 */
export interface PaymentLectureItem {
  lecture_confirmation_id: string;
  actual_date: string | null;
  actual_hours: number | null;
  school_name: string;
  program_name: string;
}

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  pending: "지급대기",
  paid: "지급완료",
};

export const SESSION_STATUS_LABEL: Record<SessionStatus, string> = {
  unassigned: "미배정",
  provisional: "임시배정",
  confirmed: "최종확정",
  completed: "강의완료",
  cancelled: "취소",
};

export const REQUEST_STATUS_LABEL: Record<RequestStatus, string> = {
  submitted: "제출됨",
  reviewing: "검토중",
  approved: "승인",
  rejected: "반려",
};

// ---- 작업지시서 #013: QR 기반 익명 교육만족도 설문 ----

export type QuestionType = "rating_5" | "single_choice" | "short_text" | "long_text";

export type QuestionScope = "common" | "group";

export interface SurveyQuestion {
  id: string;
  question_type: QuestionType;
  question_text: string;
  options: string[] | null; // single_choice 전용
  display_order: number;
  is_active: boolean;
  scope: QuestionScope;
  survey_group: SurveyGroupCode | null; // scope='group' 인 경우만
  created_at: string;
}

export interface SurveyLink {
  id: string;
  session_id: string;
  token: string;
  created_by: string | null;
  created_at: string;
}

/** get_survey_context() RPC 결과 — 공개 설문 페이지에서 토큰 유효성 확인 + 안내 문구용 */
export interface SurveyContext {
  session_id: string;
  school_name: string;
  program_name: string;
  scheduled_date: string | null;
}

export const QUESTION_TYPE_LABEL: Record<QuestionType, string> = {
  rating_5: "5점 척도",
  single_choice: "단일선택",
  short_text: "단답형",
  long_text: "서술형",
};

// ---- 작업지시서 #013-1: 설문 문항 그룹화 (공통 + 프로그램 성격별) ----

export type SurveyGroupCode = "A" | "B" | "C" | "D" | "E";

export interface SurveyQuestionGroup {
  group_code: SurveyGroupCode;
  label: string;
  display_order: number;
}

export const SURVEY_GROUP_LABEL: Record<SurveyGroupCode, string> = {
  A: "A형 · 직업체험/현장체험형",
  B: "B형 · 직업인특강/토크콘서트형",
  C: "C형 · AI·디지털체험형",
  D: "D형 · 창업·경제교육형",
  E: "E형 · 전환기/성장지원형",
};

/** get_survey_link_questions() RPC 결과 — 공개 응답 페이지가 그대로 렌더링 */
export interface SurveyLinkQuestion {
  id: string;
  question_type: QuestionType;
  question_text: string;
  options: string[] | null;
  display_order: number;
}

// ---- 작업지시서 #017: 담당자 강사평판 수동조정 ----

export interface InstructorRatingAdjustmentHistory {
  id: string;
  instructor_id: string;
  enabled_before: boolean;
  enabled_after: boolean;
  score_before: number | null;
  score_after: number | null;
  reason: string | null;
  changed_by: string | null;
  changed_at: string;
}
