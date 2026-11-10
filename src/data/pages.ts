// 라우트 → 상단 breadcrumb 라벨 (시안 PAGES 맵)
import { AREAS } from './areas'

export const PAGE_TITLES: Record<string, string> = {
  '': '홈',
  approvals: '전자결재',
  documents: '문서보관',
  calendar: '일정표',
  hr: '인사관리',
  labor: '노무관리',
  accounting: '회계관리',
  users: '사용자관리',
  security: '권한 검증',
  activity: '활동 기록',
  login: '로그인',
}

// 업무관리 라우트 → "부서 · 화면" 라벨 (AREAS 단일 소스에서 생성).
//  예) /hr → 경영 · 인사, /ops/art → 미술 · 사업, /tasks/art → 미술 · 업무현황
// 화면명은 시안 '사업관리/현장관리/인사관리'의 접미사(관리)를 떼어 '부서 · 사업' 형태로 통일.
function screenShort(t: string): string {
  // '사업관리'→'사업', '현장관리'→'현장', '인사관리'→'인사', '회계관리'→'회계' …
  return t.endsWith('관리') && t.length > 2 ? t.slice(0, -2) : t
}
const DEPT_SCREEN: Record<string, { dept: string; screen: string }> = (() => {
  const m: Record<string, { dept: string; screen: string }> = {}
  for (const a of AREAS) {
    for (const v of a.views) {
      // tasks(업무현황)는 /tasks/:area 로 공통. ops-* 는 /ops/* 로.
      if (v.k === 'tasks') {
        m[`tasks/${a.id}`] = { dept: a.label, screen: screenShort(v.t) }
      } else {
        const path = v.k.startsWith('ops-') ? v.k.replace('ops-', 'ops/') : v.k
        m[path] = { dept: a.label, screen: screenShort(v.t) }
      }
    }
  }
  return m
})()

/** 업무관리(부서·화면)면 extra 에 "부서 · 화면", 그 외는 main 에 화면명 하나. */
export function breadcrumbFor(pathname: string): { main: string; extra?: string } {
  const key = pathname.replace(/^\/+/, '') // 앞 슬래시 제거
  if (key === '') return { main: '홈' }

  // /tasks/:area  → tasks/<area>
  const taskM = key.match(/^tasks\/([^/]+)/)
  if (taskM && DEPT_SCREEN[`tasks/${taskM[1]}`]) {
    const d = DEPT_SCREEN[`tasks/${taskM[1]}`]
    return { main: '업무관리', extra: `${d.dept} · ${d.screen}` }
  }

  // 기능 화면: 가장 긴 매칭 우선 (/ops/art/:id 는 /ops/art 로 귀속)
  const matched = Object.keys(DEPT_SCREEN)
    .filter((p) => key === p || key.startsWith(p + '/'))
    .sort((a, b) => b.length - a.length)[0]
  if (matched) {
    const d = DEPT_SCREEN[matched]
    return { main: '업무관리', extra: `${d.dept} · ${d.screen}` }
  }

  // 업무관리 밖 단일 화면 (전자결재·문서보관·일정표·사용자관리 등)
  const first = key.split('/')[0]
  return { main: PAGE_TITLES[first] ?? first }
}
