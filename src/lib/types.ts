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
  category: string | null;
}

export interface SessionRequest {
  id: string;
  school_id: string;
  program_id: string;
  academic_year: number;
  requested_dates: string[] | null;
  preferred_time_slot: string | null;
  expected_student_count: string | null;
  required_specialty: string | null;
  required_instructor_count: number;
  request_status: RequestStatus;
  submitted_by: string | null;
  submitted_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  proxy_note: string | null;
  created_at: string;
}

/** 목록 화면용: 신청서 + 학교/프로그램 조인 */
export interface SessionRequestWithRefs extends SessionRequest {
  school: Pick<School, "id" | "name" | "level"> | null;
  program: Pick<Program, "id" | "name" | "category"> | null;
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
  rating_avg: number;
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
    | (Pick<Instructor, "id" | "name" | "rating_avg" | "status"> & {
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

/** 예정일/시간대 확정을 위한 class_sessions + 학교/프로그램/신청서 조인 */
export interface ClassSessionWithRefs extends ClassSession {
  school: Pick<School, "id" | "name" | "level"> | null;
  program: Pick<Program, "id" | "name" | "category"> | null;
  request: Pick<
    SessionRequest,
    "requested_dates" | "preferred_time_slot"
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

export interface TimeConflict {
  session_id: string;
  school_name: string;
  program_name: string;
  scheduled_date: string;
  time_slot: string | null;
  session_status: string;
}

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
