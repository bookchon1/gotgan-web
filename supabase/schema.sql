-- =====================================================================
-- 곳간 (BOOKCHON WORKSPACE) — Supabase 스키마
-- 북촌불교미술보존연구소 사내 인트라넷
--
-- 실행 순서: 1) schema.sql  2) rls.sql  3) seed.sql  (4) functions.sql 선택)
-- Supabase SQL Editor 에 통째로 붙여넣어 실행하세요.
-- 금액 단위: 원(bigint). PK: uuid(gen_random_uuid()).
-- =====================================================================

-- 안전 재실행을 위해 확장 보장 (Supabase 에는 보통 이미 있음)
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- 1. 조직 · 계정
-- ---------------------------------------------------------------------

-- 사업자 3곳 (법인 / 개인(도래헌) / 더북촌)
create table if not exists public.businesses (
  code        text primary key,                 -- '법인' | '개인' | '더북촌'
  name        text not null,                     -- 상호
  kind        text not null,                     -- '법인' | '개인'
  sort        int  not null default 0
);

-- 부서(영역)
create table if not exists public.departments (
  key         text primary key,                  -- 'art'|'management'|...|'' (대표)
  label       text not null,                     -- '미술'
  admin_only  boolean not null default false,    -- 경영 = true
  locked      boolean not null default false,    -- 상품/홍보/체험/교육
  sort        int not null default 0
);

-- 직원 (인사기록 + 로그인 계정 연결)
create table if not exists public.employees (
  id            uuid primary key default gen_random_uuid(),
  auth_user_id  uuid unique references auth.users(id) on delete set null,
  name          text not null,
  dept_key      text references public.departments(key) on delete set null,
  title         text,                            -- 직급
  join_ym       text,                            -- 입사 'YYYY.MM'
  role          text not null default 'user' check (role in ('admin','user')),
  is_mgmt       boolean not null default false,  -- 인사·노무·회계 담당
  is_root       boolean not null default false,  -- 최초 관리자(강등·삭제 불가)
  status        text not null default '재직' check (status in ('재직','휴직','퇴직')),
  email         text,
  phone         text,
  sort          int not null default 0,
  created_at    timestamptz not null default now()
);
create index if not exists idx_employees_status on public.employees(status);
create index if not exists idx_employees_auth on public.employees(auth_user_id);

-- 관리자 영역별 권한 (hr/labor/accounting) — 담당 업무 세분화
create table if not exists public.admin_grants (
  employee_id uuid not null references public.employees(id) on delete cascade,
  area        text not null check (area in ('hr','labor','accounting')),
  primary key (employee_id, area)
);

-- 기능별 권한 (직원마다 업무/문서/결재/일정 on/off)
create table if not exists public.permissions (
  employee_id uuid not null references public.employees(id) on delete cascade,
  feature     text not null check (feature in ('tasks','documents','approvals','calendar')),
  enabled     boolean not null default true,
  primary key (employee_id, feature)
);

-- ---------------------------------------------------------------------
-- 2. 업무
-- ---------------------------------------------------------------------
create table if not exists public.work_tasks (
  id            uuid primary key default gen_random_uuid(),
  area          text not null,                   -- 'management'|'art'|...
  title         text not null,
  dept          text,
  detail        text,                            -- 세부분류(노무/회계/작업/조사...)
  owner_id      uuid references public.employees(id) on delete set null,
  reg_date      date,
  start_date    date,
  due_date      date,
  status        text not null default 'plan' check (status in ('plan','prog','done')),
  src           text,                            -- 출처 태그
  src_project_id uuid,                           -- 사업 연동(art_projects)
  created_at    timestamptz not null default now()
);
create index if not exists idx_work_tasks_area on public.work_tasks(area);

-- ---------------------------------------------------------------------
-- 3. 미술 사업
-- ---------------------------------------------------------------------
create table if not exists public.art_projects (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  client        text,                            -- 발주기관
  biz_code      text references public.businesses(code) on delete set null,
  proj_type     text,                            -- 서화|조형|건축
  kind          text check (kind in ('입찰','발주')),     -- 구분
  status        text not null default '예정'
                 check (status in ('공고/입찰','예정','진행','완료','탈락/보류')),
  progress      int not null default 0,          -- 0~100 (세부공정에서 자동)
  now_text      text,                            -- 추진현황 한 줄
  est_amount    bigint default 0,                -- 추정금액
  owner_id      uuid references public.employees(id) on delete set null,
  contract_base bigint default 0,                -- 당초 계약금
  due_date      date,                            -- 준공 예정
  done_date     date,                            -- 준공 실제 (null=진행중)
  year          int,                             -- 당해연도 필터
  created_at    timestamptz not null default now()
);
create index if not exists idx_art_projects_year on public.art_projects(year);

