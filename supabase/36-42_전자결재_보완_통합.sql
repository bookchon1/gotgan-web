-- ===== 36_leave_from_approval =====
-- 36. 휴가원(전자결재 양식) 승인 시 휴가 기록(leave_records) 자동 생성 — 멱등
-- 일정표·휴가현황에 표시되고 연차 사용 일수에 반영된다. 승인이 취소되면 기록도 삭제.
alter table public.leave_records add column if not exists approval_id uuid references public.approvals(id) on delete cascade;
create or replace function public.leave_from_approval() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_type text; v_start date; v_end date; v_days numeric;
begin
  if new.kind <> '휴가' or coalesce(new.memo, '') not like '[양식:휴가원]%' then
    return new;
  end if;
  if new.status = '승인' and old.status is distinct from '승인' then
    v_type  := substring(new.memo from '휴가 종류: ([^\n]+)');
    v_start := substring(new.memo from '기간: ([0-9]{4}-[0-9]{2}-[0-9]{2})')::date;
    v_end   := substring(new.memo from '~ ([0-9]{4}-[0-9]{2}-[0-9]{2})')::date;
    v_days  := coalesce(substring(new.memo from '일수: ([0-9.]+)')::numeric, 1);
    if v_type like '반차%' then v_type := '반차'; end if;
    insert into public.leave_records (employee_id, leave_type, status, start_date, end_date, days, reason, approver, approved_at, approval_id)
    values (new.drafter_id, coalesce(v_type, '연차'), '승인', v_start, coalesce(v_end, v_start), v_days,
            substring(new.memo from E'■ 휴가 사유\n([^\n]+)'), '전자결재 ' || coalesce(new.doc_no, ''), now(), new.id);
  elsif old.status = '승인' and new.status is distinct from '승인' then
    delete from public.leave_records where approval_id = new.id;
  end if;
  return new;
end $$;
drop trigger if exists trg_leave_from_approval on public.approvals;
create trigger trg_leave_from_approval after update of status on public.approvals
  for each row execute function public.leave_from_approval();
-- ===== 37_approval_comment =====
-- 37. 결재 의견(코멘트) — 승인·반려 시 남기는 의견 — 멱등
alter table public.approval_lines add column if not exists comment text;
-- ===== 38_approval_urgent =====
-- 38. 긴급 문서 표시 — 멱등
alter table public.approvals add column if not exists urgent boolean not null default false;
-- ===== 39_approval_line_presets =====
-- 39. 자주 쓰는 결재선 저장 — 멱등
create table if not exists public.approval_line_presets (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.employees(id) on delete cascade,
  name        text not null,
  reviewer_id uuid references public.employees(id) on delete set null,
  approver_id uuid references public.employees(id) on delete set null,
  cc_ids      uuid[] not null default '{}',
  created_at  timestamptz not null default now()
);
alter table public.approval_line_presets enable row level security;
do $$ begin
  drop policy if exists alp_all on public.approval_line_presets;
  create policy alp_all on public.approval_line_presets for all to authenticated
    using (owner_id = public.app_me()) with check (owner_id = public.app_me());
end $$;
-- ===== 40_approval_agree =====
-- 40. 합의(협조) 결재 역할 추가 + 결재선 저장에 합의자 컬럼 — 멱등 (28번·39번 이후 실행)
alter table public.approval_lines drop constraint if exists approval_lines_role_check;
alter table public.approval_lines
  add constraint approval_lines_role_check
  check (role in ('기안','검토','합의','승인','회계접수','참조'));
alter table public.approval_line_presets add column if not exists agree_id uuid references public.employees(id) on delete set null;
-- ===== 41_approval_delegate =====
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
-- ===== 42_approval_confidential =====
-- 42. 보안 문서 — 기안자와 결재선(검토·합의·승인·참조)에 지정된 사람만 열람 (일반 관리자도 제외) — 멱등
alter table public.approvals add column if not exists confidential boolean not null default false;
do $$ begin
  drop policy if exists ap_read on public.approvals;
  create policy ap_read on public.approvals for select to authenticated
    using (
      (public.app_is_admin() and not confidential)
      or drafter_id = public.app_me()
      or public.app_is_approver_of(approvals.id)
    );
  -- 첨부파일 목록은 '볼 수 있는 문서'의 것만
  drop policy if exists apf_read on public.approval_files;
  create policy apf_read on public.approval_files for select to authenticated
    using (exists (select 1 from public.approvals a where a.id = approval_files.approval_id));
end $$;
notify pgrst, 'reload schema';
