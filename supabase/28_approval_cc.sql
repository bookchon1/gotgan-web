-- 28. 결재 '참조'(열람 전용) 역할 추가 — 멱등
alter table public.approval_lines drop constraint if exists approval_lines_role_check;
alter table public.approval_lines
  add constraint approval_lines_role_check
  check (role in ('기안','검토','승인','회계접수','참조'));
notify pgrst, 'reload schema';
