-- 전자결재 첨부파일: 저장소 버킷 + 첨부 테이블
insert into storage.buckets (id, name, public)
values ('approval-files', 'approval-files', false)
on conflict (id) do nothing;

create table if not exists public.approval_files (
  id uuid primary key default gen_random_uuid(),
  approval_id uuid not null references public.approvals(id) on delete cascade,
  name text not null,
  path text not null,
  size bigint,
  uploaded_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists approval_files_appr_idx on public.approval_files(approval_id);

alter table public.approval_files enable row level security;

drop policy if exists apf_read on public.approval_files;
create policy apf_read on public.approval_files for select to authenticated
  using (app_is_admin() or app_is_drafter_of(approval_id) or app_is_approver_of(approval_id));

drop policy if exists apf_ins on public.approval_files;
create policy apf_ins on public.approval_files for insert to authenticated
  with check (app_is_admin() or app_is_drafter_of(approval_id));

drop policy if exists apf_del on public.approval_files;
create policy apf_del on public.approval_files for delete to authenticated
  using (app_is_admin() or app_is_drafter_of(approval_id));

-- 저장소 정책 (재직 직원만 업로드·열람·삭제; 문서 열람 권한은 approval_files 테이블이 제어)
drop policy if exists apf_obj_read on storage.objects;
create policy apf_obj_read on storage.objects for select to authenticated
  using (bucket_id = 'approval-files' and app_is_active_employee());
drop policy if exists apf_obj_ins on storage.objects;
create policy apf_obj_ins on storage.objects for insert to authenticated
  with check (bucket_id = 'approval-files' and app_is_active_employee());
drop policy if exists apf_obj_del on storage.objects;
create policy apf_obj_del on storage.objects for delete to authenticated
  using (bucket_id = 'approval-files' and app_is_active_employee());

notify pgrst, 'reload schema';
