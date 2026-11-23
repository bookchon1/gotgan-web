-- 문서보관 파일 저장소('documents' 버킷) 준비 + 접근 규칙
-- 여러 번 실행해도 안전합니다.
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

-- 업로드: 로그인한 사용자
drop policy if exists doc_obj_ins on storage.objects;
create policy doc_obj_ins on storage.objects for insert to authenticated
  with check (bucket_id = 'documents');

-- 열람: 문서 목록에서 볼 수 있는(공유 범위 통과) 문서의 파일만
drop policy if exists doc_obj_read on storage.objects;
create policy doc_obj_read on storage.objects for select to authenticated
  using (bucket_id = 'documents' and exists (select 1 from public.documents d where d.file_path = name));

-- 수정·삭제: 문서 소유자 또는 관리자
drop policy if exists doc_obj_upd on storage.objects;
create policy doc_obj_upd on storage.objects for update to authenticated
  using (bucket_id = 'documents' and exists (select 1 from public.documents d where d.file_path = name and (d.owner_id = public.app_me() or public.app_is_admin())));
drop policy if exists doc_obj_del on storage.objects;
create policy doc_obj_del on storage.objects for delete to authenticated
  using (bucket_id = 'documents' and exists (select 1 from public.documents d where d.file_path = name and (d.owner_id = public.app_me() or public.app_is_admin())));
