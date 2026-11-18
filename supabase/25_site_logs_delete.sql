-- 25. 현장관리 일일기록 삭제 권한 (관리자) — 멱등
do $$ begin
  drop policy if exists sl_del on public.site_logs;
  create policy sl_del on public.site_logs for delete to authenticated
    using (public.app_is_admin());
end $$;
notify pgrst, 'reload schema';
