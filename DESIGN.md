# 곳간 (BOOKCHON WORKSPACE) — 웹앱 설계 문서

> 북촌불교미술보존연구소 사내 인트라넷 · React + Supabase 재구축
> 기준: 확정된 HTML 시안 (`곳간_웹_시안.html`)의 화면·흐름·디자인을 **그대로** 구현
> 작성: 2026-11

---

## 0. 목표와 원칙

- **시안 그대로**: 색감(모던그린), 레이아웃, 화면 구성, 드릴다운·모달 동작을 시안과 동일하게 유지한다.
- **진짜로 저장된다**: 시안의 JS 배열(더미 데이터)을 Supabase(PostgreSQL) 테이블로 바꾸고, 로그인·권한·CRUD가 실제로 동작한다.
- **새 Supabase 프로젝트**: 기존 PyQt 앱의 Supabase와 분리된 새 프로젝트로 시작한다. 기존 회계·직원 데이터는 **맨 마지막에 이관**한다 (기존 DB는 그대로 보존).
- **다중 사용자 + 권한**: Supabase Auth 로그인, RLS(Row Level Security)로 "관리자 / 일반 사용자", "본인 것만 보기"를 서버에서 강제한다.
- **배포**: GitHub 저장소 → (Vercel 등) 호스팅.

---

## 1. 회사 구조 (시안 확정값)

### 1-1. 사업자 3곳
| 키 | 회사명(상호) | 구분 | 표기 |
|----|------------|------|------|
| `법인` | (주)북촌불교미술연구소 | 법인 | (주)북촌불교미술연구소 (법인) |
| `개인` | 도래헌 | 개인 | 도래헌 (개인) |
| `더북촌` | 더북촌 | 개인 | 더북촌 (개인) |

- 표기 규칙: **회사명(구분)**. (`bizLabel()`)
- 사업자별 소속 부서(`ACCT_ORG`):
  - 법인 → 경영, 미술
  - 개인(도래헌) → 상품, 홍보, 경영, 교육, 체험
  - 더북촌 → 경영

### 1-2. 부서(영역) — 6개 + 대표
| deptKey | 라벨 | 성격 |
|---------|------|------|
| `art` | 미술 | 사업관리·현장관리 (핵심) |
| `management` | 경영 | 인사·노무·회계 (관리자 전용 메뉴) |
| `product` | 상품 | 재고현황 |
| `promotion` | 홍보 | 홍보현황 |
| `experience` | 체험 | 체험현황 |
| `education` | 교육 | 수업진도·자료·납부 |
| `''`(빈값) | 대표 | 소속 없음, 대표 |

### 1-3. 직원 (시안 12명 — 초기 시드)
`이윤정`(경영 팀장)이 로그인 데모 계정이자 **인사·노무·회계 담당(mgmt)** + 관리자.
관리자(admin): 김도래(대표), 김성헌(미술 실장), 이윤정(경영 팀장), 김다래(미술 연구원).
나머지는 일반 사용자(user). `status`=재직/퇴직(재직만 집계).

---

## 2. 권한 모델

### 2-1. 역할
- **admin (관리자)**: 모든 화면 접근. 인사관리·노무관리·회계관리·사용자관리 포함.
- **user (일반 사용자)**: 업무·문서·결재·일정 + 본인 부서 현황. 인사/노무/회계/사용자관리 **불가**. 급여·연차·근태는 **본인 것만**.
- **mgmt (담당자 플래그)**: 인사·노무·회계 실무 담당(=이윤정). 회계접수·급여대장 소유자.
- **최초 관리자(root)**: 삭제·강등 불가인 최상위 관리자(선택).

### 2-2. 서버 강제 (RLS 요약)
| 데이터 | 일반 사용자 | 관리자 |
|--------|------------|--------|
| 직원 명부(employees) | 조회만(이름·부서·직급) | 전체 CRUD |
| 급여(payroll) | 본인 명세만 | 전체 |
| 연차·근태(leave/attendance) | 본인만 | 전체 |
| 업무(work_tasks) | 전체 조회, 본인 것 수정 | 전체 |
| 전자결재(approvals) | 본인 기안/본인 결재단계 | 전체 |
| 문서(documents) | 공유범위(개인/선택/전사)에 따라 | 전체 |
| 회계 전표(acct_tx) | ✕(조회 불가) | 전체 |
| 사업·예산(art_projects 등) | 조회 | 전체 CRUD |

