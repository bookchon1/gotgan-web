-- =====================================================================
-- 곳간 — 묶음 4b : 부서 전용 화면 (홍보 / 체험 / 교육 진도·자료·납부)
-- 북촌불교미술보존연구소 사내 인트라넷
--
-- 실행 순서: schema.sql → rls.sql → functions.sql → (묶음2/3/4a/인사확장) → 이 파일
-- 금액 단위: 원(bigint). PK: uuid(gen_random_uuid()).
--
-- 개요: 홍보·체험·교육 부서 화면이 공용 업무목록(work_tasks)으로 축소되어 있어,
--       시안의 전용 테이블 6종을 추가한다. 쓰기는 관리자(app_is_admin), 읽기는 재직 직원.
--       (부서 전담 역할 함수가 없어 기존 패턴대로 admin 쓰기로 둔다.)
--       수업자료 파일 실체는 Supabase Storage('edu-materials' 버킷)로 별도 관리 — 여기선 메타데이터 테이블만.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) 홍보 활동 (홍보현황)
-- ---------------------------------------------------------------------
create table if not exists public.promo_activities (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,                     -- 홍보 활동명
  channel     text,                              -- 인스타그램|블로그|보도자료|...
  owner_id    uuid references public.employees(id) on delete set null,  -- 담당자
  start_date  date,
  end_date    date,
  status      text not null default 'prog' check (status in ('plan','prog','done')), -- 제작중/게시완료 등
  link        text,                              -- 게시 링크(URL)
  memo        text,
  created_at  timestamptz not null default now()
);
create index if not exists idx_promo_status on public.promo_activities(status);

-- ---------------------------------------------------------------------
-- 2) 체험 종류 (체험현황)
-- ---------------------------------------------------------------------
create table if not exists public.experience_types (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,                     -- 체험명
  category    text,                              -- 분류(전통미술·공예 등)
  target      text,                              -- 대상(초등~성인 등)
  duration    text,                              -- 소요시간(표시용 '90분')
  capacity    int,                               -- 정원(명)
  place       text,                              -- 장소
  active      boolean not null default true,     -- 운영중/중지
  memo        text,
  created_at  timestamptz not null default now()
);
create index if not exists idx_experience_active on public.experience_types(active);

-- ---------------------------------------------------------------------
-- 3) 교육 학생 (수업진도·납부 공용)
-- ---------------------------------------------------------------------
create table if not exists public.edu_students (
  id          uuid primary key default gen_random_uuid(),
  student_no  text unique,                       -- ED-00000231
  name        text not null,
  year        int,                               -- 수강 연도
  class_main  text,                              -- 반 (전문반|취미반)
  class_sub   text,                              -- 세부 (정규반|시험반)
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
create index if not exists idx_edu_students_year on public.edu_students(year);

-- ---------------------------------------------------------------------
-- 4) 교육 수업진도 — 학생별 과목 이수 체크
--    시안: 이론 8 + 실기 8 + 시험 2 = 18과목. 과목 1개 = 1행.
--    section: '이론'|'실기'|'시험'. done: 이수 여부.
-- ---------------------------------------------------------------------
create table if not exists public.edu_progress (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references public.edu_students(id) on delete cascade,
  section     text not null check (section in ('이론','실기','시험')),
  subject     text not null,                     -- 과목명(단청학개론·기법 등)
  done        boolean not null default false,
  sort        int not null default 0,
  updated_at  timestamptz not null default now(),
  unique (student_id, section, subject)
);
create index if not exists idx_edu_progress_student on public.edu_progress(student_id);

-- ---------------------------------------------------------------------
-- 5) 교육 수업자료 — 이수과목별 자료 메타데이터
--    실제 파일은 Storage 버킷 'edu-materials' (비공개). file_path = 버킷 내 경로.
-- ---------------------------------------------------------------------
create table if not exists public.edu_materials (
  id          uuid primary key default gen_random_uuid(),
  section     text,                              -- 이론|실기|시험
  subject     text,                              -- 이수과목(단청학개론 등)
  title       text not null,                     -- 자료 제목
  note        text,                              -- 부가 설명(1~3주차 이론 등)
  file_path   text,                              -- Storage 경로(없으면 메타만)
  file_name   text,                              -- 표시용 파일명
  file_size   bigint,                            -- 바이트
  uploader_id uuid references public.employees(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists idx_edu_materials_subject on public.edu_materials(subject);

-- ---------------------------------------------------------------------
-- 6) 교육 납부현황 — 월별 수강료 청구·납부
--    미납액 = charged - paid (앱에서 계산 표시). 청구월 'YYYY-MM'.
-- ---------------------------------------------------------------------
create table if not exists public.edu_payments (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references public.edu_students(id) on delete cascade,
  charge_ym   text not null,                     -- 청구월 'YYYY-MM'
  charged     bigint not null default 0,         -- 청구액(원)
  paid        bigint not null default 0,         -- 납부액(원)
  method      text,                              -- 계좌이체|카드|현금|기타
  paid_date   date,
  memo        text,
  created_at  timestamptz not null default now(),
  unique (student_id, charge_ym)
);
create index if not exists idx_edu_payments_ym on public.edu_payments(charge_ym);

-- ---------------------------------------------------------------------
-- RLS — 읽기: 재직 직원 / 쓰기: 관리자 (기존 패턴)
-- ---------------------------------------------------------------------
alter table public.promo_activities  enable row level security;
alter table public.experience_types  enable row level security;
alter table public.edu_students       enable row level security;
alter table public.edu_progress       enable row level security;
alter table public.edu_materials       enable row level security;
alter table public.edu_payments        enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'promo_activities','experience_types','edu_students',
    'edu_progress','edu_materials','edu_payments'
  ] loop
    execute format('drop policy if exists %I_sel on public.%I', t, t);
    execute format('create policy %I_sel on public.%I for select to authenticated using (public.app_is_active_employee())', t, t);
    execute format('drop policy if exists %I_ins on public.%I', t, t);
    execute format('create policy %I_ins on public.%I for insert to authenticated with check (public.app_is_admin())', t, t);
    execute format('drop policy if exists %I_upd on public.%I', t, t);
    execute format('create policy %I_upd on public.%I for update to authenticated using (public.app_is_admin()) with check (public.app_is_admin())', t, t);
    execute format('drop policy if exists %I_del on public.%I', t, t);
    execute format('create policy %I_del on public.%I for delete to authenticated using (public.app_is_admin())', t, t);
  end loop;
end $$;

-- =====================================================================
-- 참고: 수업자료 파일 업로드를 쓰려면 Supabase Storage 에 비공개 버킷
--   'edu-materials' 를 만들고, authenticated 사용자에게 read/write 정책을 부여하세요.
--   (Storage 정책은 SQL 이 아니라 Supabase 대시보드 Storage 메뉴에서 설정)
-- 데모 데이터는 넣지 않음 — 실제 학생·활동은 앱에서 등록.
-- =====================================================================
