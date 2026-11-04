-- =====================================================================
-- 곳간 — 직원 '겸소속(extra_depts)' 컬럼 추가
--
-- 증상: 인사관리 상세카드에서 직원 정보(입사일 등)를 저장하면 반영이 안 됨.
-- 원인: 앱은 employees 를 업데이트할 때 extra_depts(겸소속) 컬럼도 함께 쓰는데,
--   이 컬럼이 DB 에 없어서 UPDATE 전체가 실패 → 입사일 등 모든 수정이 저장 안 됨.
-- 해결: extra_depts(text[]) 컬럼을 추가한다. 멱등(여러 번 실행 가능).
-- =====================================================================

alter table public.employees
  add column if not exists extra_depts text[] not null default '{}'::text[];

-- 확인
select name as 이름, dept_key as 주소속, extra_depts as 겸소속
from public.employees order by sort limit 20;
