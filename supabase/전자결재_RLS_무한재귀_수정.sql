-- =====================================================================
-- 곳간 — 전자결재 RLS 무한재귀 수정 (자체완결 버전)
--
-- 증상1: "infinite recursion detected in policy for relation approvals"
-- 증상2: "function public.app_is_drafter_of(uuid) does not exist"
--        → 교차참조 helper 함수가 DB 에 없어서 정책 생성이 실패.
--
-- 그래서 이 파일은 (1) 필요한 helper 함수를 먼저 정의하고
--   (2) approval_lines 쓰기 정책을 'for all' → insert/update/delete 로 분리해
--   approvals ↔ approval_lines SELECT 순환을 끊는다.
--
-- 멱등(create or replace / drop if exists). Supabase SQL Editor 에 붙여넣고 Run.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0) 교차참조 helper 함수 (없으면 생성, 있으면 교체) — SECURITY DEFINER
-- ---------------------------------------------------------------------
create or replace function public.app_is_approver_of(p_appr uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from public.approval_lines l
    where l.approval_id = p_appr and l.approver_id = public.app_me()
  )
$$;

create or replace function public.app_is_drafter_of(p_appr uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from public.approvals a
    where a.id = p_appr and a.drafter_id = public.app_me()
  )
$$;

-- ---------------------------------------------------------------------
-- 1) approvals 정책 재정의 (기안자 본인 + 결재선 포함 + 관리자)
-- ---------------------------------------------------------------------
do $$ begin
  drop policy if exists ap_read on public.approvals;
  create policy ap_read on public.approvals for select to authenticated
    using (
      public.app_is_admin()
      or drafter_id = public.app_me()
      or public.app_is_approver_of(approvals.id)
    );

  drop policy if exists ap_ins on public.approvals;
  create policy ap_ins on public.approvals for insert to authenticated
    with check (drafter_id = public.app_me() or public.app_is_admin());

  drop policy if exists ap_upd on public.approvals;
  create policy ap_upd on public.approvals for update to authenticated
    using (
      public.app_is_admin()
      or drafter_id = public.app_me()
      or public.app_is_approver_of(approvals.id)
    )
    with check (true);
end $$;

-- ---------------------------------------------------------------------
-- 2) approval_lines 정책: SELECT 는 재직자, 쓰기는 insert/update/delete 분리
--    (핵심: 'for all' 을 없애 SELECT 평가에서 app_is_drafter_of 호출을 제거 → 순환 해소)
-- ---------------------------------------------------------------------
do $$ begin
  drop policy if exists apl_write on public.approval_lines;   -- 문제의 for all 제거
  drop policy if exists apl_read  on public.approval_lines;
  drop policy if exists apl_ins   on public.approval_lines;
  drop policy if exists apl_upd   on public.approval_lines;
  drop policy if exists apl_del   on public.approval_lines;

  -- SELECT: approval_lines 자체 기준만(approvals 참조 안 함)
  create policy apl_read on public.approval_lines for select to authenticated
    using (public.app_is_active_employee());

  create policy apl_ins on public.approval_lines for insert to authenticated
    with check (
      public.app_is_admin()
      or approver_id = public.app_me()
      or public.app_is_drafter_of(approval_lines.approval_id)
    );

  create policy apl_upd on public.approval_lines for update to authenticated
    using (
      public.app_is_admin()
      or approver_id = public.app_me()
      or public.app_is_drafter_of(approval_lines.approval_id)
    )
    with check (true);

  create policy apl_del on public.approval_lines for delete to authenticated
    using (
      public.app_is_admin()
      or public.app_is_drafter_of(approval_lines.approval_id)
    );
end $$;

-- ---------------------------------------------------------------------
-- 확인용: 정책 목록
-- ---------------------------------------------------------------------
select tablename, policyname, cmd
from pg_policies
where schemaname='public' and tablename in ('approvals','approval_lines')
order by tablename, policyname;
