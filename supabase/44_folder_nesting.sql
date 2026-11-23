-- 문서보관 폴더 하위 폴더 지원
alter table public.document_folders
  add column if not exists parent_id uuid references public.document_folders(id) on delete cascade;
create index if not exists document_folders_parent_idx on public.document_folders(parent_id);
notify pgrst, 'reload schema';
