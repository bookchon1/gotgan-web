-- =====================================================================
-- 곳간 — 회계관리 데모(샘플) 데이터 삭제
--
-- 목적: 시안용으로 넣었던 가짜 회계 데이터를 비우고, 실제 데이터를 입력할
--       빈 상태로 만든다.
-- 대상 테이블(회계관리가 사용):
--   · acct_tx     — 전표/거래 내역 (수입·지출)
--   · acct_cards  — 법인카드 미처리 내역
--   · partners    — 거래처
--
-- ⚠️ 주의
--   - 이 스크립트는 위 3개 테이블의 '모든' 행을 삭제합니다.
--     (데모만 구분하는 표시 컬럼이 없어, 전체 비우기로 새로 시작합니다)
--   - 아직 실제 데이터를 입력하지 않았다면 안전합니다.
--   - 급여대장/명세(payroll_runs·payslips)나 사업(art_projects)은 건드리지 않습니다.
--   - acct_tx.project_id 는 art_projects 를 참조하지만 삭제해도 사업 데이터에
--     영향 없습니다(참조만 끊김). 사업 데이터 자체는 그대로 남습니다.
--
-- 실행 전 현재 건수 확인 → 삭제 → 삭제 후 0 확인 순서입니다.
-- =====================================================================

-- 1) 삭제 전 현재 건수 (확인용)
select '삭제 전' as 구분,
       (select count(*) from public.acct_tx)    as 전표,
       (select count(*) from public.acct_cards) as 법인카드,
       (select count(*) from public.partners)   as 거래처;

-- 2) 삭제 (회계 3개 테이블 전체 비우기)
delete from public.acct_tx;
delete from public.acct_cards;
delete from public.partners;

-- 3) 삭제 후 건수 (모두 0 이어야 함)
select '삭제 후' as 구분,
       (select count(*) from public.acct_tx)    as 전표,
       (select count(*) from public.acct_cards) as 법인카드,
       (select count(*) from public.partners)   as 거래처;