- 패턴: `SECURITY DEFINER` 헬퍼 함수 + 테이블 GRANT 선행 + 민감 테이블 append-only + **변경은 RPC로만**.
  - 기존 `곳간_급여_RLS.sql`(Gen-2)이 이미 이 구조로 잘 설계돼 있어 **그대로 계승**한다:
    - `app_is_admin()` — `employees.is_admin AND status='재직'` (auth.uid 기준)
    - `app_has_grant(area)` — `admin_grants`에 area(hr/labor/accounting) 행 존재
    - `app_is_payroll_mgr()` = `app_has_grant('labor')`, `app_is_active_employee()`, `app_owns_slip_in_run(run)`
    - ⚠️ 정책 안에서 `employees`/`admin_grants`를 직접 조회하면 **RLS 무한재귀(42P17)** 발생 → 반드시 DEFINER 함수로 우회.
    - `payroll_runs`/`expense_docs`/`ledger_entries`는 **INSERT/UPDATE/DELETE 정책 없음** → 직접 쓰기 차단, 상태변경은 RPC(`copy_prev_payroll`, `submit_payroll_expense`, `post_payroll_to_ledger`)로만.
    - append-only 감사: `fn_audit()` 트리거.
  - ⛔ **버리는 것**: 기존 PyQt(Gen-1)의 `anon USING(true) WITH CHECK(true)` 전면개방 정책. 이름로그인에 세션이 없어 생긴 구멍(anon 키만 있으면 급여·주민번호까지 접근). React는 Supabase Auth + 실제 RLS로 정상화.
  - RLS 작동에는 명시적 GRANT 필수: `grant usage on schema public`, `grant select,insert,update,delete on <table> to authenticated`, `grant usage,select on all sequences`.

---

## 3. 화면 목록 (시안 = 사이드바 구조)

### 3-1. 공통 네비게이션
- **상단바**: 로고/곳간, 사업자 전환(선택), 사용자 메뉴.
- **좌측 사이드바** (접힘/펼침):
  - 홈(dashboard)
  - 업무관리(tasks) — 영역별 서브메뉴 아코디언
    - 경영: 인사관리·노무관리·회계관리·업무현황 *(관리자 잠금)*
    - 미술: 사업관리·현장관리·업무현황
    - 상품: 재고현황·업무현황 *(잠금)*
    - 홍보: 홍보현황·업무현황 *(잠금)*
    - 체험: 체험현황·업무현황 *(잠금)*
    - 교육: 수업진도·수업자료·납부현황·업무현황 *(잠금)*
  - 전자결재(approvals)
  - 문서보관(documents)
  - 일정표(calendar)
  - *(관리자)* 사용자관리(users) · 권한 검증(security) · 활동 기록(activity)

### 3-2. 화면별 명세 (라우트)

| 라우트 | 화면 | 핵심 기능 | 데이터원본 |
|--------|------|----------|-----------|
| `/` | 홈 대시보드 | 요약 위젯(업무·결재·일정·공지) | 집계 |
| `/tasks/:area` | 업무현황 | 영역별 업무 목록(완료 체크·상태) | work_tasks |
| `/ops/art` | 미술 사업관리 | 사업 목록(진행중/당해연도, 완료 토글) | art_projects |
| `/ops/art/:id` | 사업 상세 | 아코디언 3섹션(아래) | art_projects + 하위 |
| `/ops/art-field` | 현장관리 | 현장 목록 | (사업 하위) |
| `/ops/product` | 재고현황 | 재고·발주·입고 | inventory |
| `/ops/promotion` | 홍보현황 | 채널·게시 | (업무) |
| `/ops/experience` | 체험현황 | 체험 종류·일정 | (업무) |
| `/ops/edu-*` | 교육 | 진도·자료·납부 | (업무) |
| `/hr` | 인사관리 | 직원 명부 CRUD(편집모드) | employees |
| `/labor` | 노무관리 | 급여대장·명세·연차·근태 | payroll, leave, attendance |
| `/accounting` | 회계관리 | 자금현황·접수대기·전표·카드·거래처·보고서 | acct_tx 등 |
| `/approvals` | 전자결재 | 기안·결재선·이력·지출결의서 | approvals |
| `/documents` | 문서보관 | 공유범위별 문서함 | documents |
| `/calendar` | 일정표 | 월간 달력(영역 필터) | events |
| `/users` | 사용자관리 | 계정·권한 | employees + 권한 |
| `/security` | 권한 검증 | 권한 매트릭스 확인 | (조회) |
| `/activity` | 활동 기록 | 감사 로그 | audit_log |
| `/login` | 로그인 | Supabase Auth | auth |

