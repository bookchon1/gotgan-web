-- 유선영(미술, 선임연구원, 입사 2025-04-07) 재등록
with ins as (
  insert into public.employees (name, dept_key, title, join_ym, join_date, phone, role, status)
  select '유선영', 'art', '선임연구원', '2025.04', date '2025-04-07', '010-2173-6006', 'user', '재직'
  where not exists (select 1 from public.employees where name = '유선영')
  returning id
)
insert into public.hr_assignments (employee_id, eff_date, kind, detail)
select id, date '2025-04-07', '입사', '입사' from ins;

notify pgrst, 'reload schema';

-- 확인
select id, name, dept_key, title, join_date, phone, status from public.employees where name = '유선영';
