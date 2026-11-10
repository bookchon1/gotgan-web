-- 15. 업무현황 수동 정렬: work_tasks.sort_order 추가
-- Supabase SQL Editor 에서 실행하세요.

begin;

-- 정렬 순서 컬럼 (클수록 목록 위쪽)
alter table public.work_tasks
  add column if not exists sort_order int;

-- 기존 행 백필: 영역(area)별로 등록일(reg_date) 최신이 위로 오도록 번호 부여
with ranked as (
  select id,
         row_number() over (
           partition by area
           order by reg_date desc nulls last, created_at desc
         ) as rn,
         count(*) over (partition by area) as cnt
  from public.work_tasks
)
update public.work_tasks w
   set sort_order = (ranked.cnt - ranked.rn)   -- 최신=가장 큰 값 → 위쪽
  from ranked
 where ranked.id = w.id
   and w.sort_order is null;

commit;
