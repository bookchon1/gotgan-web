-- =====================================================================
-- 곳간 — 급여대장 '급여 행 직접 삭제' 를 위한 payslips DELETE 정책 추가
--
-- 배경: 급여대장에서 전월 복사뿐 아니라 직접 추가·수정·삭제를 지원.
--   기존 정책은 payslips insert/update 만 있어(ps_ins/ps_upd) 삭제가 RLS 로 막힘.
-- 추가: ps_del — 급여담당(app_is_payroll_mgr) 이 급여 행 삭제 허용.
-- 멱등.
-- =====================================================================

do $$ begin
  drop policy if exists ps_del on public.payslips;
  create policy ps_del on public.payslips for delete to authenticated
    using (public.app_is_payroll_mgr());
end $$;

-- 확인
select policyname, cmd from pg_policies
where schemaname='public' and tablename='payslips'
order by policyname;
