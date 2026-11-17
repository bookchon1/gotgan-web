-- 18. 대금수령 구분 '잔금'/'준공금' → '준공' 으로 명칭 변경 (이미 18번을 실행했어도 다시 실행 가능)
-- Supabase SQL Editor 에서 실행하세요.
begin;

-- 1) 기존 check 제약 제거 후 데이터 이관, 새 제약 추가
do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
     where conrelid = 'public.budget_receipts'::regclass and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%kind%'
  loop
    execute format('alter table public.budget_receipts drop constraint %I', c);
  end loop;
end $$;

update public.budget_receipts set kind = '준공' where kind in ('잔금','준공금');
alter table public.budget_receipts
  add constraint budget_receipts_kind_check check (kind in ('선금','기성','준공'));

-- 이미 생성된 매출 전표 적요도 함께 정리
update public.acct_tx set memo = replace(replace(memo, ' 잔금 수령', ' 준공 수령'), ' 준공금 수령', ' 준공 수령')
 where src = '대금수령' and (memo like '% 잔금 수령' or memo like '% 준공금 수령');

-- 2) 대금수령 RPC (구분 검사에 준공금 반영)
create or replace function public.art_add_receipt(
  p_project_id uuid,
  p_kind       text,          -- 선금|기성|준공
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
  if p_kind not in ('선금','기성','준공') then
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

commit;
