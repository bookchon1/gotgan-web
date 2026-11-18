-- 22. 진행현황 메모 수정 시각
-- Supabase SQL Editor 에서 실행하세요. (멱등)
alter table public.step_comments add column if not exists updated_at timestamptz;
notify pgrst, 'reload schema';
