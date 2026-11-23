-- 38. 긴급 문서 표시 — 멱등
alter table public.approvals add column if not exists urgent boolean not null default false;
notify pgrst, 'reload schema';
