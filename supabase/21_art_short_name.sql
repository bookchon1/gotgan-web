-- 21. 사업 약칭 (업무일정 등 좁은 화면에 짧게 표시)
-- Supabase SQL Editor 에서 실행하세요. (멱등)
alter table public.art_projects add column if not exists short_name text;

-- 현재 등록된 사업의 약칭 (이미 입력된 값은 건드리지 않음)
update public.art_projects set short_name = '한양도성'    where short_name is null and name like '%한양도성%';
update public.art_projects set short_name = '석불사 산신도' where short_name is null and name like '%석불사%';
update public.art_projects set short_name = '영남읍도'    where short_name is null and name like '%영남읍도%';
update public.art_projects set short_name = '달동네박물관' where short_name is null and name like '%달동네%';
