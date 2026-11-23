-- 39. 자주 쓰는 결재선 저장 — 멱등
create table if not exists public.approval_line_presets (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.employees(id) on delete cascade,
  name        text not null,
  reviewer_id uuid references public.employees(id) on delete set null,
  approver_id uuid references public.employees(id) on delete set null,
  cc_ids      uuid[] not null default '{}',
  created_at  timestamptz not null default now()
);
alter table public.approval_line_presets enable row level security;
do $$ begin
  drop policy if exists alp_all on public.approval_line_presets;
  create policy alp_all on public.approval_line_presets for all to authenticated
    using (owner_id = public.app_me()) with check (owner_id = public.app_me());
end $$;
notify pgrst, 'reload schema';
