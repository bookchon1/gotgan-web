-- =====================================================================
-- 곳간 — 전자결재 결재선(approval_lines)에 '검토' 역할 추가
--
-- 변경: role check 제약을 ('기안','승인','회계접수') → ('기안','검토','승인','회계접수')
-- 목적: 모든 전자결재가 기안(작성자)→검토(지정)→승인(지정) 로 진행,
--        지출 관련만 회계접수 단계 추가.
-- 멱등: 제약 교체(drop → add).
-- =====================================================================

alter table public.approval_lines drop constraint if exists approval_lines_role_check;
alter table public.approval_lines
  add constraint approval_lines_role_check
  check (role in ('기안','검토','승인','회계접수'));

-- 확인
select conname, pg_get_constraintdef(oid) as 정의
from pg_constraint
where conrelid = 'public.approval_lines'::regclass and contype = 'c';
