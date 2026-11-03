-- ============================================================
--  곳간 · 인사관리 확장 [대기업형 상세 인사카드]
--  · 민감정보(주민번호·계좌)는 제외 — 추후 보안 보강 후 별도 추가
--  · employees 컬럼 추가 + 인사발령 이력 테이블(hr_assignments)
--  Supabase → SQL Editor 에 붙여넣고 Run. (idempotent)
-- ============================================================

-- 1) employees 상세 컬럼 추가 --------------------------------
alter table public.employees add column if not exists emp_no          text;    -- 사번
alter table public.employees add column if not exists birth_md        text;    -- 생일(월-일만, 예 '03-15') — 생년(연도)은 저장하지 않음(프라이버시). 생일 휴가 자동부여용
alter table public.employees add column if not exists gender          text;    -- 성별(남/여/기타)
alter table public.employees add column if not exists employment_type text;    -- 고용형태(정규직/계약직/일용직/파견)
alter table public.employees add column if not exists position         text;    -- 직책(팀장/실장 등) — title(직급)과 구분
alter table public.employees add column if not exists join_date        date;    -- 입사일(정확한 날짜)
alter table public.employees add column if not exists leave_date       date;    -- 퇴사일
alter table public.employees add column if not exists address          text;    -- 주소
alter table public.employees add column if not exists emergency_name   text;    -- 비상연락처(이름/관계)
alter table public.employees add column if not exists emergency_phone  text;    -- 비상연락처(번호)
alter table public.employees add column if not exists education        text;    -- 최종학력
alter table public.employees add column if not exists career           text;    -- 경력 요약(자유서술)
alter table public.employees add column if not exists certifications   text;    -- 자격증(자유서술)
alter table public.employees add column if not exists memo             text;    -- 인사 메모

-- 사번 자동 채움(없는 재직자): BC + 입사연도 + 순번 형태 간단 부여
-- (window 함수는 UPDATE 직접 사용 불가 → 서브쿼리에서 번호 매긴 뒤 조인)
update public.employees e set emp_no =
  'BC' || coalesce(to_char(coalesce(e.join_date, now()::date), 'YYYY'), '____') || '-' ||
  lpad(s.rn::text, 3, '0')
from (
  select id, row_number() over (order by sort) as rn
  from public.employees
  where emp_no is null
) s
where e.id = s.id and e.emp_no is null;

-- join_ym(텍스트 'YYYY.MM')만 있고 join_date 가 없으면 1일로 보정
update public.employees
set join_date = to_date(replace(join_ym, '.', '-') || '-01', 'YYYY-MM-DD')
where join_date is null and join_ym ~ '^\d{4}\.\d{2}$';

-- 고용형태 기본값(미지정 재직자) = 정규직
update public.employees set employment_type = '정규직'
where employment_type is null and status = '재직';

-- 2) 인사발령 이력 테이블 ------------------------------------
create table if not exists public.hr_assignments (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  eff_date    date not null,                 -- 발령일
  kind        text not null,                 -- 입사/승진/부서이동/보직변경/휴직/복직/퇴직 등
  detail      text,                          -- 내용(예: 미술팀 → 경영팀, 연구원 → 선임연구원)
  note        text,                          -- 비고
  created_at  timestamptz not null default now()
);
create index if not exists idx_hr_assignments_emp on public.hr_assignments (employee_id, eff_date desc);

-- 기존 재직자: 입사 발령 1건씩 자동 생성(없으면)
insert into public.hr_assignments (employee_id, eff_date, kind, detail)
select e.id, coalesce(e.join_date, now()::date), '입사', '신규 입사'
from public.employees e
where e.status = '재직'
  and not exists (select 1 from public.hr_assignments h where h.employee_id = e.id and h.kind = '입사');

-- 3) RLS: 관리자만 인사발령 열람/편집 -----------------------
alter table public.hr_assignments enable row level security;

drop policy if exists hra_admin_all on public.hr_assignments;
create policy hra_admin_all on public.hr_assignments
  for all to authenticated
  using (public.app_is_admin())
  with check (public.app_is_admin());

-- 확인
select emp_no as 사번, name as 이름, employment_type as 고용형태,
       join_date as 입사일, position as 직책, title as 직급
from public.employees where status='재직' order by sort;