### 3-3. 사업 상세 아코디언 (3섹션 — 시안 확정)
1. **사업개요** — 한 섹션에 정보항목 나열:
   - 발주/입찰: `구분(입찰/발주)` · 발주기관 · 사업유형 · 추정금액 / 일정 · 결과 · 추진현황
   - 계약·일정, 관계자(발주담당 등 3명 + 자문위원), 자문위원 목록
   - 준공 일자 미입력 시 `진행중` 칩 표시
   - "지출결의서 상신" → 자문회의 **차수 입력** 모달 (사업명+N차 자문회의, 위원별 자문비 기본 30만원 수정가능, 결재선 기안→승인→회계접수)
2. **예산 현황** — 9대 예산항목 카드(예산액/집행액/잔여예산/집행율), 합계 카드, "내역 보기" 팝업. 설계변경(증액/감액 준공)→계약금·미수금 자동 반영.
3. **세부 진행 현황** — 기본 20공정(순서형), 공정 추가(위치지정)·삭제·상태·이름 수정, 진행률=(완료+진행×0.5)/(전체−해당없음). 공정별 코멘트는 우측 적요로 표시. 일정 있는 공정 → 업무현황 자동 연동.

---

## 4. DB 스키마 (신규 Supabase)

> 명명: 영문 snake_case 테이블/컬럼. 금액은 `bigint`(원 단위). 모든 테이블 `id uuid default gen_random_uuid()`, `created_at timestamptz default now()`.

### 4-1. 조직·계정
```
businesses        사업자 3곳
  code text PK           -- '법인' | '개인' | '더북촌'
  name text              -- 상호 (주)북촌...
  kind text              -- '법인' | '개인'
  sort int

departments       부서
  key text PK            -- 'art' | 'management' | ... | '' (대표)
  label text             -- '미술'
  admin_only bool        -- management = true
  locked bool            -- product/promotion/experience/education
  sort int

employees         직원 (인사기록 + 계정 연결)
  id uuid PK
  auth_user_id uuid      -- auth.users FK (로그인 계정, nullable)
  name text NOT NULL
  dept_key text FK→departments
  title text             -- 직급
  join_ym text           -- 입사 'YYYY.MM'
  role text              -- 'admin' | 'user'
  is_mgmt bool           -- 인사·노무·회계 담당
  is_root bool           -- 최초 관리자
  status text            -- '재직' | '퇴직'
  email text
  phone text
  sort int

permissions       기능별 권한(선택: 직원마다 업무/문서/결재/일정 on/off)
  employee_id uuid FK
  feature text           -- 'tasks'|'documents'|'approvals'|'calendar'
  enabled bool
```

### 4-2. 업무
```
work_tasks        업무현황
  id uuid PK
  area text              -- 'management'|'art'|'product'|...
  title text
  dept text
  detail text            -- 세부분류(노무/회계/작업/조사/설계...)
  owner_id uuid FK→employees
  reg_date date          -- 등록
  start_date date
  due_date date
  status text            -- 'plan'|'prog'|'done'
  src text               -- 출처 태그(사업/홍보/종류: ...)
  src_project_id uuid    -- 사업 연동 시
```

