-- 14. 업무현황 상태 '보류' 추가 + 미술 사업 시안 필드 복구
-- Supabase SQL Editor 에서 실행하세요.

begin;

-- ── 1) work_tasks: 상태에 'hold'(보류) 추가 ──────────────────────────────
-- 기존 체크제약(plan/prog/done)을 제거하고 4종(plan/prog/hold/done)으로 교체
alter table public.work_tasks
  drop constraint if exists work_tasks_status_check;
alter table public.work_tasks
  add constraint work_tasks_status_check
  check (status in ('plan','prog','hold','done'));

-- ── 2) art_projects: 시안 '입찰·계약' 필드 복구 ──────────────────────────
alter table public.art_projects
  add column if not exists bid_method    text,   -- 낙찰 방법 (협상에의한계약/수의계약/일반경쟁/제한경쟁)
  add column if not exists bid_date      date,   -- 입찰 일정
  add column if not exists contract_date date,   -- 계약일
  add column if not exists start_date    date;   -- 착공일

commit;
