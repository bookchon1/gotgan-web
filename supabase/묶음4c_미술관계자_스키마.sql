-- =====================================================================
-- 곳간 — 묶음 4c : 미술 사업상세 관계자 (발주담당/소장자/재무과 등)
-- 북촌불교미술보존연구소 사내 인트라넷
--
-- 실행 순서: schema.sql → rls.sql → functions.sql → (이전 묶음들) → 이 파일
-- 개요: 사업상세 상단에 관계자 표(구분·이름·소속·연락처)를 추가. advisors 와 동일한 패턴.
-- =====================================================================

create table if not exists public.art_stakeholders (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.art_projects(id) on delete cascade,
  kind        text not null default '발주담당',   -- 발주담당|소장자|재무과|기타
  name        text not null,
  org         text,                               -- 소속
  phone       text,                               -- 연락처
  sort        int not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists idx_art_stakeholders_project on public.art_stakeholders(project_id);

-- RLS: 읽기 재직 직원 / 쓰기 관리자 (advisors 와 동일 수준)
alter table public.art_stakeholders enable row level security;
do $$ begin
  drop policy if exists ast_sel on public.art_stakeholders;
  create policy ast_sel on public.art_stakeholders for select to authenticated
    using (public.app_is_active_employee());
  drop policy if exists ast_ins on public.art_stakeholders;
  create policy ast_ins on public.art_stakeholders for insert to authenticated
    with check (public.app_is_admin());
  drop policy if exists ast_upd on public.art_stakeholders;
  create policy ast_upd on public.art_stakeholders for update to authenticated
    using (public.app_is_admin()) with check (public.app_is_admin());
  drop policy if exists ast_del on public.art_stakeholders;
  create policy ast_del on public.art_stakeholders for delete to authenticated
    using (public.app_is_admin());
end $$;
