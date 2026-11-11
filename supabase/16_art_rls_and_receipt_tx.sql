-- 16. 미술 사업관리: 저장 권한(RLS) 완화 + 대금수령 시 매출 전표 자동 생성
-- 원인: art_budget/budget_changes/budget_receipts/project_steps/step_comments/advisors/art_stakeholders
--       의 쓰기 정책이 '관리자만'이라, 일반 직원이 저장하면 조용히 실패(설계변경·대금수령·공정·관계자 등).
-- 조치: work_tasks 와 동일하게 '재직 직원'이면 쓰기 가능하도록 변경.
-- Supabase SQL Editor 에서 실행하세요.

begin;

-- 1) 미술 하위 테이블 쓰기 권한: 재직 직원이면 가능 (조회는 기존대로 재직 직원)
do $$
declare t text;
begin
  foreach t in array array['art_projects','art_budget','budget_changes','budget_receipts',
                           'project_steps','step_comments','advisors'] loop
    execute format('drop policy if exists %I_read on public.%I', t, t);
    execute format('create policy %I_read on public.%I for select to authenticated using (public.app_is_active_employee())', t, t);
    execute format('drop policy if exists %I_write on public.%I', t, t);
    execute format('create policy %I_write on public.%I for all to authenticated using (public.app_is_active_employee()) with check (public.app_is_active_employee())', t, t);
  end loop;
end $$;

-- art_stakeholders (별도 파일에서 생성됨): 쓰기도 재직 직원 허용
do $$ begin
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='art_stakeholders') then
    execute 'drop policy if exists ast_sel on public.art_stakeholders';
    execute 'create policy ast_sel on public.art_stakeholders for select to authenticated using (public.app_is_active_employee())';
    execute 'drop policy if exists ast_ins on public.art_stakeholders';
    execute 'create policy ast_ins on public.art_stakeholders for insert to authenticated with check (public.app_is_active_employee())';
    execute 'drop policy if exists ast_upd on public.art_stakeholders';
    execute 'create policy ast_upd on public.art_stakeholders for update to authenticated using (public.app_is_active_employee()) with check (public.app_is_active_employee())';
    execute 'drop policy if exists ast_del on public.art_stakeholders';
    execute 'create policy ast_del on public.art_stakeholders for delete to authenticated using (public.app_is_active_employee())';
  end if;
end $$;

-- 2) 대금 수령 → 매출 전표(acct_tx) 자동 생성 함수
--    acct_tx 는 회계담당만 쓰기 가능하므로 SECURITY DEFINER 로 우회하여 생성.
--    재직 직원이 자기 사업의 대금수령을 등록하면, 같은 내용의 '수입' 전표를 자동 기록.
create or replace function public.art_add_receipt(
  p_project_id uuid,
  p_kind       text,          -- 선금|기성|잔금
  p_date       date,
  p_amount     bigint,
  p_make_tx    boolean default true
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_receipt_id uuid;
  v_biz   text;
  v_dept  text;
  v_name  text;
  v_client text;
begin
  if not public.app_is_active_employee() then
    raise exception '권한이 없습니다(재직 직원만).';
  end if;
  if p_kind not in ('선금','기성','잔금') then
    raise exception '수령 구분이 올바르지 않습니다: %', p_kind;
  end if;

  -- 수금 기록
  insert into public.budget_receipts(project_id, kind, date, amount)
  values (p_project_id, p_kind, p_date, p_amount)
  returning id into v_receipt_id;

  -- 매출 전표 자동 생성
  if p_make_tx then
    select biz_code, name, client into v_biz, v_name, v_client
      from public.art_projects where id = p_project_id;
    v_dept := 'art';
    insert into public.acct_tx(date, biz_code, dept_key, tx_type, account, amount,
                               partner, memo, project_id, src, year)
    values (p_date, coalesce(v_biz,'법인'), v_dept, '수입', '공사·용역수입', p_amount,
            v_client, concat(v_name, ' ', p_kind, ' 수령'), p_project_id, '대금수령',
            extract(year from p_date)::int);
  end if;

  return v_receipt_id;
end $$;

grant execute on function public.art_add_receipt(uuid, text, date, bigint, boolean) to authenticated;

-- 3) 대금 수령 삭제 시 연결된 자동 전표도 함께 제거하는 함수
create or replace function public.art_delete_receipt(p_receipt_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pid uuid; v_date date; v_amount bigint; v_kind text; v_name text;
begin
  if not public.app_is_active_employee() then
    raise exception '권한이 없습니다(재직 직원만).';
  end if;
  select project_id, date, amount, kind into v_pid, v_date, v_amount, v_kind
    from public.budget_receipts where id = p_receipt_id;
  if v_pid is null then return; end if;
  select name into v_name from public.art_projects where id = v_pid;

  -- 같은 사업·일자·금액·대금수령 출처의 자동 전표 1건 제거
  delete from public.acct_tx
   where id in (
     select id from public.acct_tx
      where project_id = v_pid and date = v_date and amount = v_amount
        and src = '대금수령'
      order by created_at desc
      limit 1
   );
  delete from public.budget_receipts where id = p_receipt_id;
end $$;

grant execute on function public.art_delete_receipt(uuid) to authenticated;

commit;
