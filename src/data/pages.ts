// 라우트 → 상단 breadcrumb 라벨 (시안 PAGES 맵)
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

/** ops-* 및 tasks 는 모두 '업무관리' 소속 */
export function breadcrumbFor(pathname: string): { main: string; extra?: string } {
  const seg = pathname.split('/').filter(Boolean)
  if (seg.length === 0) return { main: '홈' }
  const first = seg[0]
  if (first === 'tasks' || first === 'ops') return { main: '업무관리' }
  if (['hr', 'labor', 'accounting'].includes(first))
    return { main: '업무관리', extra: PAGE_TITLES[first] }
  return { main: PAGE_TITLES[first] ?? first }
}
