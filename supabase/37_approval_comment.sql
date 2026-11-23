-- 37. 결재 의견(코멘트) — 승인·반려 시 남기는 의견 — 멱등
alter table public.approval_lines add column if not exists comment text;
notify pgrst, 'reload schema';
