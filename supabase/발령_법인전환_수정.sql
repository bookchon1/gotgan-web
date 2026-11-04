-- =====================================================================
-- 곳간 — 김도래·김성헌 법인전환 발령 기록 수정 (하드코딩 날짜 제거, 실제 입사일 기준)
--
-- 배경:
--  - 법인 개업일: 2025-01-10
--  - 직원 법인 전환일(급여대장상, = 현재 입사일): employees.join_date 값 그대로 사용
--  - 앞서 잘못 넣은 '최초 입사 2020-01-01' 기록은 삭제(정확한 최초입사일 미정)
--
-- 이 SQL 은 날짜를 하드코딩하지 않고 **현재 employees.join_date** 를 기준으로 맞춘다.
-- (인사관리에서 입사일을 바꿨다면 그 값이 자동 반영됨)
-- 멱등.
-- =====================================================================

-- 1) 잘못 들어간 '최초 입사 2020-01-01' 기록 삭제 (김도래·김성헌)
delete from public.hr_assignments h
 using public.employees e
 where h.employee_id = e.id
   and e.name in ('김도래', '김성헌')
   and h.kind = '입사'
   and h.eff_date = date '2020-01-01'
   and h.detail = '최초 입사';

-- 2) '법인 전환' 발령의 날짜·비고를 현재 입사일(join_date) 기준으로 갱신
update public.hr_assignments h
   set eff_date = e.join_date,
       detail   = '법인 전환 — 법인 입사일 재설정',
       note     = '법인 개업 2025-01-10 · 급여대장상 법인 전환일 ' || to_char(e.join_date, 'YYYY-MM-DD') || ' (연차 부여는 법인 입사일 기준)'
  from public.employees e
 where h.employee_id = e.id
   and e.name in ('김도래', '김성헌')
   and h.detail like '법인 전환%'
   and e.join_date is not null;

-- 3) '법인 전환' 발령이 아예 없으면 현재 입사일로 새로 생성
insert into public.hr_assignments (employee_id, eff_date, kind, detail, note)
select e.id, e.join_date, '기타', '법인 전환 — 법인 입사일 재설정',
       '법인 개업 2025-01-10 · 급여대장상 법인 전환일 ' || to_char(e.join_date, 'YYYY-MM-DD') || ' (연차 부여는 법인 입사일 기준)'
from public.employees e
where e.name in ('김도래', '김성헌')
  and e.join_date is not null
  and not exists (
    select 1 from public.hr_assignments h
    where h.employee_id = e.id and h.detail like '법인 전환%'
  );

-- 확인
select e.name as 이름, e.join_date as 현재입사일, h.eff_date as 발령일, h.kind as 종류, h.detail as 내용, h.note as 비고
from public.hr_assignments h join public.employees e on e.id = h.employee_id
where e.name in ('김도래', '김성헌')
order by e.name, h.eff_date;
