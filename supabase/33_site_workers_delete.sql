-- 33. 현장 작업자 삭제 권한 (관리자) — 멱등
do $$ begin
  drop policy if exists sw_del on public.site_workers;
  create policy sw_del on public.site_workers for delete to authenticated
    using (public.app_is_admin());
end $$;
notify pgrst, 'reload schema';
