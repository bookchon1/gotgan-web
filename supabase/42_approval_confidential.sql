-- 42. 보안 문서 — 기안자와 결재선(검토·합의·승인·참조)에 지정된 사람만 열람 (일반 관리자도 제외) — 멱등
alter table public.approvals add column if not exists confidential boolean not null default false;

do $$ begin
  drop policy if exists ap_read on public.approvals;
  create policy ap_read on public.approvals for select to authenticated
    using (
      (public.app_is_admin() and not confidential)
      or drafter_id = public.app_me()
      or public.app_is_approver_of(approvals.id)
    );

  -- 첨부파일 목록은 '볼 수 있는 문서'의 것만
  drop policy if exists apf_read on public.approval_files;
  create policy apf_read on public.approval_files for select to authenticated
    using (exists (select 1 from public.approvals a where a.id = approval_files.approval_id));
end $$;

notify pgrst, 'reload schema';
