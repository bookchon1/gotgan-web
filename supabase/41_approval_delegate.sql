-- 41. 대결(위임) — 부재 기간 동안 다른 사람이 대신 결재 — 멱등 (28·29번 이후 실행)
create table if not exists public.approval_delegates (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.employees(id) on delete cascade,   -- 위임하는 사람
  delegate_id uuid not null references public.employees(id) on delete cascade,   -- 대신 결재하는 사람
  from_date   date not null,
  to_date     date not null,
  reason      text,
  created_at  timestamptz not null default now(),
  check (owner_id <> delegate_id),
  check (to_date >= from_date)
);
alter table public.approval_delegates enable row level security;

alter table public.approval_lines add column if not exists acted_by uuid references public.employees(id) on delete set null;

-- 지금 내가 owner 의 대결자인가 (기간 내)
create or replace function public.app_is_delegate_of(p_owner uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from public.approval_delegates d
    where d.owner_id = p_owner and d.delegate_id = public.app_me()
      and current_date between d.from_date and d.to_date
  )
$$;
grant execute on function public.app_is_delegate_of(uuid) to authenticated;

create or replace function public.app_is_approver_of(p_appr uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from public.approval_lines l
    where l.approval_id = p_appr
      and (l.approver_id = public.app_me() or public.app_is_delegate_of(l.approver_id))
  )
$$;

do $$ begin
  drop policy if exists ad_sel on public.approval_delegates;
  create policy ad_sel on public.approval_delegates for select to authenticated
    using (owner_id = public.app_me() or delegate_id = public.app_me() or public.app_is_admin());
  drop policy if exists ad_ins on public.approval_delegates;
  create policy ad_ins on public.approval_delegates for insert to authenticated
    with check (owner_id = public.app_me());
  drop policy if exists ad_del on public.approval_delegates;
  create policy ad_del on public.approval_delegates for delete to authenticated
    using (owner_id = public.app_me() or public.app_is_admin());

  drop policy if exists apl_upd on public.approval_lines;
  create policy apl_upd on public.approval_lines for update to authenticated
    using (
      public.app_is_admin()
      or approver_id = public.app_me()
      or public.app_is_delegate_of(approver_id)
      or public.app_is_drafter_of(approval_lines.approval_id)
    )
    with check (true);
end $$;

notify pgrst, 'reload schema';
