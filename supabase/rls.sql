-- =====================================================================
-- 곳간 — Row Level Security (RLS) + 권한 헬퍼
-- schema.sql 다음에 실행하세요.
--
-- 핵심 원칙:
--  · 모든 접근은 로그인(authenticated) 기준. anon 전면개방 안 함.
--  · 정책 안에서 employees/admin_grants 를 '직접' 조회하면 무한재귀(42P17).
--    → SECURITY DEFINER 헬퍼 함수로 우회.
--  · 급여·전표 등 민감 쓰기는 정책을 열지 않고 RPC(functions.sql)로만.
--  · RLS 는 명시적 GRANT 가 선행되어야 동작.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. GRANT (RLS 작동 전제)
-- ---------------------------------------------------------------------
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
-- 이후 생성 테이블 기본 권한
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant usage, select on sequences to authenticated;

-- ---------------------------------------------------------------------
-- 1. SECURITY DEFINER 헬퍼 (RLS 우회로 재귀 방지)
-- ---------------------------------------------------------------------

-- 내 직원 레코드 id
create or replace function public.app_me()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.employees
  where auth_user_id = auth.uid() and status = '재직'
  limit 1
$$;

-- 관리자 여부
create or replace function public.app_is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from public.employees
    where auth_user_id = auth.uid() and role = 'admin' and status = '재직'
  )
$$;

-- 영역별 담당 권한 (hr/labor/accounting)
create or replace function public.app_has_grant(p_area text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(
    select 1
    from public.employees e
    join public.admin_grants g on g.employee_id = e.id
    where e.auth_user_id = auth.uid() and e.status = '재직' and g.area = p_area
  )
$$;

-- 재직 직원 여부
create or replace function public.app_is_active_employee()
returns boolean language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from public.employees
    where auth_user_id = auth.uid() and status = '재직'
  )
$$;

-- 급여 담당 = labor 권한 또는 is_mgmt
create or replace function public.app_is_payroll_mgr()
returns boolean language sql stable security definer set search_path = public as $$
  select public.app_has_grant('labor') or exists(
    select 1 from public.employees
    where auth_user_id = auth.uid() and is_mgmt and status='재직'
  )
$$;

-- 회계 담당 = accounting 권한 또는 is_mgmt
create or replace function public.app_is_accounting_mgr()
returns boolean language sql stable security definer set search_path = public as $$
  select public.app_has_grant('accounting') or exists(
    select 1 from public.employees
    where auth_user_id = auth.uid() and is_mgmt and status='재직'
  )
$$;

grant execute on function
  public.app_me(), public.app_is_admin(), public.app_has_grant(text),
  public.app_is_active_employee(), public.app_is_payroll_mgr(), public.app_is_accounting_mgr()
  to authenticated;

-- ---------------------------------------------------------------------
-- 2. RLS 활성화
-- ---------------------------------------------------------------------
alter table public.businesses       enable row level security;
alter table public.departments      enable row level security;
alter table public.employees        enable row level security;
alter table public.admin_grants     enable row level security;
alter table public.permissions      enable row level security;
alter table public.work_tasks       enable row level security;
alter table public.art_projects     enable row level security;
alter table public.art_budget       enable row level security;
alter table public.budget_changes   enable row level security;
alter table public.budget_receipts  enable row level security;
alter table public.project_steps    enable row level security;
alter table public.step_comments    enable row level security;
alter table public.advisors         enable row level security;
alter table public.acct_tx          enable row level security;
alter table public.acct_cards       enable row level security;
alter table public.partners         enable row level security;
alter table public.payroll_runs     enable row level security;
alter table public.payslips         enable row level security;
alter table public.leave_records    enable row level security;
alter table public.attendance       enable row level security;
alter table public.approvals        enable row level security;
alter table public.approval_lines   enable row level security;
alter table public.documents        enable row level security;
alter table public.document_shares  enable row level security;
alter table public.events           enable row level security;
alter table public.meetings         enable row level security;
alter table public.audit_log        enable row level security;

-- ---------------------------------------------------------------------
-- 3. 정책
--   (멱등 실행 위해 drop policy if exists 선행)
-- ---------------------------------------------------------------------

-- 참조 테이블: 로그인하면 조회, 변경은 관리자
do $$ begin
  -- businesses / departments
  drop policy if exists ref_read_biz on public.businesses;
  create policy ref_read_biz on public.businesses for select to authenticated using (true);
  drop policy if exists ref_write_biz on public.businesses;
  create policy ref_write_biz on public.businesses for all to authenticated
    using (public.app_is_admin()) with check (public.app_is_admin());

  drop policy if exists ref_read_dept on public.departments;
  create policy ref_read_dept on public.departments for select to authenticated using (true);
  drop policy if exists ref_write_dept on public.departments;
  create policy ref_write_dept on public.departments for all to authenticated
    using (public.app_is_admin()) with check (public.app_is_admin());
