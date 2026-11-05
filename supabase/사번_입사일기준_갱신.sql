-- =====================================================================
-- 곳간 — 기존 직원 사번(emp_no)을 입사일 기준으로 일괄 갱신
--
-- 형식: {입사년월}_{순번3자리}  (예: 2012-02 입사 → 201202_001)
-- 규칙: 같은 입사월(= to_char(join_date,'YYYYMM')) 안에서 입사일·sort 순으로 001,002…
--       입사일(join_date)이 없는 직원은 건드리지 않음.
-- 멱등: 여러 번 실행해도 같은 결과(입사일이 그대로면 사번도 그대로).
-- =====================================================================

with ranked as (
  select
    id,
    to_char(join_date, 'YYYYMM') as ym,
    row_number() over (
      partition by to_char(join_date, 'YYYYMM')
      order by join_date, sort, created_at, id
    ) as seq
  from public.employees
  where join_date is not null
)
update public.employees e
   set emp_no = r.ym || '_' || lpad(r.seq::text, 3, '0')
  from ranked r
 where e.id = r.id;

-- 확인
select name as 이름, join_date as 입사일, emp_no as 사번
from public.employees
where join_date is not null
order by join_date, sort;
