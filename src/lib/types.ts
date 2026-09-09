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
  created_at: string;
}

export const REQUEST_STATUS_LABEL: Record<RequestStatus, string> = {
  submitted: "제출됨",
  reviewing: "검토중",
  approved: "승인",
  rejected: "반려",
};
