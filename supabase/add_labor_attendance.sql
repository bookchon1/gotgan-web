-- ============================================================
-- 노무관리 · 일용직 근무기록 (현장 작업자)
--   · labor_workers     : 일용직 작업자 명부 (이름·일당)
--   · labor_attendance  : 근무기록 (근무일·출퇴근·휴게·장소) — 익일 퇴근 지원
-- 이미 base schema/rls 를 적용한 환경에 "추가"로 실행하세요.
-- ============================================================

-- 작업자 명부 ------------------------------------------------
create table if not exists public.labor_workers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  day_rate    bigint not null default 0,         -- 기본 일당(원)
  phone       text,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- 근무기록 --------------------------------------------------
create table if not exists public.labor_attendance (
  id          uuid primary key default gen_random_uuid(),
  worker_id   uuid not null references public.labor_workers(id) on delete cascade,
  work_date   date not null,
  check_in    time,                               -- 출근
  check_out   time,                               -- 퇴근 (익일이면 next_day=true)
  next_day    boolean not null default false,     -- 퇴근이 자정 초과(익일)인지
  break_min   integer not null default 0,         -- 휴게(분)
  project_id  uuid references public.art_projects(id) on delete set null,
  place       text,                               -- 근무 장소(사업 현장 등)
  created_at  timestamptz not null default now()
);
create index if not exists idx_labor_att_date on public.labor_attendance (work_date desc);
create index if not exists idx_labor_att_worker on public.labor_attendance (worker_id);

-- 실근무 시간(시간 단위) 계산 헬퍼: 익일퇴근·휴게 반영 ------
create or replace function public.labor_work_hours(
  p_in time, p_out time, p_next boolean, p_break int
) returns numeric language sql immutable as $$
  select case
    when p_in is null or p_out is null then null
    else greatest(
      0,
      ( extract(epoch from p_out) - extract(epoch from p_in)
        + case when p_next then 86400 else 0 end
        - coalesce(p_break,0) * 60
      ) / 3600.0
    )
  end
$$;

-- RLS ------------------------------------------------------
alter table public.labor_workers     enable row level security;
alter table public.labor_attendance  enable row level security;

do $$ begin
  -- 작업자 명부: 재직자 조회, 노무/관리자 편집
  drop policy if exists lw_read on public.labor_workers;
  create policy lw_read on public.labor_workers for select to authenticated
    using (public.app_is_active_employee());
  drop policy if exists lw_write on public.labor_workers;
  create policy lw_write on public.labor_workers for all to authenticated
    using (public.app_is_payroll_mgr())
    with check (public.app_is_payroll_mgr());

  -- 근무기록: 재직자 조회, 노무/관리자 편집
  drop policy if exists la_read on public.labor_attendance;
  create policy la_read on public.labor_attendance for select to authenticated
    using (public.app_is_active_employee());
  drop policy if exists la_write on public.labor_attendance;
  create policy la_write on public.labor_attendance for all to authenticated
    using (public.app_is_payroll_mgr())
    with check (public.app_is_payroll_mgr());
end $$;

grant execute on function public.labor_work_hours(time, time, boolean, int) to authenticated;