end $$;

-- employees: 재직자는 명부 조회 가능, 변경은 관리자(또는 hr 담당)
do $$ begin
  drop policy if exists emp_read on public.employees;
  create policy emp_read on public.employees for select to authenticated
    using (public.app_is_active_employee());
  drop policy if exists emp_write on public.employees;
  create policy emp_write on public.employees for all to authenticated
    using (public.app_is_admin() or public.app_has_grant('hr'))
    with check (public.app_is_admin() or public.app_has_grant('hr'));
end $$;

-- admin_grants / permissions: 관리자만
do $$ begin
  drop policy if exists grants_admin on public.admin_grants;
  create policy grants_admin on public.admin_grants for all to authenticated
    using (public.app_is_admin()) with check (public.app_is_admin());
  drop policy if exists perms_admin on public.permissions;
  create policy perms_admin on public.permissions for all to authenticated
    using (public.app_is_admin()) with check (public.app_is_admin());
end $$;

-- 업무: 재직자 조회, 본인 소유 수정, 관리자 전체
do $$ begin
  drop policy if exists wt_read on public.work_tasks;
  create policy wt_read on public.work_tasks for select to authenticated
    using (public.app_is_active_employee());
  drop policy if exists wt_ins on public.work_tasks;
  create policy wt_ins on public.work_tasks for insert to authenticated
    with check (public.app_is_active_employee());
  drop policy if exists wt_upd on public.work_tasks;
  create policy wt_upd on public.work_tasks for update to authenticated
    using (owner_id = public.app_me() or public.app_is_admin())
    with check (owner_id = public.app_me() or public.app_is_admin());
  drop policy if exists wt_del on public.work_tasks;
  create policy wt_del on public.work_tasks for delete to authenticated
    using (owner_id = public.app_me() or public.app_is_admin());
end $$;

-- 미술 사업 + 하위: 재직자 조회, 변경은 관리자(미술 사업은 전사 공유 성격)
do $$
declare t text;
begin
  foreach t in array array['art_projects','art_budget','budget_changes','budget_receipts',
                           'project_steps','step_comments','advisors'] loop
    execute format('drop policy if exists %I_read on public.%I', t, t);
    execute format('create policy %I_read on public.%I for select to authenticated using (public.app_is_active_employee())', t, t);
    execute format('drop policy if exists %I_write on public.%I', t, t);
    execute format('create policy %I_write on public.%I for all to authenticated using (public.app_is_admin()) with check (public.app_is_admin())', t, t);
  end loop;
end $$;

-- 회계(전표·카드·거래처): 회계 담당·관리자만 (일반 사용자 접근 불가)
do $$
declare t text;
begin
  foreach t in array array['acct_tx','acct_cards','partners'] loop
    execute format('drop policy if exists %I_acct on public.%I', t, t);
    execute format('create policy %I_acct on public.%I for all to authenticated using (public.app_is_accounting_mgr()) with check (public.app_is_accounting_mgr())', t, t);
  end loop;
end $$;

-- 급여: 명세는 본인 또는 급여담당 조회. 쓰기 정책 없음 → RPC 전용.
do $$ begin
  drop policy if exists ps_read on public.payslips;
  create policy ps_read on public.payslips for select to authenticated
    using (employee_id = public.app_me() or public.app_is_payroll_mgr());
  -- payroll_runs: 급여담당만 조회(직원은 명세로 접근). 쓰기 없음.
  drop policy if exists pr_read on public.payroll_runs;
  create policy pr_read on public.payroll_runs for select to authenticated
    using (public.app_is_payroll_mgr());
end $$;

-- 연차: 본인 것 + 급여담당 전체
do $$ begin
  drop policy if exists lv_read on public.leave_records;
  create policy lv_read on public.leave_records for select to authenticated
    using (employee_id = public.app_me() or public.app_is_payroll_mgr());
  drop policy if exists lv_ins on public.leave_records;
  create policy lv_ins on public.leave_records for insert to authenticated
    with check (employee_id = public.app_me() or public.app_is_payroll_mgr());
  drop policy if exists lv_upd on public.leave_records;
  create policy lv_upd on public.leave_records for update to authenticated
    using (public.app_is_payroll_mgr()
           or (employee_id = public.app_me() and status = '신청'))
    with check (public.app_is_payroll_mgr()
           or (employee_id = public.app_me() and status = '신청'));
  drop policy if exists lv_del on public.leave_records;
  create policy lv_del on public.leave_records for delete to authenticated
    using (public.app_is_payroll_mgr()
           or (employee_id = public.app_me() and status = '신청'));
