-- 19. 미술 사업 내역서(엑셀) 보관: 업로드한 5개 시트를 사업별로 저장
-- Supabase SQL Editor 에서 실행하세요.
begin;

create table if not exists public.art_boq (
  project_id  uuid primary key references public.art_projects(id) on delete cascade,
  file_name   text,
  sheets      jsonb not null default '[]'::jsonb,   -- [{name, rows, merges, widths}]
  uploaded_by uuid,
  updated_at  timestamptz not null default now()
);

alter table public.art_boq enable row level security;

drop policy if exists boq_sel on public.art_boq;
create policy boq_sel on public.art_boq for select to authenticated
  using (public.app_is_active_employee());
drop policy if exists boq_ins on public.art_boq;
create policy boq_ins on public.art_boq for insert to authenticated
  with check (public.app_is_active_employee());
drop policy if exists boq_upd on public.art_boq;
create policy boq_upd on public.art_boq for update to authenticated
  using (public.app_is_active_employee()) with check (public.app_is_active_employee());
drop policy if exists boq_del on public.art_boq;
create policy boq_del on public.art_boq for delete to authenticated
  using (public.app_is_active_employee());

commit;
