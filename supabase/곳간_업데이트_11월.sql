-- ============================================================
--  곳간(BOOKCHON WORKSPACE) · 11월 업데이트 적용 SQL
--  Supabase → SQL Editor 에 "통째로 붙여넣고" 한 번 실행하세요.
--  (이미 schema.sql / rls.sql 를 적용한 운영 DB 기준, 추가·수정분만 모았습니다)
--
--  포함 내용
--   1) 문서보관 RLS 무한재귀(42P17) 수정  — 문서가 0개로 나오던 문제
--   2) 급여명세서 "수신 문서함" 지원         — 직원이 본인 명세서 월을 볼 수 있게
--   3) 노무관리 일용직 "근무 기록" 테이블    — labor_workers / labor_attendance (+데모)
-- ============================================================


-- ────────────────────────────────────────────────
-- 1) 문서보관 RLS 무한재귀 수정
--    documents ↔ document_shares 가 서로를 참조해 재귀 → SECURITY DEFINER 헬퍼로 분리
-- ────────────────────────────────────────────────
create or replace function public.app_doc_shared_to_me(p_doc uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from public.document_shares s
    where s.document_id = p_doc and s.employee_id = public.app_me()
  )
$$;
create or replace function public.app_owns_doc(p_doc uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from public.documents d
    where d.id = p_doc and d.owner_id = public.app_me()
  )
$$;
grant execute on function public.app_doc_shared_to_me(uuid), public.app_owns_doc(uuid) to authenticated;

do $$ begin
  drop policy if exists doc_read on public.documents;
  create policy doc_read on public.documents for select to authenticated
    using (
      public.app_is_admin()
      or share_scope = '전사'
      or owner_id = public.app_me()
      or (share_scope = '선택' and public.app_doc_shared_to_me(id))
    );

  drop policy if exists ds_all on public.document_shares;
  create policy ds_all on public.document_shares for all to authenticated
    using (public.app_is_admin() or public.app_owns_doc(document_id))
    with check (public.app_is_admin() or public.app_owns_doc(document_id));
end $$;


-- ────────────────────────────────────────────────
-- 2) 급여명세서 "수신 문서함"
--    직원 본인이 자기 급여명세가 속한 귀속월(ym)을 읽을 수 있게 payroll_runs 정책 확장
--    (타인의 급여 수치는 payslips RLS 가 계속 차단)
-- ────────────────────────────────────────────────
do $$ begin
  drop policy if exists pr_read on public.payroll_runs;
  create policy pr_read on public.payroll_runs for select to authenticated
    using (
      public.app_is_payroll_mgr()
      or exists(
        select 1 from public.payslips p
        where p.run_id = payroll_runs.id and p.employee_id = public.app_me()
      )
    );
end $$;


-- ────────────────────────────────────────────────
-- 3) 노무관리 · 일용직 근무 기록
-- ────────────────────────────────────────────────
create table if not exists public.labor_workers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  day_rate    bigint not null default 0,
  phone       text,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
create table if not exists public.labor_attendance (
  id          uuid primary key default gen_random_uuid(),
  worker_id   uuid not null references public.labor_workers(id) on delete cascade,
  work_date   date not null,
  check_in    time,
  check_out   time,
  next_day    boolean not null default false,
  break_min   integer not null default 0,
  project_id  uuid references public.art_projects(id) on delete set null,
  place       text,
  created_at  timestamptz not null default now()
);
create index if not exists idx_labor_att_date   on public.labor_attendance (work_date desc);
create index if not exists idx_labor_att_worker on public.labor_attendance (worker_id);

create or replace function public.labor_work_hours(
  p_in time, p_out time, p_next boolean, p_break int
) returns numeric language sql immutable as $$
  select case
    when p_in is null or p_out is null then null
    else greatest(0,
      ( extract(epoch from p_out) - extract(epoch from p_in)
        + case when p_next then 86400 else 0 end
        - coalesce(p_break,0) * 60 ) / 3600.0)
  end
$$;

alter table public.labor_workers     enable row level security;
alter table public.labor_attendance  enable row level security;
do $$ begin
  drop policy if exists lw_read on public.labor_workers;
  create policy lw_read on public.labor_workers for select to authenticated
    using (public.app_is_active_employee());
  drop policy if exists lw_write on public.labor_workers;
  create policy lw_write on public.labor_workers for all to authenticated
    using (public.app_is_payroll_mgr()) with check (public.app_is_payroll_mgr());

  drop policy if exists la_read on public.labor_attendance;
  create policy la_read on public.labor_attendance for select to authenticated
    using (public.app_is_active_employee());
  drop policy if exists la_write on public.labor_attendance;
  create policy la_write on public.labor_attendance for all to authenticated
    using (public.app_is_payroll_mgr()) with check (public.app_is_payroll_mgr());
end $$;
grant execute on function public.labor_work_hours(time, time, boolean, int) to authenticated;

-- 일용직 데모 작업자 + 근무기록 (원치 않으면 이 블록은 건너뛰어도 됩니다)
do $$
declare w_park uuid; w_choi uuid; w_kim uuid; proj_samguk uuid;
begin
  if not exists (select 1 from public.labor_workers) then
    select id into proj_samguk from public.art_projects where name like '삼국유사%' limit 1;
    insert into public.labor_workers (name, day_rate, phone) values ('박작업',180000,'010-0000-0001') returning id into w_park;
    insert into public.labor_workers (name, day_rate, phone) values ('최보조',130000,'010-0000-0002') returning id into w_choi;
    insert into public.labor_workers (name, day_rate, phone) values ('김일용',150000,'010-0000-0003') returning id into w_kim;
    insert into public.labor_attendance (worker_id, work_date, check_in, check_out, next_day, break_min, project_id, place) values
      (w_park, date '2026-10-27', time '09:00', time '18:00', false, 60, proj_samguk, '삼국유사 현장'),
      (w_park, date '2026-10-28', time '09:00', time '19:30', false, 60, proj_samguk, '삼국유사 현장'),
      (w_choi, date '2026-10-28', time '09:00', time '18:00', false, 60, proj_samguk, '삼국유사 현장'),
      (w_kim,  date '2026-10-28', time '09:00', time '18:00', false, 60, proj_samguk, '삼국유사 현장'),
      (w_park, date '2026-10-30', time '08:30', time '17:30', false, 60, proj_samguk, '삼국유사 현장');
  end if;
end $$;

-- 완료. 적용 후 앱을 새로고침하면 문서보관·수신문서함·근무기록이 정상 동작합니다.
