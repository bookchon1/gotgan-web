-- 34. 연장근무 적립 · 대체휴무 사용 (정규직, 1:1 적립, 소멸기한 없음, 승인자는 신청자가 지정) — 멱등
create table if not exists public.comp_time (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  kind        text not null check (kind in ('적립','사용')),   -- 적립=연장근무, 사용=대체휴무
  work_date   date not null,
  start_time  time,
  end_time    time,
  hours       numeric(6,2) not null check (hours > 0),
  reason      text,
  approver_id uuid references public.employees(id) on delete set null,
  status      text not null default '신청' check (status in ('신청','승인','반려')),
  decided_at  timestamptz,
  created_at  timestamptz not null default now(),
  check (approver_id is null or approver_id <> employee_id)
);
create index if not exists comp_time_emp_idx on public.comp_time(employee_id, work_date);
create index if not exists comp_time_appr_idx on public.comp_time(approver_id, status);

create or replace function public.app_is_regular() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.employees e where e.id = public.app_me() and e.employment_type = '정규직')
$$;
grant execute on function public.app_is_regular() to authenticated;

alter table public.comp_time enable row level security;

do $$ begin
  drop policy if exists ct_sel on public.comp_time;
  create policy ct_sel on public.comp_time for select to authenticated
    using (public.app_is_admin() or employee_id = public.app_me() or approver_id = public.app_me());

  drop policy if exists ct_ins on public.comp_time;
  create policy ct_ins on public.comp_time for insert to authenticated
    with check (employee_id = public.app_me() and status = '신청' and public.app_is_regular());

  drop policy if exists ct_upd on public.comp_time;
  create policy ct_upd on public.comp_time for update to authenticated
    using (public.app_is_admin() or (status = '신청' and (employee_id = public.app_me() or approver_id = public.app_me())))
    with check (public.app_is_admin() or employee_id = public.app_me() or approver_id = public.app_me());

  drop policy if exists ct_del on public.comp_time;
  create policy ct_del on public.comp_time for delete to authenticated
    using (public.app_is_admin() or (employee_id = public.app_me() and status = '신청'));
end $$;

notify pgrst, 'reload schema';
