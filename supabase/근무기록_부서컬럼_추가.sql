-- =====================================================================
-- 곳간 — 일용직 근무기록(labor_attendance)에 '부서(dept_key)' 컬럼 추가
--
-- 변경: 근무추가 입력을 '사업현장·근무장소' → '부서 + 업무내용'으로 바꿈.
--   · dept_key : 근무한 부서 (art/management/product/promotion/experience/education)
--   · place    : 업무 내용(무슨 일) — 기존 컬럼 재사용
-- 멱등(여러 번 실행 가능).
-- =====================================================================

alter table public.labor_attendance
  add column if not exists dept_key text;

-- 확인
select work_date as 근무일, dept_key as 부서, place as 업무내용
from public.labor_attendance order by work_date desc limit 10;
