-- =====================================================================
-- 곳간 — 김도래·김성헌 법인전환 날짜 2025-02-24 로 확정 (입사일·발령·비고 모두)
--
-- 확정 기준:
--  - 법인 개업일: 2025-01-10
--  - 급여대장상 법인 전환일 = 입사일 = 2025-02-24  (연차 부여 기준)
--
-- 이 SQL 은 날짜를 명시적으로 2025-02-24 로 고정한다(추론/현재값 의존 X).
-- 멱등: 여러 번 실행해도 결과 동일.
-- =====================================================================

-- 1) 입사일을 2025-02-24 로 확정
update public.employees
   set join_date = date '2025-02-24'
 where name in ('김도래', '김성헌');

-- 2) 잘못된 '최초 입사 2020-01-01' 발령 삭제
delete from public.hr_assignments h
 using public.employees e
 where h.employee_id = e.id
   and e.name in ('김도래', '김성헌')
   and h.kind = '입사'
   and h.eff_date = date '2020-01-01';

-- 3) '법인 전환' 발령을 2025-02-24 로 확정(날짜·비고 모두)
update public.hr_assignments h
   set eff_date = date '2025-02-24',
       detail   = '법인 전환 — 법인 입사일 재설정',
       note     = '법인 개업 2025-01-10 · 급여대장상 법인 전환일 2025-02-24 (연차 부여는 법인 입사일 기준)'
  from public.employees e
 where h.employee_id = e.id
   and e.name in ('김도래', '김성헌')
   and h.detail like '법인 전환%';

-- 4) '법인 전환' 발령이 없으면 새로 생성(2025-02-24)
insert into public.hr_assignments (employee_id, eff_date, kind, detail, note)
select e.id, date '2025-02-24', '기타', '법인 전환 — 법인 입사일 재설정',
       '법인 개업 2025-01-10 · 급여대장상 법인 전환일 2025-02-24 (연차 부여는 법인 입사일 기준)'
from public.employees e
where e.name in ('김도래', '김성헌')
  and not exists (
    select 1 from public.hr_assignments h
    where h.employee_id = e.id and h.detail like '법인 전환%'
  );

-- 5) '입사' 발령도 2025-02-24 로 맞춤(현재 입사일과 일치) — 입사 발령이 1건인 경우만
update public.hr_assignments h
   set eff_date = date '2025-02-24'
  from public.employees e
 where h.employee_id = e.id
   and e.name in ('김도래', '김성헌')
   and h.kind = '입사'
   and (select count(*) from public.hr_assignments h2
        where h2.employee_id = e.id and h2.kind = '입사') = 1;

-- 확인
select e.name as 이름, e.join_date as 입사일, h.eff_date as 발령일, h.kind as 종류, h.detail as 내용, h.note as 비고
from public.hr_assignments h join public.employees e on e.id = h.employee_id
where e.name in ('김도래', '김성헌')
order by e.name, h.eff_date;
