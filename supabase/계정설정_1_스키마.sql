-- ============================================================
--  곳간 · 이름 로그인 기반 계정 설정 [1/2: 스키마·데이터]
--  · 이름으로 로그인(화면), 내부적으로는 개인 이메일로 인증
--  · 초기비번 0000, 최초 로그인 시 재설정
--  Supabase → SQL Editor 에 붙여넣고 Run.  (그 다음 [2/2] 계정생성 스크립트 실행)
-- ============================================================

-- 1) 컬럼 추가 ------------------------------------------------
alter table public.employees add column if not exists login_email    text;   -- 로그인용(개인 이메일)
alter table public.employees add column if not exists must_change_pw  boolean not null default true; -- 최초 로그인 시 재설정 강제
create unique index if not exists uq_employees_login_email
  on public.employees (lower(login_email)) where login_email is not null;

-- 2) 이정인(신규 직원) 추가 — 이미 있으면 건너뜀 --------------
insert into public.employees (name, dept_key, title, role, is_mgmt, status, sort)
select '이정인', 'art', '연구원', 'user', false, '재직',
       coalesce((select max(sort) from public.employees), 0) + 1
where not exists (select 1 from public.employees where name = '이정인');

-- 3) 로그인 이메일 매핑 (대표님이 주신 개인 이메일) ----------
update public.employees set login_email = v.email
from (values
  ('김다래', 'ekfo1027@gmail.com'),
  ('김도래', 'dorae71052@gmail.com'),
  ('김민겸', 'gmingyeom53@gmail.com'),
  ('김성헌', 'sferty710@gmail.com'),
  ('김유미', 'ymjj258@gmail.com'),
  ('박주희', 'joohee3394@gmail.com'),
  ('유선영', 'bookchon505@gmail.com'),
  ('이윤정', 'jung2357@gmail.com'),
  ('이정인', 'a470622941@gmail.com'),
  ('이규리', 'assam522@gmail.com'),
  ('손문양', 'shonzaka@gmail.com')
) as v(name, email)
where public.employees.name = v.name and public.employees.status = '재직';

-- 4) 관리자 지정: 김도래·김성헌·이윤정·김다래 ----------------
update public.employees
set role = 'admin', is_mgmt = true
where name in ('김도래','김성헌','이윤정','김다래') and status = '재직';
-- 최초 관리자(대표)는 강등·삭제 불가로
update public.employees set is_root = true where name = '김도래' and status = '재직';
-- 관리자 전원에게 전 영역 권한 부여
insert into public.admin_grants (employee_id, area)
select e.id, a.area
from public.employees e
cross join (values ('hr'),('labor'),('accounting')) as a(area)
where e.role = 'admin' and e.status = '재직'
on conflict do nothing;
-- 나머지는 일반 사용자
update public.employees
set role = 'user', is_mgmt = false
where name not in ('김도래','김성헌','이윤정','김다래') and status = '재직';

-- 5) 이름 → 로그인 이메일 RPC (로그인 화면에서 이름만 입력받기 위함) ---
--    anon 이 호출 가능. 비밀번호가 별도로 가드하므로 이메일만으로는 접근 불가.
create or replace function public.login_email_for_name(p_name text)
returns text language sql stable security definer set search_path = public as $$
  select login_email from public.employees
  where name = p_name and status = '재직' and login_email is not null
  limit 1
$$;
grant execute on function public.login_email_for_name(text) to anon, authenticated;

-- 6) 최초 재설정 완료 처리 RPC (본인 플래그만 끔) -------------
create or replace function public.mark_pw_changed()
returns void language sql security definer set search_path = public as $$
  update public.employees set must_change_pw = false where auth_user_id = auth.uid()
$$;
grant execute on function public.mark_pw_changed() to authenticated;

-- 확인
select name as 직원, login_email as 로그인이메일, role as 역할, must_change_pw as 최초재설정필요
from public.employees where status='재직' order by sort;