### 4-3. 미술 사업 (핵심)
```
art_projects      사업
  id uuid PK
  name text
  client text            -- 발주기관
  biz_code text FK→businesses  -- 보통 '법인'
  proj_type text         -- 서화|조형|건축
  kind text              -- '입찰'|'발주' (구분)
  status text            -- '공고/입찰'|'예정'|'진행'|'완료'|'탈락/보류'
  progress int           -- 0~100 (세부공정에서 자동 계산)
  now_text text          -- 추진현황 한 줄
  est_amount bigint      -- 추정금액
  owner_id uuid FK
  contract_base bigint   -- 당초 계약금
  due_date date          -- 준공 예정
  done_date date         -- 준공 실제 (null=진행중)
  year int               -- 당해연도 필터용

art_budget        사업별 9대 예산항목 (배정액)
  id uuid PK
  project_id uuid FK
  item text              -- 재료비|노무비|경비|외주가공비|이윤|보존처리계획|자문회비...
  alloc bigint           -- 배정액
  (집행액은 acct_tx 집계)

budget_changes    설계변경 (증액/감액 준공)
  id uuid PK
  project_id uuid FK
  date date
  type text              -- '증액'|'감액'
  memo text
  after_amount bigint    -- 변경 후 계약금

budget_receipts   대금 수령(선금·기성)
  id uuid PK
  project_id uuid FK
  kind text              -- '선금'|'기성'|'잔금'
  date date
  amount bigint

project_steps     세부 진행 공정 (순서형, 기본 20)
  id uuid PK
  project_id uuid FK
  seq int                -- 순번(1..N)
  title text             -- 공정명
  status text            -- 'before'|'prog'|'done'|'na'
  from_date date
  to_date date

step_comments     공정 코멘트(적요)
  id uuid PK
  step_id uuid FK
  by_id uuid FK→employees
  date date
  text text

advisors          자문위원 (사업별)
  id uuid PK
  project_id uuid FK
  name text
  org text
  phone text
  default_fee bigint     -- 기본 30만원
```

### 4-4. 회계
```
acct_tx           전표 (수입·지출)
  id uuid PK
  date date
  biz_code text FK→businesses
  dept_key text
  tx_type text           -- '수입'|'지출'
  account text           -- 계정과목
  amount bigint
  partner text           -- 거래처
  memo text
  project_id uuid FK     -- 미술 사업 연동(nullable)
  budget_item text       -- 예산항목(지출 시)
  src text               -- '결의서'|'카드'|'대금수령'|'직접'
  year int

acct_cards        법인카드 내역
  id uuid PK
  date date, card text, bank text, shop text
  amount bigint, account text, memo text
  matched bool           -- 전표 반영 여부

partners          거래처
  id uuid PK, name text, biz_no text, ...
```

### 4-5. 인사·노무
```
payroll           급여대장
  id uuid PK
  employee_id uuid FK
  ym text                -- 'YYYY-MM'
  base bigint, allowances jsonb, deductions jsonb
  net bigint
  status text            -- 작성|상신|승인|지급
  (승인 시 acct_tx 지출 자동생성)

leave_records     연차 신청/부여
  id uuid PK
  employee_id uuid FK
  kind text              -- 연차|반차|...
  date date, days numeric
  carry_over numeric     -- 이월
  granted numeric        -- 올해부여
  status text

attendance        근태(출퇴근)
  id uuid PK
  employee_id uuid FK
  date date, check_in time, check_out time
  status text            -- 근무중|완료
```

