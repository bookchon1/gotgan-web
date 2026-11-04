// 급여·근무기록 공통 '귀속월(YYYY-MM)' 계산.
// 급여는 전월분을 이번 달에 받으므로(11월 → 10월 급여), 기본 귀속월 = 전월.

/** YYYY-MM 으로 포맷 */
function fmt(y: number, m0: number): string {
  // m0: 0-based month
  const d = new Date(y, m0, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** 이번 달 (YYYY-MM) */
export function thisMonth(today = new Date()): string {
  return fmt(today.getFullYear(), today.getMonth())
}

/** 'YYYY-MM' → 그 달의 조회 범위. start=그 달 1일, endExclusive=다음 달 1일.
 *  (말일을 -31 로 고정하면 11월·2월 등에서 'date out of range' 오류가 나므로 사용) */
export function monthRange(ym: string): { start: string; endExclusive: string } {
  const [y, m] = ym.split('-').map(Number)
  const start = fmt(y, m - 1) + '-01' // m-1: 0-based
  const endExclusive = fmt(y, m) + '-01' // 다음 달 1일
  return { start, endExclusive }
}

/** 전월 (YYYY-MM) — 급여 기본 귀속월 */
export function prevMonth(today = new Date()): string {
  return fmt(today.getFullYear(), today.getMonth() - 1)
}

/** 최근 n개월 목록(당월 포함, 최신순). 근무기록 등 월 선택지에 사용 */
export function recentMonths(n = 6, today = new Date()): string[] {
  const out: string[] = []
  for (let i = 0; i < n; i++) out.push(fmt(today.getFullYear(), today.getMonth() - i))
  return out
}

/** 급여 귀속월 선택지(최신순, 당월 포함).
 *  기본 선택값은 prevMonth()(전월) — 급여는 전월분을 이번 달에 지급.
 *  당월도 선지급/조정용으로 선택 가능하도록 최신순 목록에 포함한다. */
export function payrollMonths(n = 6, today = new Date()): string[] {
  // 당월(i=0)부터 과거로 n개 — 최신순
  const out: string[] = []
  for (let i = 0; i < n; i++) out.push(fmt(today.getFullYear(), today.getMonth() - i))
  return out
}
