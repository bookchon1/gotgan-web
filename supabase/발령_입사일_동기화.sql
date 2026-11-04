-- =====================================================================
-- 곳간 — 발령이력 '입사' 날짜를 현재 입사일(join_date)과 일치시키기 (1회성)
--
-- 증상: 인사관리에서 입사일을 수정했는데, 발령이력의 '입사' 기록 날짜가 예전 그대로.
-- 원인: 과거에 자동 생성된 '입사' 발령이 수정 전 입사일에 묶여 있었음.
--   (앞으로는 앱에서 입사일 수정 시 자동 반영됨 — 이 SQL은 그 이전 데이터 보정용)
--
-- 안전장치: '입사' 발령이 정확히 1건인 직원만 보정한다.
--   → 김도래·김성헌처럼 '입사'가 2건(최초입사+법인입사)인 경우는 건드리지 않음.
-- 멱등: 이미 맞는 건 변화 없음.
-- =====================================================================

update public.hr_assignments h
   set eff_date = e.join_date
  from public.employees e
 where h.employee_id = e.id
   and h.kind = '입사'
   and e.join_date is not null
   and h.eff_date <> e.join_date
   and (
     select count(*) from public.hr_assignments h2
     where h2.employee_id = e.id and h2.kind = '입사'
   ) = 1;   -- 입사 발령이 1건인 직원만

-- 확인: 직원별 입사일 vs 발령 '입사' 날짜
select e.name as 이름, e.join_date as 입사일,
       (select min(h.eff_date) from public.hr_assignments h
        where h.employee_id = e.id and h.kind = '입사') as 발령_입사일,
       (select count(*) from public.hr_assignments h
        where h.employee_id = e.id and h.kind = '입사') as 입사발령수
from public.employees e
where e.status = '재직'
order by e.sort;
