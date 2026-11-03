-- 일용직 근무기록 데모 데이터 (labor_workers + labor_attendance)
-- add_labor_attendance.sql 적용 후 실행하세요.
do $$
declare
  w_park uuid; w_choi uuid; w_kim uuid;
  proj_samguk uuid;
begin
  select id into proj_samguk from public.art_projects where name like '삼국유사%' limit 1;

  insert into public.labor_workers (name, day_rate, phone) values
    ('박작업', 180000, '010-0000-0001') returning id into w_park;
  insert into public.labor_workers (name, day_rate, phone) values
    ('최보조', 130000, '010-0000-0002') returning id into w_choi;
  insert into public.labor_workers (name, day_rate, phone) values
    ('김일용', 150000, '010-0000-0003') returning id into w_kim;

  insert into public.labor_attendance (worker_id, work_date, check_in, check_out, next_day, break_min, project_id, place) values
    (w_park, date '2026-10-27', time '09:00', time '18:00', false, 60, proj_samguk, '삼국유사 현장'),
    (w_park, date '2026-10-28', time '09:00', time '19:30', false, 60, proj_samguk, '삼국유사 현장'),
    (w_choi, date '2026-10-28', time '09:00', time '18:00', false, 60, proj_samguk, '삼국유사 현장'),
    (w_kim,  date '2026-10-28', time '09:00', time '18:00', false, 60, proj_samguk, '삼국유사 현장'),
    (w_park, date '2026-10-30', time '08:30', time '17:30', false, 60, proj_samguk, '삼국유사 현장');
end $$;
