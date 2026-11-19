-- 26. 이미 '접수 확인'만 되고 전표가 없는 품의서 → 지출 전표 보충 (1회 실행)
insert into public.acct_tx (date, biz_code, dept_key, tx_type, account, amount, memo, src, year)
select current_date, coalesce(a.biz_code,'법인'), a.dept_key, '지출', coalesce(a.account,'재료비'),
       a.amount, a.title, '결의서', extract(year from current_date)::int
from public.approvals a
where a.kind = '품의' and a.status = '회계접수' and coalesce(a.amount,0) > 0
  and not exists (
    select 1 from public.acct_tx t
    where t.src = '결의서' and t.amount = a.amount and t.memo = a.title
  );
