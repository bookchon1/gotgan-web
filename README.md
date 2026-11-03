# 곳간 · BOOKCHON WORKSPACE

북촌불교미술보존연구소 사내 인트라넷 웹앱. React + Vite + Supabase.

> HTML 시안(`곳간_웹_시안.html`)의 화면·흐름·디자인(모던그린)을 **그대로** 구현한 실동작 버전입니다.
> 설계 전반은 [`DESIGN.md`](./DESIGN.md) 참고.

---

## 빠른 시작

```bash
# 1. 의존성 설치
npm install

# 2. Supabase 연결값 설정
cp .env.example .env
#   .env 를 열어 본인 Supabase 프로젝트의 URL·anon key 입력

# 3. 개발 서버
npm run dev          # http://localhost:5173

# 4. 프로덕션 빌드
npm run build        # dist/ 생성
npm run preview      # 빌드 결과 미리보기
```

`.env` 가 아직 없어도 앱은 실행됩니다 — 로그인 화면에 "연결 설정 필요" 안내가 뜹니다.

---

## Supabase 연결

1. [supabase.com](https://supabase.com) 에서 **새 프로젝트** 생성 (기존 PyQt 앱 프로젝트와 분리된 새 프로젝트).
2. Project Settings → **API** 에서 두 값 복사:
   - `Project URL` → `VITE_SUPABASE_URL`
   - `anon` `public` key → `VITE_SUPABASE_ANON_KEY`
3. `.env` 에 붙여넣기.
4. `supabase/` 폴더의 SQL(스키마·RLS·시드)을 Supabase SQL Editor에서 실행 *(다음 단계에서 제공)*.

> ⚠️ **보안**: `.env` 는 git에 커밋되지 않습니다(`.gitignore`). `service_role` 키는 프런트엔드 어디에도 넣지 마세요. 공개 anon key만 사용합니다. 실제 권한은 서버의 RLS가 강제합니다.

---

## 폴더 구조

```
src/
├─ main.tsx            앱 진입 (Router + AuthProvider)
├─ App.tsx             라우트 테이블 + 로그인/관리자 가드
├─ index.css           디자인 토큰·공통 스타일 (시안 이식, 라이트/다크)
├─ lib/
│  ├─ supabase.ts      Supabase 클라이언트
│  └─ auth.tsx         로그인 세션 + 현재 직원/권한 컨텍스트
├─ components/         Sidebar · Topbar · Layout · Icon · PageHead
├─ data/               areas.ts(부서·사업자) · pages.ts(breadcrumb)
└─ pages/              Login · Dashboard · HR · Tasks · Placeholder …
```

---

## 현재 상태 (진행 단계)

- [x] 프로젝트 셋업 (Vite + React + TS + Supabase + 라우팅)
- [x] 디자인 이식 (모던그린, 사이드바·상단바·로그인 — 시안 그대로)
- [x] 로그인 (Supabase Auth, 이메일+비밀번호)
- [x] DB 스키마 SQL (테이블 + RLS + RPC, `supabase/`)
- [x] 인사관리 (직원 명부 CRUD)
- [x] 회계관리 (자금현황 드릴다운·전년대비·차트, 전표내역)
- [x] 사업관리 + 사업 상세 (예산·20공정·자문위원)
- [x] 노무관리 (급여대장·전월복사 RPC·연차)
- [x] 전자결재 (결재선 진행), 일정표, 문서보관, 업무현황
- [ ] 세부 편집 기능 보강 (공정 추가/삭제, 자문비 상신, 결재 승인 등)
- [ ] 재고현황·현장관리·교육 등 나머지 부서 화면
- [ ] 기존 회계 데이터 이관

> 아직 연동 전인 화면은 디자인 틀 안에서 "준비 중"으로 표시됩니다.
> 샘플 데이터로 화면을 채워보려면 `supabase/demo_seed.sql` 을 실행하세요.

---

## 배포 (Vercel 예시)

1. 이 저장소를 Vercel에 임포트.
2. Framework: **Vite** (자동 감지). Build: `npm run build`, Output: `dist`.
3. Environment Variables에 `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` 추가.
4. SPA 라우팅: `vercel.json` 의 rewrite가 모든 경로를 `index.html` 로 보냅니다.