-- 사업별 9대 예산항목 (배정액). 집행은 acct_tx 집계.
create table if not exists public.art_budget (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.art_projects(id) on delete cascade,
  item        text not null,                     -- 재료비|노무비|경비|외주가공비|이윤|보존처리계획|자문회비
  alloc       bigint not null default 0,
  sort        int not null default 0,
  unique (project_id, item)
);

-- 설계변경 (증액 / 감액 준공)
create table if not exists public.budget_changes (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.art_projects(id) on delete cascade,
  date          date not null,
  type          text not null check (type in ('증액','감액')),
  memo          text,
  after_amount  bigint not null,                 -- 변경 후 계약금
  created_at    timestamptz not null default now()
);

-- 대금 수령 (선금·기성·잔금)
create table if not exists public.budget_receipts (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.art_projects(id) on delete cascade,
  kind        text not null check (kind in ('선금','기성','잔금')),
  date        date not null,
  amount      bigint not null,
  created_at  timestamptz not null default now()
);

-- 세부 진행 공정 (순서형, 기본 20)
create table if not exists public.project_steps (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.art_projects(id) on delete cascade,
  seq         int not null,                      -- 순번(1..N)
  title       text not null,                     -- 공정명
  status      text not null default 'before' check (status in ('before','prog','done','na')),
  from_date   date,
  to_date     date,
  created_at  timestamptz not null default now()
);
create index if not exists idx_project_steps_proj on public.project_steps(project_id, seq);

-- 공정 코멘트 (적요)
create table if not exists public.step_comments (
  id        uuid primary key default gen_random_uuid(),
  step_id   uuid not null references public.project_steps(id) on delete cascade,
  by_id     uuid references public.employees(id) on delete set null,
  date      date not null default current_date,
  text      text not null,
  created_at timestamptz not null default now()
);

-- 자문위원 (사업별)
create table if not exists public.advisors (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.art_projects(id) on delete cascade,
  name        text not null,
  org         text,
  phone       text,
  default_fee bigint not null default 300000,
  sort        int not null default 0
);

-- ---------------------------------------------------------------------
-- 4. 회계
-- ---------------------------------------------------------------------
-- 전표 (수입·지출)
create table if not exists public.acct_tx (
  id          uuid primary key default gen_random_uuid(),
  date        date not null,
  biz_code    text references public.businesses(code) on delete set null,
  dept_key    text,
  tx_type     text not null check (tx_type in ('수입','지출')),
  account     text,                              -- 계정과목
  amount      bigint not null,
  partner     text,                              -- 거래처
  memo        text,
  project_id  uuid references public.art_projects(id) on delete set null,
  budget_item text,                              -- 예산항목(지출)
  src         text check (src in ('결의서','카드','대금수령','직접')),
  year        int,
  created_at  timestamptz not null default now()
);
create index if not exists idx_acct_tx_date on public.acct_tx(date);
create index if not exists idx_acct_tx_biz on public.acct_tx(biz_code);
create index if not exists idx_acct_tx_proj on public.acct_tx(project_id);

-- 법인카드 내역
create table if not exists public.acct_cards (
  id        uuid primary key default gen_random_uuid(),
  date      date not null,
  card      text default '법인카드',
  bank      text,
  shop      text,
  amount    bigint not null,
  account   text,
  memo      text,
  matched   boolean not null default false,      -- 전표 반영 여부
  created_at timestamptz not null default now()
);

