-- =====================================================================
-- 곳간 — 묶음 4a : 미술 · 현장관리 (일일기록 / 기간정산 / 작업자·일당)
-- 북촌불교미술보존연구소 사내 인트라넷
--
-- 실행 순서: schema.sql → rls.sql → functions.sql → (묶음2/3/인사확장) → 이 파일
-- 금액 단위: 원(bigint). PK: uuid(gen_random_uuid()).
--
-- 개요
--  - 현장관리는 신규 테이블 2개만 추가한다: site_workers(작업자·일당), site_logs(일일기록).
--  - 기간 정산 → 지출결의서 상신은 기존 approvals/approval_lines 를 그대로 사용한다
--    (kind='지출결의서', dept_key='art'). 상신된 일일기록은 locked=true 로 잠궈 중복청구를 막는다.
--  - 승인·회계접수는 기존 전자결재/회계 접수 흐름을 그대로 탄다.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) 작업자 명부 (일용직) — 이름 + 기본 일당
--    * 일당 변경은 "새로 저장하는 일일기록"부터 적용. 과거 기록 금액은 보존(site_logs.crew 에 스냅샷).
-- ---------------------------------------------------------------------
create table if not exists public.site_workers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  daily_wage  bigint not null default 0,         -- 기본 일당(원)
  active      boolean not null default true,     -- 퇴장 처리 시 false
  memo        text,
  created_at  timestamptz not null default now()
);
create index if not exists idx_site_workers_active on public.site_workers(active);

-- ---------------------------------------------------------------------
-- 2) 일일기록 — 하루치 현장 작업 1건
--    crew: 그날 투입된 작업자 스냅샷 배열. 예:
--      [{"worker_id":"...","name":"박작업","wage":180000},
--       {"worker_id":"...","name":"최보조","wage":130000}]
--    labor_cost 는 crew 의 wage 합(앱에서 계산해 저장), meal_cost 는 식대.
--    정산상태: 미정산 → (정산목록 포함) → 회계처리대기(결의서 상신) → 정산완료(회계접수)
-- ---------------------------------------------------------------------
create table if not exists public.site_logs (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid references public.art_projects(id) on delete set null,  -- 연결 사업(없을 수도)
  project_name  text,                              -- 사업명 스냅샷(사업 미연결/표시용)
  log_date      date not null,                     -- 작성일(근무일)
  work_text     text not null,                     -- 현장 업무 내용
  crew          jsonb not null default '[]'::jsonb, -- 작업자 스냅샷 배열(위 설명)
  meal_cost     bigint not null default 0,         -- 식대(원)
  labor_cost    bigint not null default 0,         -- 인건비 합계(원) = sum(crew.wage)
  settle_status text not null default '미정산'
                 check (settle_status in ('미정산','회계처리대기','정산완료')),
  locked        boolean not null default false,    -- 결의서 연결 시 잠금(원본 보존)
  approval_id   uuid references public.approvals(id) on delete set null,     -- 연결된 지출결의서
  created_by    uuid references public.employees(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists idx_site_logs_project on public.site_logs(project_id);
create index if not exists idx_site_logs_date on public.site_logs(log_date);
create index if not exists idx_site_logs_settle on public.site_logs(settle_status);

-- ---------------------------------------------------------------------
-- 3) RLS — 현장관리는 미술 담당(관리자) 쓰기, 재직 직원 읽기.
--    기존 rls.sql 의 패턴(app_is_admin / app_is_active_employee)을 따른다.
--    * 미술 전담 역할 함수가 없으므로 admin 쓰기로 둔다(기존 inventory 와 동일한 수준).
-- ---------------------------------------------------------------------
alter table public.site_workers enable row level security;
alter table public.site_logs    enable row level security;

do $$ begin
  -- 작업자 명부
  drop policy if exists sw_sel on public.site_workers;
  create policy sw_sel on public.site_workers for select to authenticated
    using (public.app_is_active_employee());
  drop policy if exists sw_ins on public.site_workers;
  create policy sw_ins on public.site_workers for insert to authenticated
    with check (public.app_is_admin());
  drop policy if exists sw_upd on public.site_workers;
  create policy sw_upd on public.site_workers for update to authenticated
    using (public.app_is_admin()) with check (public.app_is_admin());

  -- 일일기록
  drop policy if exists sl_sel on public.site_logs;
  create policy sl_sel on public.site_logs for select to authenticated
    using (public.app_is_active_employee());
  drop policy if exists sl_ins on public.site_logs;
  create policy sl_ins on public.site_logs for insert to authenticated
    with check (public.app_is_admin());
  drop policy if exists sl_upd on public.site_logs;
  create policy sl_upd on public.site_logs for update to authenticated
    using (public.app_is_admin()) with check (public.app_is_admin());
end $$;

-- =====================================================================
-- 끝. (데모 데이터는 넣지 않음 — 실제 작업자·기록은 앱에서 등록)
-- =====================================================================