### 4-6. 결재·문서·일정·기록
```
approvals         전자결재
  id uuid PK
  no text                -- 제2026-0144호
  kind text              -- 지출결의서|품의|휴가|일반
  drafter_id uuid FK
  biz_code text, dept_key text
  amount bigint          -- 지출결의서 시
  account text, memo text
  project_id uuid FK, budget_item text  -- 지출결의서+사업연동
  req_date date
  status text            -- 기안|진행|승인|반려|회수|회계접수

approval_lines    결재선(순차)
  id uuid PK
  approval_id uuid FK
  seq int
  approver_id uuid FK
  role text              -- '기안'|'승인'|'회계접수'
  decided text           -- 대기|승인|반려
  decided_at timestamptz

documents         문서함
  id uuid PK
  title text, file_path text(storage)
  owner_id uuid FK
  share_scope text       -- '개인'|'선택'|'전사'
  from_approval_id uuid   -- 결재완료 자동보관
  created_at

document_shares   선택공유 대상
  document_id uuid FK, employee_id uuid FK

events            일정표
  id uuid PK
  date date
  area text              -- 영역 색상
  title text
  employee_id uuid FK

meetings          회의록
  id uuid PK
  date date, dept text, title text
  attendees text, body text

audit_log         활동 기록
  id uuid PK
  actor_id uuid FK, action text, target text
  at timestamptz default now()
```

---

## 5. 기술 스택 · 폴더 구조

### 5-1. 스택
- **빌드**: Vite + React 18 + TypeScript
- **라우팅**: react-router-dom v6
- **백엔드**: Supabase (@supabase/supabase-js v2) — Auth, Postgres, RLS, Storage(문서함)
- **상태**: 가벼운 전역은 React Context + hooks (초기엔 외부 상태 라이브러리 없이)
- **스타일**: 시안의 CSS를 그대로 이식 — CSS custom properties(모던그린, 라이트/다크), 전역 `index.css`
- **차트**: 시안의 자체 SVG 렌더(막대/도넛) 그대로 — 외부 차트 라이브러리 불필요
- **배포**: GitHub → Vercel (SPA)

### 5-2. 폴더 구조
```
gotgan-web/
├─ .env.example            # VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY (실제값은 .env, git 제외)
├─ index.html
├─ vite.config.ts
├─ package.json
├─ supabase/
│   ├─ schema.sql          # 테이블 생성
│   ├─ rls.sql             # RLS 정책 + SECURITY DEFINER 헬퍼
│   ├─ seed.sql            # 직원 12명 등 초기 데이터
│   └─ functions.sql       # RPC (급여 전월복사, 전표 자동생성 등)
├─ src/
│   ├─ main.tsx
│   ├─ App.tsx             # 라우터 + 레이아웃
│   ├─ index.css           # 시안 CSS 이식 (디자인 토큰)
│   ├─ lib/
│   │   ├─ supabase.ts     # 클라이언트
│   │   └─ auth.tsx        # AuthContext (로그인/세션/현재직원/권한)
│   ├─ components/
│   │   ├─ Sidebar.tsx
│   │   ├─ Topbar.tsx
│   │   ├─ Layout.tsx
│   │   └─ ui/             # 칩·배지·모달·카드 등 시안 요소
│   ├─ pages/
│   │   ├─ Login.tsx
│   │   ├─ Dashboard.tsx
│   │   ├─ HR.tsx          # 인사관리 (1차 연동 목표)
│   │   ├─ Labor.tsx
│   │   ├─ Accounting.tsx
│   │   ├─ ops/
│   │   │   ├─ ArtList.tsx
│   │   │   ├─ ArtDetail.tsx
│   │   │   └─ ...
│   │   ├─ Approvals.tsx
│   │   ├─ Documents.tsx
│   │   ├─ Calendar.tsx
│   │   └─ admin/ (Users, Security, Activity)
│   └─ types/              # DB 타입
└─ README.md               # 셋업·배포·Supabase 연결 안내
```

### 5-3. 환경변수 (보안)
- Supabase URL + anon key는 `.env`(git 제외)에만. 코드/저장소에 **하드코딩 금지**.
- `.env.example`에 키 이름만 제공 → 사용자가 본인 Supabase 프로젝트 값으로 채움.
- service_role 키는 클라이언트에 절대 포함하지 않음(마이그레이션 때만 로컬에서 사용).

---

## 6. 구현 순서 (마일스톤)

