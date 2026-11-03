-- =====================================================================
-- 곳간 — 묶음2 스키마 보강 (재고 발주 지출결의서 + 급여 명세서 발급/일괄 상신)
--
-- 실행 순서: schema.sql → rls.sql → functions.sql 이후에 마지막으로 실행.
-- (이 파일은 아직 직접 실행하지 마세요 — 검토 후 적용.)
--
-- 왜 필요한가:
--   현재 rls.sql 은 payslips / payroll_runs 에 "읽기 정책만" 두고, 쓰기는
--   SECURITY DEFINER RPC(copy_prev_payroll / submit_payroll)로만 허용합니다.
--   묶음2 의 급여 화면(src/pages/labor/Labor.tsx)은 시안 동작에 맞춰
--     · '지출결의서 일괄 상신' = approvals + approval_lines 직접 insert
--       (ApprovalDraftModal 과 동일한 클라이언트 경로) + payroll_runs.status='상신완료'
--     · '전 직원 명세서 발송' = payslips 직접 upsert(발급) + payroll_runs.status='지급완료'
--   를 "클라이언트에서 직접" 수행합니다. 이를 허용하려면 급여담당(app_is_payroll_mgr)
--   에 한해 payslips INSERT/UPDATE 와 payroll_runs INSERT/UPDATE 정책이 필요합니다.
--
--   approvals / approval_lines 쓰기 정책은 rls.sql 에 이미 존재하므로
--   (ap_ins: drafter_id = app_me(), apl_write: drafter/approver/admin) 변경이 없습니다.
--
-- 컬럼 변경: 없음.
--   · payslips: base_pay, allowances, d_pension, d_health, d_ltc, d_employment,
--     d_income_tax, d_local_tax, d_other, pay_date 모두 schema.sql 에 이미 존재.
--     (deductions / net_pay 는 generated STORED 컬럼 → insert/upsert 대상 아님)
--   · payroll_runs: status, submitted_at, paid_at 모두 존재.
--   따라서 ALTER TABLE 은 필요하지 않습니다.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. payslips — 급여담당(app_is_payroll_mgr) 직접 insert/update 허용
--    (읽기 정책 ps_read 는 rls.sql 그대로 유지: 본인 또는 급여담당)
--    '전 직원 명세서 발송' 이 급여 행을 payslips 로 발급(upsert)하는 유일 경로.
-- ---------------------------------------------------------------------
do $$ begin
  drop policy if exists ps_ins on public.payslips;
  create policy ps_ins on public.payslips for insert to authenticated
    with check (public.app_is_payroll_mgr());

  drop policy if exists ps_upd on public.payslips;
  create policy ps_upd on public.payslips for update to authenticated
    using (public.app_is_payroll_mgr())
    with check (public.app_is_payroll_mgr());
end $$;

-- ---------------------------------------------------------------------
-- 2. payroll_runs — 급여담당 직접 insert/update 허용
--    (읽기 정책 pr_read 는 rls.sql 그대로 유지)
--    · 일괄 상신   → status='상신완료', submitted_at
--    · 명세서 발송 → status='지급완료', paid_at
-- ---------------------------------------------------------------------
do $$ begin
  drop policy if exists pr_ins on public.payroll_runs;
  create policy pr_ins on public.payroll_runs for insert to authenticated
    with check (public.app_is_payroll_mgr());

  drop policy if exists pr_upd on public.payroll_runs;
  create policy pr_upd on public.payroll_runs for update to authenticated
    using (public.app_is_payroll_mgr())
    with check (public.app_is_payroll_mgr());
end $$;

-- =====================================================================
-- 참고: 재고 발주 지출결의서(src/pages/ops/Inventory.tsx)는 추가 정책이
--   전혀 필요 없습니다. (이 파일로 바꾸는 것은 급여 관련 정책뿐)
--     · approvals INSERT      = ap_ins   (drafter_id = app_me())          — rls.sql 존재
--     · approval_lines INSERT = apl_write (drafter/approver/admin)         — rls.sql 존재
--     · inventory UPDATE      = inv_write (app_is_admin())                 — rls.sql 존재
--     · purchase_history INS  = ph_write  (app_is_admin())                — rls.sql 존재
--   묶음2 발주는 기존 '입고' 버튼과 동일한 경로(inventory.update 로
--   incoming 누적 + unit_price 갱신)만 사용하므로 관리자 권한에서 그대로 동작합니다.
--   (관리자 외 상품담당에게도 허용하려면 rls.sql 의 inv_write/ph_write 조건을
--    app_is_admin() → (app_has_grant('product') or app_is_admin()) 로 넓히세요.
--    묶음2 필수 사항은 아님.)

-- =====================================================================
-- 끝.
-- =====================================================================
