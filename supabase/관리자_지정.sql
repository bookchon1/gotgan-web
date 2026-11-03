-- ============================================================
--  곳간 · 내 계정을 "관리자"로 지정
--  진단 결과: 로그인 계정(daisy2281@gmail.com = 김다래)만 연결돼 있고
--             역할이 일반이라, 경영(인사·노무·회계) 메뉴와 전체 데이터가 안 보임.
--  → 이 계정을 관리자 + 경영담당으로 올리면 전부 보입니다.
--  Supabase → SQL Editor 에 붙여넣고 Run → 사이트 로그아웃 후 재로그인.
-- ============================================================

-- 내 계정(연결된 직원)을 관리자로 지정
update public.employees
set role     = 'admin',   -- 관리자 (전 메뉴 접근)
    is_mgmt  = true,       -- 인사·노무·회계 담당 (급여·회계 열람/처리)
    is_root  = true        -- 최초 관리자 (권한 설정의 기준 계정)
where auth_user_id is not null          -- 로그인에 연결된 계정만
  and lower(email) = lower('daisy2281@gmail.com');   -- ← 본인 로그인 이메일

-- 관리자는 전 기능 접근 권한을 가집니다 (admin_grants 전 영역 부여)
insert into public.admin_grants (employee_id, area)
select e.id, a.area
from public.employees e
cross join (values ('hr'),('labor'),('accounting')) as a(area)
where e.auth_user_id is not null
  and lower(e.email) = lower('daisy2281@gmail.com')
on conflict do nothing;

-- 확인: 내 계정이 관리자로 바뀌었는지
select name as 직원, email as 이메일, role as 역할, is_mgmt as 경영담당, is_root as 최초관리자
from public.employees
where lower(email) = lower('daisy2281@gmail.com');