end $$;

-- 근태: 본인 것 + 급여담당
do $$ begin
  drop policy if exists at_read on public.attendance;
  create policy at_read on public.attendance for select to authenticated
    using (employee_id = public.app_me() or public.app_is_payroll_mgr());
  drop policy if exists at_ins on public.attendance;
  create policy at_ins on public.attendance for insert to authenticated
    with check (employee_id = public.app_me());
  drop policy if exists at_upd on public.attendance;
  create policy at_upd on public.attendance for update to authenticated
    using (employee_id = public.app_me() or public.app_is_payroll_mgr())
    with check (employee_id = public.app_me() or public.app_is_payroll_mgr());
end $$;

-- 전자결재: 기안자 본인 + 결재선에 포함된 사람 + 관리자 조회. 기안 생성은 재직자.
do $$ begin
  drop policy if exists ap_read on public.approvals;
  create policy ap_read on public.approvals for select to authenticated
    using (
      public.app_is_admin()
      or drafter_id = public.app_me()
      or exists(select 1 from public.approval_lines l
                where l.approval_id = approvals.id and l.approver_id = public.app_me())
    );
  drop policy if exists ap_ins on public.approvals;
  create policy ap_ins on public.approvals for insert to authenticated
    with check (drafter_id = public.app_me() or public.app_is_admin());
  drop policy if exists ap_upd on public.approvals;
  create policy ap_upd on public.approvals for update to authenticated
    using (
      public.app_is_admin()
      or drafter_id = public.app_me()
      or exists(select 1 from public.approval_lines l
                where l.approval_id = approvals.id and l.approver_id = public.app_me())
    )
    with check (true);

  drop policy if exists apl_read on public.approval_lines;
  create policy apl_read on public.approval_lines for select to authenticated
    using (public.app_is_active_employee());
  drop policy if exists apl_write on public.approval_lines;
  create policy apl_write on public.approval_lines for all to authenticated
    using (
      public.app_is_admin()
      or approver_id = public.app_me()
      or exists(select 1 from public.approvals a
                where a.id = approval_lines.approval_id and a.drafter_id = public.app_me())
    )
    with check (true);
end $$;

-- 문서함: 전사 공유는 모두, 개인은 본인, 선택은 대상자. 관리자 전체.
do $$ begin
  drop policy if exists doc_read on public.documents;
  create policy doc_read on public.documents for select to authenticated
    using (
      public.app_is_admin()
      or share_scope = '전사'
      or owner_id = public.app_me()
      or (share_scope = '선택' and exists(
            select 1 from public.document_shares s
            where s.document_id = documents.id and s.employee_id = public.app_me()))
    );
  drop policy if exists doc_write on public.documents;
  create policy doc_write on public.documents for all to authenticated
    using (owner_id = public.app_me() or public.app_is_admin())
    with check (owner_id = public.app_me() or public.app_is_admin());

  drop policy if exists ds_all on public.document_shares;
  create policy ds_all on public.document_shares for all to authenticated
    using (
      public.app_is_admin()
      or exists(select 1 from public.documents d
                where d.id = document_shares.document_id and d.owner_id = public.app_me())
    )
    with check (
      public.app_is_admin()
      or exists(select 1 from public.documents d
                where d.id = document_shares.document_id and d.owner_id = public.app_me())
    );
end $$;

-- 일정 · 회의록: 재직자 조회, 작성/수정은 본인(또는 관리자). 회의록은 재직자 작성.
do $$ begin
  drop policy if exists ev_read on public.events;
  create policy ev_read on public.events for select to authenticated
    using (public.app_is_active_employee());
  drop policy if exists ev_write on public.events;
  create policy ev_write on public.events for all to authenticated
    using (employee_id = public.app_me() or public.app_is_admin())
    with check (employee_id = public.app_me() or public.app_is_admin());

  drop policy if exists mt_read on public.meetings;
  create policy mt_read on public.meetings for select to authenticated
    using (public.app_is_active_employee());
  drop policy if exists mt_write on public.meetings;
  create policy mt_write on public.meetings for all to authenticated
    using (public.app_is_active_employee()) with check (public.app_is_active_employee());
end $$;

-- 활동 기록: 관리자 조회만 (append 는 트리거/RPC)
do $$ begin
  drop policy if exists au_read on public.audit_log;
  create policy au_read on public.audit_log for select to authenticated
    using (public.app_is_admin());
end $$;

-- =====================================================================
-- 끝. 다음: seed.sql (초기 데이터)
-- =====================================================================
