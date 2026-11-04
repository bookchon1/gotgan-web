-- =====================================================================
-- 곳간 — 김도래·김성헌 법인 전환 인사발령 기록
--
-- 두 분은 2020.01.01 최초 입사 후, 2025.02.24 법인 전환으로 (법인)입사일이 재설정됨.
-- 입사일(employees.join_date=2025.02.24)은 그대로 두고(연차 부여 기준),
-- 인사발령 이력(hr_assignments)에 '최초 입사'와 '법인 전환'을 기록한다.
--
-- 멱등: 같은 직원·같은 발령일·같은 종류가 있으면 넣지 않음.
-- 전제: 인사관리_확장_상세인사카드.sql 실행(hr_assignments 존재)된 상태.
-- =====================================================================

do $$
declare
  v_min date := date '2020-01-01';   -- 최초 입사일
  v_conv date := date '2025-02-24';  -- 법인 전환일(현재 입사일)
begin
  -- 1) 최초 입사 기록
  insert into public.hr_assignments (employee_id, eff_date, kind, detail, note)
  select e.id, v_min, '입사', '최초 입사', '개인사업자 시기 최초 입사'
  from public.employees e
  where e.name in ('김도래', '김성헌')
    and not exists (
      select 1 from public.hr_assignments h
      where h.employee_id = e.id and h.eff_date = v_min and h.kind = '입사'
    );

  -- 2) 법인 전환 기록 (현재 입사일 기준점)
  insert into public.hr_assignments (employee_id, eff_date, kind, detail, note)
  select e.id, v_conv, '기타', '법인 전환 — 법인 입사일 재설정', '최초 입사 2020-01-01 → 법인 전환 2025-02-24 (연차 부여는 법인 입사일 기준)'
  from public.employees e
  where e.name in ('김도래', '김성헌')
    and not exists (
      select 1 from public.hr_assignments h
      where h.employee_id = e.id and h.eff_date = v_conv and h.detail like '법인 전환%'
    );
end $$;

-- 확인: 두 분 발령 이력
select e.name as 이름, h.eff_date as 발령일, h.kind as 종류, h.detail as 내용, h.note as 비고
from public.hr_assignments h join public.employees e on e.id = h.employee_id
where e.name in ('김도래', '김성헌')
order by e.name, h.eff_date;
