-- 유선영 복구 2차: 직원 상태(퇴직 2026-10-31) 보정 + 2026년 8·9·10월 급여명세 재입력
-- (31번을 실행했든 안 했든 안전하게 다시 실행 가능)

-- 1) 직원이 없으면 등록, 있으면 퇴직 정보 보정
insert into public.employees (name, dept_key, title, join_ym, join_date, phone, role, status, leave_date)
select '유선영', 'art', '선임연구원', '2025.04', date '2025-04-07', '010-2173-6006', 'user', '퇴직', date '2026-10-31'
where not exists (select 1 from public.employees where name = '유선영');

update public.employees
   set dept_key = 'art', title = '선임연구원', join_ym = '2025.04', join_date = date '2025-04-07',
       phone = '010-2173-6006', status = '퇴직', leave_date = date '2026-10-31'
 where name = '유선영';

insert into public.hr_assignments (employee_id, eff_date, kind, detail)
select e.id, date '2025-04-07', '입사', '입사' from public.employees e
 where e.name = '유선영'
   and not exists (select 1 from public.hr_assignments h where h.employee_id = e.id and h.kind = '입사');

-- 2) 급여명세 (급여대장 PDF 기준)
--    allowances = 상여+식대+고정연장+고정연차(+초과근로), d_other = 정산·선지급 공제 합
with v(ym, base_pay, allowances, d_pension, d_health, d_ltc, d_employment, d_income_tax, d_local_tax, d_other, pay_date) as (
  values
  ('2026-08', 2326608, 1014842, 133990, 102450, 13460, 28270,      0,       0,  300000, date '2026-09-04'),
  ('2026-09', 2326608, 914842, 133990, 102450, 13460, 27370,  77770,    7770,  200000, date '2026-10-06'),
  ('2026-10', 2326608, 714842, 133990, 102450, 13460, 25570, -127640, -12740, -191790, date '2026-11-05')
)
insert into public.payslips (run_id, employee_id, base_pay, allowances, d_pension, d_health, d_ltc, d_employment, d_income_tax, d_local_tax, d_other, pay_date)
select r.id, e.id, v.base_pay, v.allowances, v.d_pension, v.d_health, v.d_ltc, v.d_employment, v.d_income_tax, v.d_local_tax, v.d_other, v.pay_date
  from v
  join public.payroll_runs r on r.ym = v.ym
  join public.employees e on e.name = '유선영'
on conflict (run_id, employee_id) do update set
  base_pay = excluded.base_pay, allowances = excluded.allowances, d_pension = excluded.d_pension,
  d_health = excluded.d_health, d_ltc = excluded.d_ltc, d_employment = excluded.d_employment,
  d_income_tax = excluded.d_income_tax, d_local_tax = excluded.d_local_tax, d_other = excluded.d_other,
  pay_date = excluded.pay_date;

notify pgrst, 'reload schema';

-- 3) 확인: 지급합계 / 공제합계 / 실지급액이 PDF와 같아야 함
--    8월 3,341,450 / 578,170 / 2,763,280   9월 3,241,450 / 562,810 / 2,678,640   10월 3,041,450 / -56,700 / 3,098,150
select r.ym, (p.base_pay + p.allowances) as 지급합계, p.deductions as 공제합계, p.net_pay as 실지급액
  from public.payslips p
  join public.payroll_runs r on r.id = p.run_id
  join public.employees e on e.id = p.employee_id
 where e.name = '유선영'
 order by r.ym;
