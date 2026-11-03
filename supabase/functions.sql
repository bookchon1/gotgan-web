-- =====================================================================
-- 곳간 — RPC (상태변경·자동화). schema.sql → rls.sql 다음에 실행.
-- 민감 테이블(급여·전표)은 RLS 쓰기정책을 열지 않고 이 RPC 로만 변경.
-- 모두 SECURITY DEFINER + 내부 권한검사.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. 전월 급여 복사 → 이번 달 작성중 대장 생성/채움 (급여담당만)
-- ---------------------------------------------------------------------
create or replace function public.copy_prev_payroll(p_target_ym text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_run_id uuid;
  v_prev_run uuid;
  v_me uuid := public.app_me();
begin
  if not public.app_is_payroll_mgr() then
    raise exception '급여 담당 권한이 없습니다.' using errcode='42501';
  end if;

  -- 대상 대장 확보 (없으면 생성)
  select id into v_run_id from public.payroll_runs where ym = p_target_ym;
  if v_run_id is null then
    insert into public.payroll_runs (ym, status, created_by)
    values (p_target_ym, '작성중', v_me) returning id into v_run_id;
  elsif (select status from public.payroll_runs where id=v_run_id) <> '작성중' then
    raise exception '이미 상신/지급된 대장입니다.' using errcode='P0001';
  end if;

  -- 이미 명세가 있으면 중단
  if exists(select 1 from public.payslips where run_id = v_run_id) then
    raise exception '이미 명세가 작성된 대장입니다.' using errcode='P0001';
  end if;

  -- 직전 대장
  select id into v_prev_run from public.payroll_runs
  where ym < p_target_ym order by ym desc limit 1;

  if v_prev_run is not null then
    insert into public.payslips
      (run_id, employee_id, base_pay, allowances,
       d_pension, d_health, d_ltc, d_employment, d_income_tax, d_local_tax, d_other)
    select v_run_id, p.employee_id, p.base_pay, p.allowances,
       p.d_pension, p.d_health, p.d_ltc, p.d_employment, p.d_income_tax, p.d_local_tax, p.d_other
    from public.payslips p
    join public.employees e on e.id = p.employee_id and e.status = '재직'
    where p.run_id = v_prev_run;
  else
    -- 직전 대장이 없으면 재직자 빈 명세 생성
    insert into public.payslips (run_id, employee_id)
    select v_run_id, e.id from public.employees e where e.status = '재직';
  end if;

  return v_run_id;
end $$;

-- ---------------------------------------------------------------------
-- 2. 급여대장 → 지출결의서 상신 (합계 급여 1건). 급여담당만.
-- ---------------------------------------------------------------------
create or replace function public.submit_payroll(p_run_id uuid, p_doc_no text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_total bigint; v_appr uuid; v_me uuid := public.app_me();
begin
  if not public.app_is_payroll_mgr() then
    raise exception '급여 담당 권한이 없습니다.' using errcode='42501';
  end if;
  if (select status from public.payroll_runs where id=p_run_id) <> '작성중' then
    raise exception '작성중 대장만 상신할 수 있습니다.' using errcode='P0001';
  end if;

  select coalesce(sum(net_pay),0) into v_total from public.payslips where run_id = p_run_id;

  insert into public.approvals (doc_no, kind, drafter_id, biz_code, dept_key, title, amount, account, memo, req_date, status)
  values (p_doc_no, '지출결의서', v_me, '법인', 'management',
          (select ym from public.payroll_runs where id=p_run_id) || ' 급여',
          v_total, '급여', '급여 지급', current_date, '진행')
  returning id into v_appr;

  update public.payroll_runs set status='상신완료', submitted_at=now() where id=p_run_id;
  return v_appr;
end $$;

-- ---------------------------------------------------------------------
-- 3. 출근 체크 / 퇴근 체크 (본인)
-- ---------------------------------------------------------------------
create or replace function public.clock_in()
returns uuid language plpgsql security definer set search_path = public as $$
declare v_me uuid := public.app_me(); v_id uuid;
begin
  if v_me is null then raise exception '로그인이 필요합니다.' using errcode='42501'; end if;
  insert into public.attendance (employee_id, work_date, check_in, status)
  values (v_me, current_date, now(), '근무중')
  on conflict (employee_id, work_date) do update set check_in = coalesce(public.attendance.check_in, now())
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.clock_out()
returns uuid language plpgsql security definer set search_path = public as $$
declare v_me uuid := public.app_me(); v_id uuid;
begin
  if v_me is null then raise exception '로그인이 필요합니다.' using errcode='42501'; end if;
  update public.attendance set check_out = now(), status='완료'
  where employee_id = v_me and work_date = current_date
  returning id into v_id;
  return v_id;
end $$;

-- 실행 권한
grant execute on function
  public.copy_prev_payroll(text), public.submit_payroll(uuid, text),
  public.clock_in(), public.clock_out()
  to authenticated;

-- =====================================================================
-- 끝.
-- =====================================================================
