-- =====================================================================
-- 곳간 — 초기 데이터 (시드)
-- schema.sql → rls.sql 다음에 실행.
-- 멱등(여러 번 실행해도 안전): on conflict 처리.
--
-- ⚠️ 직원은 로그인 계정(auth.users)과 분리해서 먼저 넣습니다.
--    실제 로그인 계정은 Supabase Auth 에서 생성 후, 아래 '계정 연결' 안내대로
--    auth_user_id 를 채우세요.
-- =====================================================================

-- 1) 사업자 3곳
insert into public.businesses (code, name, kind, sort) values
  ('법인',   '(주)북촌불교미술연구소', '법인', 1),
  ('개인',   '도래헌',                 '개인', 2),
  ('더북촌', '더북촌',                 '개인', 3)
on conflict (code) do update
  set name = excluded.name, kind = excluded.kind, sort = excluded.sort;

-- 2) 부서(영역)
insert into public.departments (key, label, admin_only, locked, sort) values
  ('management', '경영', true,  false, 1),
  ('art',        '미술', false, false, 2),
  ('product',    '상품', false, true,  3),
  ('promotion',  '홍보', false, true,  4),
  ('experience', '체험', false, true,  5),
  ('education',  '교육', false, true,  6),
  ('',           '대표', false, false, 0)
on conflict (key) do update
  set label = excluded.label, admin_only = excluded.admin_only,
      locked = excluded.locked, sort = excluded.sort;

-- 3) 직원 12명 (시안 기준). 이름으로 멱등 처리.
--    role: admin/user, is_mgmt: 인사·노무·회계 담당(이윤정)
insert into public.employees (name, dept_key, title, join_ym, role, is_mgmt, is_root, status, sort) values
  ('김도래', '',           '대표',       '2020.01', 'admin', false, true,  '재직', 1),
  ('김성헌', 'art',        '실장',       '2020.01', 'admin', false, false, '재직', 2),
  ('이규리', 'product',    '수석강사',   '2022.01', 'user',  false, false, '재직', 3),
  ('이윤정', 'management', '팀장',       '2024.07', 'admin', true,  false, '재직', 4),
  ('유선영', 'art',        '선임연구원', '2025.04', 'user',  false, false, '재직', 5),
  ('김다래', 'art',        '연구원',     '2025.01', 'admin', false, false, '재직', 6),
  ('김유미', 'promotion',  '사원',       '2026.02', 'user',  false, false, '재직', 7),
  ('나지예', 'art',        '연구원',     '2026.02', 'user',  false, false, '재직', 8),
  ('손문양', 'art',        '연구원',     '2026.04', 'user',  false, false, '재직', 9),
  ('박주희', 'art',        '연구원',     '2026.04', 'user',  false, false, '재직', 10),
  ('김민겸', 'art',        '연구원',     '2026.07', 'user',  false, false, '재직', 11),
  ('최지성', 'art',        '연구원',     '2026.09', 'user',  false, false, '재직', 12)
on conflict do nothing;

-- 4) 관리자 영역 권한: 이윤정 = 인사·노무·회계 전부 담당
insert into public.admin_grants (employee_id, area)
select e.id, a.area
from public.employees e
cross join (values ('hr'),('labor'),('accounting')) as a(area)
where e.name = '이윤정'
on conflict do nothing;

-- 5) 기본 기능권한: 모든 재직자에게 업무/문서/결재/일정 on
insert into public.permissions (employee_id, feature, enabled)
select e.id, f.feature, true
from public.employees e
cross join (values ('tasks'),('documents'),('approvals'),('calendar')) as f(feature)
where e.status = '재직'
on conflict do nothing;

-- =====================================================================
-- 계정 연결 안내 (로그인 가능하게 만들기)
-- ---------------------------------------------------------------------
-- 1. Supabase 대시보드 → Authentication → Users → "Add user" 로
--    각 직원 이메일/비밀번호 계정을 생성합니다. (또는 앱 회원가입)
-- 2. 생성된 auth 계정의 id(uuid) 를 해당 직원과 연결:
--
--    update public.employees
--      set auth_user_id = '<auth.users의 uuid>', email = '<그 이메일>'
--      where name = '이윤정';
--
--    (이메일로 자동 매칭하려면, employees.email 을 먼저 채워두고:
--     update public.employees e set auth_user_id = u.id
--       from auth.users u where u.email = e.email and e.auth_user_id is null; )
-- 3. 최소 1명(이윤정/관리자)을 연결하면 로그인·전체 기능 확인이 가능합니다.
-- =====================================================================
