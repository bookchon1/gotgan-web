-- 40. 합의(협조) 결재 역할 추가 + 결재선 저장에 합의자 컬럼 — 멱등 (28번·39번 이후 실행)
alter table public.approval_lines drop constraint if exists approval_lines_role_check;
alter table public.approval_lines
  add constraint approval_lines_role_check
  check (role in ('기안','검토','합의','승인','회계접수','참조'));
alter table public.approval_line_presets add column if not exists agree_id uuid references public.employees(id) on delete set null;
notify pgrst, 'reload schema';
