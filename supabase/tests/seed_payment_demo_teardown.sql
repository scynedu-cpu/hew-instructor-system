-- ================================================================
-- 작업지시서 #007 데모 데이터 정리
-- ================================================================
BEGIN;

-- 데모 정산/항목
DELETE FROM payment_items pi USING payments p
  WHERE pi.payment_id = p.id AND p.settled_by = '담당자';
DELETE FROM payments WHERE settled_by = '담당자';

-- 데모 강의/배정/세션 (담당자가 만든 completed 세션 중 데모 날짜)
DELETE FROM lecture_confirmations lc USING assignments a
  WHERE lc.assignment_id = a.id AND a.assigned_by = '담당자'
    AND lc.actual_date BETWEEN date '2026-09-01' AND date '2026-09-30';
DELETE FROM assignments a USING class_sessions cs
  WHERE a.session_id = cs.id AND a.assigned_by = '담당자'
    AND cs.request_id IS NULL AND cs.session_status = 'completed'
    AND cs.scheduled_date BETWEEN date '2026-09-01' AND date '2026-09-30';
DELETE FROM class_sessions
  WHERE request_id IS NULL AND session_status = 'completed'
    AND scheduled_date BETWEEN date '2026-09-01' AND date '2026-09-30'
    AND time_slot IN ('1,2교시','3,4교시','5,6교시');

-- 데모 단가 (기본 + 검증 중 추가한 인상분)
DELETE FROM payment_rate_settings
 WHERE note IN ('DEMO 기본 단가', '2026년 하반기 단가 인상');

COMMIT;
