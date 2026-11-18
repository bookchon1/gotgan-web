-- 23. 대금 수령(선금/기성/준공) 수정 — 구분·날짜·금액을 고치면 연결된 매출 전표도 함께 수정
-- Supabase SQL Editor 에서 실행하세요. (멱등)
begin;

create or replace function public.art_update_receipt(
  p_receipt_id uuid,
  p_kind       text,   -- 선금|기성|준공
  p_date       date,
  p_amount     bigint
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pid uuid; v_date date; v_amount bigint; v_name text;
begin
  if not public.app_is_active_employee() then
    raise exception '권한이 없습니다(재직 직원만).';
  end if;
  if p_kind not in ('선금','기성','준공') then
    raise exception '수령 구분이 올바르지 않습니다: %', p_kind;
  end if;
  select project_id, date, amount into v_pid, v_date, v_amount
    from public.budget_receipts where id = p_receipt_id;
  if v_pid is null then
    raise exception '수령 내역을 찾을 수 없습니다.';
  end if;
  select name into v_name from public.art_projects where id = v_pid;

  -- 같은 사업·일자·금액·대금수령 출처의 자동 매출 전표 1건을 새 값으로 수정
  update public.acct_tx
     set date = p_date,
         amount = p_amount,
         year = extract(year from p_date)::int,
         memo = concat(v_name, ' ', p_kind, ' 수령')
   where id in (
     select id from public.acct_tx
      where project_id = v_pid and date = v_date and amount = v_amount
        and src = '대금수령'
      order by created_at desc
      limit 1
   );

  update public.budget_receipts
     set kind = p_kind, date = p_date, amount = p_amount
   where id = p_receipt_id;
end $$;

grant execute on function public.art_update_receipt(uuid, text, date, bigint) to authenticated;

commit;
notify pgrst, 'reload schema';
