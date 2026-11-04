-- =====================================================================
-- 곳간 — 노션 [직원 연차 현황]의 '이월' 연차를 앱에 반영
--
-- 노션 확인 결과 이월이 있는 직원: 이윤정 3일, 유선영 4일 (그 외는 0)
--
-- 저장 방식: leave_records 에 '이월' 전용 레코드 1건을 직원별로 넣는다.
--   - leave_type='이월', days=0(사용 집계에 영향 없음), carry_over=N, status='승인'
--   - start_date = 올해 1월 1일(이월 기준). 앱 휴가현황은 직원별 carry_over 최대값을 '이월'로 표시.
--   - '이월' 유형은 연차 차감(ANNUAL_DEDUCT)에 포함되지 않아 사용에서 빠진다.
-- 멱등: 같은 직원·같은 '이월' 레코드가 있으면 값만 갱신(중복 생성 안 함).
-- =====================================================================

do $$
declare
  v_year_start date := date_trunc('year', now())::date;  -- 2026-01-01
begin
  -- 대상: (직원이름, 이월일수)
  -- 이윤정 3, 유선영 4
  -- 1) 기존 '이월' 레코드가 있으면 값 갱신
  update public.leave_records lr
     set carry_over = v.carry
    from (values ('이윤정', 3::numeric), ('유선영', 4::numeric)) as v(nm, carry)
    join public.employees e on e.name = v.nm
   where lr.employee_id = e.id and lr.leave_type = '이월';

  -- 2) 없으면 새로 삽입
  insert into public.leave_records
    (employee_id, leave_type, status, start_date, end_date, days, carry_over, reason)
  select e.id, '이월', '승인', v_year_start, v_year_start, 0, v.carry, '전년도 이월(노션 반영)'
  from (values ('이윤정', 3::numeric), ('유선영', 4::numeric)) as v(nm, carry)
  join public.employees e on e.name = v.nm
  where not exists (
    select 1 from public.leave_records lr
    where lr.employee_id = e.id and lr.leave_type = '이월'
  );
end $$;

-- 확인: 사람별 이월 값
select e.name as 직원, lr.carry_over as 이월
from public.leave_records lr join public.employees e on e.id = lr.employee_id
where lr.leave_type = '이월'
order by e.name;