-- 거래처
create table if not exists public.partners (
  id        uuid primary key default gen_random_uuid(),
  name      text not null,
  biz_no    text,
  kind      text,
  memo      text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 5. 인사 · 노무
-- ---------------------------------------------------------------------
-- 급여대장 (월별 묶음)
create table if not exists public.payroll_runs (
  id          uuid primary key default gen_random_uuid(),
  ym          text not null unique,              -- 'YYYY-MM'
  status      text not null default '작성중'
                check (status in ('작성중','상신완료','지급완료','반려')),
  created_by  uuid references public.employees(id) on delete set null,
  submitted_at timestamptz,
  paid_at     timestamptz,
  created_at  timestamptz not null default now()
);

-- 급여 명세 (직원별)
create table if not exists public.payslips (
  id          uuid primary key default gen_random_uuid(),
  run_id      uuid not null references public.payroll_runs(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  base_pay    bigint not null default 0,
  allowances  bigint not null default 0,
  d_pension   bigint not null default 0,
  d_health    bigint not null default 0,
  d_ltc       bigint not null default 0,
  d_employment bigint not null default 0,
  d_income_tax bigint not null default 0,
  d_local_tax bigint not null default 0,
  d_other     bigint not null default 0,
  -- 공제합계·실지급액은 자동계산
  deductions  bigint generated always as
                (d_pension+d_health+d_ltc+d_employment+d_income_tax+d_local_tax+d_other) stored,
  net_pay     bigint generated always as
                (base_pay+allowances
                 -(d_pension+d_health+d_ltc+d_employment+d_income_tax+d_local_tax+d_other)) stored,
  pay_date    date,
  created_at  timestamptz not null default now(),
  unique (run_id, employee_id)
);

-- 연차 신청/부여
create table if not exists public.leave_records (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  leave_type  text not null default '연차',      -- 연차/반차/병가/경조사/공가/출장/생일휴무/대체휴무/대체반차/월차/기타
  status      text not null default '신청' check (status in ('신청','승인','반려')),
  start_date  date,
  end_date    date,
  days        numeric not null default 0,        -- 반차=0.5
  carry_over  numeric not null default 0,        -- 이월
  granted     numeric not null default 0,        -- 올해부여
  reason      text,
  approver    text,
  approved_at timestamptz,
  created_at  timestamptz not null default now()
);

-- 근태(출퇴근)
create table if not exists public.attendance (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  work_date   date not null,
  check_in    timestamptz,
  check_out   timestamptz,
  status      text not null default '근무중' check (status in ('근무중','완료')),
  created_at  timestamptz not null default now(),
  unique (employee_id, work_date)
);

-- ---------------------------------------------------------------------
-- 6. 결재 · 문서 · 일정 · 기록
-- ---------------------------------------------------------------------
-- 전자결재
create table if not exists public.approvals (
  id          uuid primary key default gen_random_uuid(),
  doc_no      text unique,                       -- 제2026-0144호
  kind        text not null default '일반'
                check (kind in ('지출결의서','품의','휴가','일반')),
  drafter_id  uuid references public.employees(id) on delete set null,
  biz_code    text,
  dept_key    text,
  title       text,
  amount      bigint,                            -- 지출결의서
  account     text,
  memo        text,
  project_id  uuid references public.art_projects(id) on delete set null,
  budget_item text,
  req_date    date,
  status      text not null default '기안'
                check (status in ('기안','진행','승인','반려','회수','회계접수')),
  created_at  timestamptz not null default now()
);

-- 결재선 (순차)
create table if not exists public.approval_lines (
  id          uuid primary key default gen_random_uuid(),
  approval_id uuid not null references public.approvals(id) on delete cascade,
  seq         int not null,
  approver_id uuid references public.employees(id) on delete set null,
  role        text not null check (role in ('기안','승인','회계접수')),
  decided     text not null default '대기' check (decided in ('대기','승인','반려')),
  decided_at  timestamptz,
  unique (approval_id, seq)
);

-- 문서함
create table if not exists public.documents (
  id              uuid primary key default gen_random_uuid(),
  title           text not null,
  file_path       text,                          -- Supabase Storage 경로
  category        text,
  owner_id        uuid references public.employees(id) on delete set null,
  share_scope     text not null default '개인' check (share_scope in ('개인','선택','전사')),
  from_approval_id uuid references public.approvals(id) on delete set null,
  created_at      timestamptz not null default now()
);

-- 선택 공유 대상
create table if not exists public.document_shares (
  document_id uuid not null references public.documents(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  primary key (document_id, employee_id)
);

-- 일정표
create table if not exists public.events (
  id          uuid primary key default gen_random_uuid(),
  date        date not null,
  area        text,                              -- 영역 색상 키
  title       text not null,
  employee_id uuid references public.employees(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists idx_events_date on public.events(date);

-- 회의록
create table if not exists public.meetings (
  id          uuid primary key default gen_random_uuid(),
  date        date not null,
  dept        text,
  title       text not null,
  attendees   text,
  body        text,
  created_at  timestamptz not null default now()
);

-- 상품 재고 (상품실)
create table if not exists public.inventory (
  id          uuid primary key default gen_random_uuid(),
  code        text,
  category    text check (category in ('완제품','부자재')),
  name        text not null,
  stock       int not null default 0,
  min_qty     int not null default 0,       -- 적정 재고(이하면 부족)
  unit_price  bigint not null default 0,
  incoming    int not null default 0,       -- 입고 예정
  location    text,
  memo        text,
  updated_at  timestamptz not null default now()
);

-- 매입 이력 (입고 시 자동 기록)
create table if not exists public.purchase_history (
  id          uuid primary key default gen_random_uuid(),
  inventory_id uuid references public.inventory(id) on delete cascade,
  code        text,
  date        date not null default current_date,
  qty         int not null,
  unit_price  bigint not null,
  partner     text,
  doc_no      text,
  created_at  timestamptz not null default now()
);
create index if not exists idx_purchase_hist_inv on public.purchase_history(inventory_id, date);

-- 활동 기록 (감사 로그, append-only)
create table if not exists public.audit_log (
  id          bigint generated always as identity primary key,
  actor_id    uuid,
  action      text not null,
  target      text,
  diff        jsonb,
  at          timestamptz not null default now()
);

-- =====================================================================
-- 끝. 다음: rls.sql (권한) → seed.sql (초기 데이터)
-- =====================================================================
