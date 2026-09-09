-- ================================================================
-- 작업지시서 #004 보강 — assignments.selected_from_candidate_id FK 를
-- ON DELETE SET NULL 로 변경
-- ================================================================
-- generate_assignment_candidates() 는 재실행 시 해당 세션의 기존 후보를
-- 전부 지우고 다시 쓴다(작업지시서: "최종확정 시 동일 조건으로 재실행").
-- 그런데 이미 임시배정된 세션은 assignments.selected_from_candidate_id 가
-- 그 후보 행을 참조하고 있어 DELETE 가 FK(RESTRICT)로 막혔다.
-- 후보 테이블은 "추천 스냅샷"이므로 재계산 시 이전 선택 링크는 끊어져도
-- 무방하다(배정 강사/담당자/시각은 assignments 에 그대로 남음).
-- ================================================================

ALTER TABLE public.assignments
  DROP CONSTRAINT IF EXISTS assignments_selected_from_candidate_id_fkey;

ALTER TABLE public.assignments
  ADD CONSTRAINT assignments_selected_from_candidate_id_fkey
    FOREIGN KEY (selected_from_candidate_id)
    REFERENCES public.assignment_candidates(id)
    ON DELETE SET NULL;
