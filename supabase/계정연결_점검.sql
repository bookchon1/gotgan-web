-- ============================================================
--  곳간 · 로그인 계정 ↔ 직원 연결 점검 / 복구
--  "로그인은 되는데 화면이 비고 데이터가 안 보임" = 계정이 직원과 연결 안 된 상태.
--  Supabase → SQL Editor 에서 ①진단 → (필요시) ②복구 순서로 실행하세요.
-- ============================================================

-- ─────────────── ① 진단 (읽기 전용, 안전) ───────────────
-- 현재 로그인 계정과 직원이 얼마나 연결돼 있는지 봅니다.
select
  (select count(*) from auth.users)                                        as 로그인계정수,
  (select count(*) from public.employees)                                  as 직원수,
  (select count(*) from public.employees where auth_user_id is not null)   as 연결된직원수;

-- 이메일은 같은데 아직 연결 안 된(= auth_user_id 비어있는) 직원 목록
select e.name as 직원, e.email as 직원이메일, u.id as 연결가능한계정
from public.employees e
join auth.users u on lower(u.email) = lower(e.email)
where e.auth_user_id is null;

-- auth 계정은 있는데 직원 이메일과 안 맞아 못 붙는 계정(= 이메일 오타 등)
select u.email as 계정이메일, '직원 이메일과 불일치' as 상태
from auth.users u
where not exists (select 1 from public.employees e where lower(e.email)=lower(u.email));


-- ─────────────── ② 복구: 이메일로 자동 연결 ───────────────
-- employees.email 과 auth.users.email 이 같은 직원을 자동으로 연결합니다.
-- (위 ① 두 번째 쿼리에 뜬 직원들이 연결됩니다. 이메일이 비어있으면 먼저 employees.email 을 채워주세요)
update public.employees e
set auth_user_id = u.id
from auth.users u
where lower(u.email) = lower(e.email)
  and e.email is not null
  and e.auth_user_id is null;

-- 연결 후 재확인
select name as 직원, email as 이메일, (auth_user_id is not null) as 연결됨
from public.employees
order by sort;
