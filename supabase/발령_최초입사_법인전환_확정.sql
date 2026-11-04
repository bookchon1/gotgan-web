-- =====================================================================
-- 곳간 — 김도래·김성헌: 입사일=최초입사일, 법인전환은 발령이력에만 (확정)
--
-- 원칙: 입사일(join_date) = 최초 입사일. 법인 전환(2025-02-24)은 발령이력에 기재.
--       연차 부여는 입사일(=최초입사) 기준 자동계산(근속 전체 인정).
--
-- 확정 날짜:
--   · 김도래 최초 입사: 2012-02-27
--   · 김성헌 최초 입사: 2018-04-01
--   · 법인 개업: 2025-01-10 / 급여대장상 법인 전환: 2025-02-24
-- 멱등.
-- =====================================================================

-- 1) 입사일을 '최초 입사일'로 확정
update public.employees set join_date = date '2012-02-27' where name = '김도래';
update public.employees set join_date = date '2018-04-01' where name = '김성헌';

-- 2) '입사' 발령도 최초 입사일로 맞춤(없으면 생성)
--    먼저 기존 '입사' 발령을 각자의 최초입사일로 이동(입사 발령이 1건인 경우)
update public.hr_assignments h
   set eff_date = e.join_date, detail = coalesce(nullif(h.detail,''),'최초 입사')
  from public.employees e
 where h.employee_id = e.id and e.name in ('김도래','김성헌') and h.kind = '입사'
   and (select count(*) from public.hr_assignments h2
        where h2.employee_id = e.id and h2.kind = '입사') = 1;
--    '입사' 발령이 아예 없으면 생성
insert into public.hr_assignments (employee_id, eff_date, kind, detail, note)
select e.id, e.join_date, '입사', '최초 입사', '개인사업자 시기 최초 입사'
from public.employees e
where e.name in ('김도래','김성헌') and e.join_date is not null
  and not exists (select 1 from public.hr_assignments h
                  where h.employee_id = e.id and h.kind='입사');

-- 3) '법인 전환' 발령은 2025-02-24 로 (발령이력에만 기재)
update public.hr_assignments h
   set eff_date = date '2025-02-24',
       detail   = '법인 전환 — 법인 소속 전환',
       note     = '법인 개업 2025-01-10 · 급여대장상 법인 전환일 2025-02-24 (입사일·연차는 최초 입사일 기준)'
  from public.employees e
 where h.employee_id = e.id and e.name in ('김도래','김성헌') and h.detail like '법인 전환%';
insert into public.hr_assignments (employee_id, eff_date, kind, detail, note)
select e.id, date '2025-02-24', '기타', '법인 전환 — 법인 소속 전환',
       '법인 개업 2025-01-10 · 급여대장상 법인 전환일 2025-02-24 (입사일·연차는 최초 입사일 기준)'
from public.employees e
where e.name in ('김도래','김성헌')
  and not exists (select 1 from public.hr_assignments h
                  where h.employee_id = e.id and h.detail like '법인 전환%');

-- 4) 잘못 들어간 2020-01-01 발령이 있으면 삭제
delete from public.hr_assignments h using public.employees e
 where h.employee_id = e.id and e.name in ('김도래','김성헌')
   and h.kind='입사' and h.eff_date = date '2020-01-01';

-- 확인
select e.name as 이름, e.join_date as 입사일_최초, h.eff_date as 발령일, h.kind as 종류, h.detail as 내용, h.note as 비고
from public.hr_assignments h join public.employees e on e.id = h.employee_id
where e.name in ('김도래','김성헌')
order by e.name, h.eff_date;
