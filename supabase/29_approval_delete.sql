-- 29. 회수한 전자결재 문서 삭제 권한 (기안자 본인의 '회수' 문서, 관리자) — 멱등
do $$ begin
  drop policy if exists ap_del on public.approvals;
  create policy ap_del on public.approvals for delete to authenticated
    using (
      public.app_is_admin()
      or (drafter_id = public.app_me() and status = '회수')
    );
end $$;
notify pgrst, 'reload schema';
