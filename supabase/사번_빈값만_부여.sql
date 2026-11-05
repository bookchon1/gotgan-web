-- =====================================================================
-- 곳간 — 사번(emp_no)이 비어있는 직원에게만 입사일 기준 사번 부여
--
-- 형식: {입사년월}_{순번3자리}  (예: 2025-09 입사 → 202509_001)
-- 규칙: · 기존 사번이 있는 직원은 그대로 둔다(변경 없음).
--        · 같은 입사월(YYYYMM)에서 '이미 쓰고 있는 순번' 과 겹치지 않는
--          가장 작은 번호부터 부여(입사일·sort 순).
--        · 입사일(join_date)이 없는 직원은 건너뜀.
-- 멱등: 여러 번 실행해도 결과 동일.
-- =====================================================================

with
-- 이미 사번이 있는 직원: 입사월별로 사용 중인 순번 집합
used as (
  select to_char(join_date,'YYYYMM') as ym,
         (regexp_replace(emp_no, '^.*_', ''))::int as seq
  from public.employees
  where emp_no is not null and emp_no ~ '_[0-9]+$' and join_date is not null
),
-- 사번 없는 직원에게 입사월 내 순번 후보(입사일·sort 순 1,2,3…)
need as (
  select id, to_char(join_date,'YYYYMM') as ym,
         row_number() over (
           partition by to_char(join_date,'YYYYMM')
           order by join_date, sort, created_at, id
         ) as rn
  from public.employees
  where (emp_no is null or emp_no = '') and join_date is not null
),
-- 각 입사월의 이미 쓰인 최대 순번(없으면 0) → 그 다음부터 부여
maxused as (
  select ym, coalesce(max(seq),0) as mx from used group by ym
)
update public.employees e
   set emp_no = n.ym || '_' || lpad((coalesce(m.mx,0) + n.rn)::text, 3, '0')
  from need n
  left join maxused m on m.ym = n.ym
 where e.id = n.id;

-- 확인: 사번·입사일
select name as 이름, join_date as 입사일, emp_no as 사번, employment_type as 고용형태
from public.employees
where join_date is not null
order by join_date, sort;
