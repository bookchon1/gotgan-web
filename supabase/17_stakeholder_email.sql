-- 17. 미술 사업 관계자: 이메일 컬럼 추가
-- Supabase SQL Editor 에서 실행하세요.
alter table public.art_stakeholders
  add column if not exists email text;

-- 자문위원: 이메일 컬럼 추가
alter table public.advisors
  add column if not exists email text;