1. **스캐폴드**: Vite+React+TS, Supabase 클라이언트, 라우팅, 시안 CSS 이식, 레이아웃(사이드바·상단바) — 화면 뼈대가 시안대로.
2. **스키마 SQL**: `schema.sql`+`rls.sql`+`seed.sql`, 로컬 PostgreSQL에서 검증 후 제공.
3. **로그인 + 인사관리 연동** (1차 완성): Supabase Auth, employees CRUD 실제 저장. ← 첫 동작 확인 지점.
4. **나머지 화면 순차 연동**: 회계·사업관리·전자결재·노무 등. 디자인은 시안 그대로.
5. **기존 데이터 이관**: 기존 Supabase → 새 DB. 민감정보라 사용자 확인 하에 신중히.

---

## 7. 기존 스키마 정합성 (신규 설계와의 매핑)

기존 Supabase에는 **두 세대의 스키마가 공존**한다. 신규 React 앱은 더 깔끔한 **Gen-2**(`곳간_급여_RLS.sql`)를 기준으로 통일한다.

| 영역 | Gen-1 (PyQt, 실배포·이름로그인, anon) | Gen-2 (급여_RLS, authenticated) | 신규 채택 |
|------|------|------|----------|
| employees.id | `bigint` identity | `uuid`→auth.users | **uuid + auth** (이관 시 bigint→uuid 매핑표 필요) |
| 로그인 | 이름+비번해시(employees), app_users | Supabase Auth 세션 | **Supabase Auth** |
| 부서 | free-text `dept` | `departments(key,label)` + `employee_depts`(M:N) | **정규화 테이블 채택** |
| 관리자 | `role` text | `is_admin` + `admin_grants(area)` | **admin_grants(area=hr/labor/accounting) 채택** |
| 급여 | `payroll`(flat) | `payroll_runs`+`payslips`(정규화, net GENERATED STORED) | **정규화 채택** |
| 지출결의 | `approvals`(approver/approver2 텍스트) | `expense_docs`(상태머신) + RPC | **expense_docs + 결재선 테이블** |
| 장부 | `transactions` | `ledger_entries` | 통합 검토 (본 설계의 `acct_tx`로 수렴) |

### 7-1. 반드시 보존할 CHECK/enum 값 (기존 데이터 호환)
- employees.status: **재직/휴직/퇴직**
- leave type(실데이터): 연차·반차·병가·경조사·공가·출장·**생일휴무·대체휴무·대체반차·월차** (신청/승인/반려)
- attendance.kind: 출근/퇴근
- art_projects 단계: `1.공고/입찰 · 2.탈락/보류 · 3.예정 · 4.진행 · 5.완료` (ptype 서화/조형/건축/기타)
- art_billings pay_type: 선금/중도금/잔금/일시불
- inventory category: 완제품/부자재

### 7-2. 이관(마이그레이션) 메모 — **맨 마지막 단계(#127)**
- 기존 Supabase는 **건드리지 않고 읽기만** → 새 DB에 적재.
- **id 매핑표**: 기존 `employees.id(bigint)` → 신규 `uuid(auth.users)`. 연차·급여·업무 등 자식 레코드의 `emp_id`도 이 표로 치환.
- **부서명 매핑**: 기존 free-text('경영지원'→management, '미술실'→art 등) → 신규 dept_key.
- 주요 이관 대상: 직원, 연차(노션 52건 포함), 급여, 전표/장부, 미술 프로젝트(노션 25건), 거래처, 법인카드.
- ⚠️ **기본 회계 테이블**(`transactions`, `projects`, `art_budget_items`, `expense_plan`, `partners`, `custom_accounts`, `dept_notes`, `version_control`)의 CREATE 문은 제공된 파일셋에 없고 더 이전 base 파일에 있음 → **이관 전 원본 base SQL 확보 필요**.
- service_role 키/DB 접속정보는 로컬 이관 스크립트에서만 사용, 저장소에 **절대** 남기지 않음.
- 실행 전 건수 대조 + 사용자 승인 필수.

### 7-3. 신규 설계에서 버린 Gen-1 흔적
- anon 전면개방 RLS, 이름기반 인증(기본비번 0000), `cash_monthly_report.data`의 JSON-blob 통짜 저장, 로컬 파일경로(`photo_path`/`path`) → Supabase Storage·정규 컬럼으로 대체, 콤마구분 문자열(attendees/shared_with) → 정규화.
