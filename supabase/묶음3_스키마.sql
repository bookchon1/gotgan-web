-- =====================================================================
-- 곳간 — 묶음3 스키마 보강 (회계관리 보강)
--
-- 실행 순서: schema.sql → rls.sql → functions.sql 이후에 마지막으로 실행.
-- (이 파일은 직접 실행하지 마세요 — 검토 후 Supabase SQL Editor 에서 적용.)
--
-- 이 파일이 다루는 범위: 거래처(partners) 상세 필드 추가뿐입니다.
--   · 묶음3-1 업체정보 상세 필드 + "+ 업체 등록"  → partners 컬럼 추가 (아래 1.)
--   · 묶음3-2 전표내역 "+ 예외 전표" 직접입력      → 컬럼/정책 변경 없음 (아래 2.)
--   · 묶음3-3 권한검증 라이브 테스트(200/403)      → 컬럼/정책 변경 없음 (아래 3.)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. partners — 거래처 상세 필드 추가
--    (기존 schema.sql: id, name, biz_no, kind, memo, created_at)
--    업체정보 화면/등록 모달이 쓰는 담당자·연락처 등 6개 컬럼을 추가합니다.
--    모두 nullable(선택 입력). '연거래액(year)'은 시안에 있으나 요구에서 제외.
--    add column if not exists 로 멱등 실행 가능.
-- ---------------------------------------------------------------------
alter table public.partners add column if not exists person  text;  -- 담당자
alter table public.partners add column if not exists title   text;  -- 직책
alter table public.partners add column if not exists phone1  text;  -- 연락처1(대표)
alter table public.partners add column if not exists phone2  text;  -- 연락처2
alter table public.partners add column if not exists email   text;  -- 이메일
alter table public.partners add column if not exists address text;  -- 주소

-- ---------------------------------------------------------------------
-- 2. RLS — partners 쓰기(insert/update) 정책: 변경 불필요
--    rls.sql 에 이미 아래 정책이 있어 회계담당(app_is_accounting_mgr)에게
--    partners 의 모든 작업(select/insert/update/delete)이 허용됩니다.
--
--      -- 회계(전표·카드·거래처): 회계 담당·관리자만
--      foreach t in array array['acct_tx','acct_cards','partners'] loop
--        create policy <t>_acct on public.<t>
--          for all to authenticated
--          using (public.app_is_accounting_mgr())
--          with check (public.app_is_accounting_mgr());
--      end loop;
--
--    'for all' 정책이 insert 의 with check 와 update 의 using/with check 를
--    모두 포함하므로 "+ 업체 등록"(insert)에 추가 정책이 필요 없습니다.
--    → partners 관련 RLS 변경 없음.
--
-- ---------------------------------------------------------------------
-- 3. 예외 전표 직접입력 / 권한검증 라이브 테스트 — 변경 불필요
--    · 예외 전표(acct_tx insert): 위 acct_tx_acct('for all', 회계담당) 정책으로 허용 — 변경 없음.
--    · 권한검증은 로그인 계정으로 민감 테이블에 head+count SELECT 를 보내
--      서버 응답(허용/차단)을 그대로 보여줄 뿐이며, 기존 조회 정책을
--      그대로 사용합니다(employees, payroll_runs, payslips, acct_tx, permissions).
--      → 신규 정책/컬럼 없음.
-- =====================================================================
-- 끝.
-- =====================================================================
