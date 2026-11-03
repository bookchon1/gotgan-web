// 자금현황 계산 로직 (시안 sumTx / periodSum / deltaBadge 등)
import type { AcctTx } from '../../types/db'

export interface Sums {
  income: number
  expense: number
  profit: number
}

export function sumTx(rows: AcctTx[]): Sums {
  let income = 0,
    expense = 0
  for (const t of rows) {
    const amt = Number(t.amount) || 0 // bigint 이 문자열로 와도 안전
    if (t.tx_type === '수입') income += amt
    else expense += amt
  }
  return { income, expense, profit: income - expense }
}

export interface Drill {
  level: 'company' | 'biz' | 'dept' | 'project'
  biz?: string
  dept?: string
  project?: string // project id
}

/** drill 범위에 맞는지 */
export function drillMatch(t: AcctTx, d: Drill): boolean {
  if (d.biz && t.biz_code !== d.biz) return false
  if (d.dept && t.dept_key !== d.dept) return false
  if (d.project && t.project_id !== d.project) return false
  return true
}

/** 연·월 + drill 필터 (월='all' 이면 연간) */
export function inPeriod(t: AcctTx, year: string, month: string, d: Drill): boolean {
  if (t.date.slice(0, 4) !== year) return false
  if (month !== 'all' && t.date.slice(5, 7) !== month) return false
  return drillMatch(t, d)
}

/** 누계: 해당 연도 + month 이하 월 + drill */
export function periodSum(rows: AcctTx[], year: number, monthMax: number, d: Drill): Sums {
  const f = rows.filter((t) => {
    if (t.date.slice(0, 4) !== String(year)) return false
    if (parseInt(t.date.slice(5, 7), 10) > monthMax) return false
    return drillMatch(t, d)
  })
  return sumTx(f)
}

export interface Delta {
  kind: 'up' | 'down' | 'flat' | 'new' | 'none'
  pct: number
}

/** 전년대비 증감 (시안 deltaBadge) */
export function delta(cur: number, prev: number): Delta {
  if (prev === 0) return { kind: cur > 0 ? 'new' : 'none', pct: 0 }
  const r = Math.round(((cur - prev) / Math.abs(prev)) * 100)
  if (r > 0) return { kind: 'up', pct: r }
  if (r < 0) return { kind: 'down', pct: r }
  return { kind: 'flat', pct: 0 }
}
