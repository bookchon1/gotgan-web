// 사업 상세 계산 (예산 집행율, 미수금, 진행률)
import type { AcctTx, ArtBudget, BudgetChange, BudgetReceipt, ProjectStep } from '../../types/db'

/** 계약금 = 마지막 설계변경 after, 없으면 contract_base */
export function contractAmount(contractBase: number, changes: BudgetChange[]): number {
  if (changes.length) {
    const sorted = [...changes].sort((a, b) => (a.date < b.date ? -1 : 1))
    return Number(sorted[sorted.length - 1].after_amount) || 0
  }
  return Number(contractBase) || 0
}

export function receivedAmount(receipts: BudgetReceipt[]): number {
  return receipts.reduce((s, r) => s + (Number(r.amount) || 0), 0)
}

/** 예산항목별 집행액 (해당 사업 지출 전표 budget_item 합) */
export function usedByItem(tx: AcctTx[], projectId: string): Record<string, number> {
  const m: Record<string, number> = {}
  for (const t of tx) {
    if (t.project_id === projectId && t.tx_type === '지출' && t.budget_item)
      m[t.budget_item] = (m[t.budget_item] || 0) + (Number(t.amount) || 0)
  }
  return m
}

export interface BudgetRow {
  item: string
  alloc: number
  used: number
  rem: number
  pct: number
  txCount: number
}

export function budgetRows(
  budget: ArtBudget[],
  used: Record<string, number>,
  tx: AcctTx[],
  projectId: string,
): { rows: BudgetRow[]; totalAlloc: number; totalUsed: number } {
  let totalAlloc = 0,
    totalUsed = 0
  const rows = [...budget]
    .sort((a, b) => a.sort - b.sort)
    .map((b) => {
      const alloc = Number(b.alloc) || 0
      const u = used[b.item] || 0
      totalAlloc += alloc
      totalUsed += u
      const txCount = tx.filter(
        (t) => t.project_id === projectId && t.tx_type === '지출' && t.budget_item === b.item,
      ).length
      return { item: b.item, alloc, used: u, rem: alloc - u, pct: alloc > 0 ? Math.round((u / alloc) * 100) : 0, txCount }
    })
  return { rows, totalAlloc, totalUsed }
}

export function pctColor(pct: number): string {
  return pct >= 100 ? 'var(--danger)' : pct >= 80 ? 'var(--warn)' : 'var(--brand)'
}

export interface StepProgress {
  nDone: number
  nProg: number
  nBefore: number
  nNa: number
  total: number
  valid: number
  pct: number
}

export function stepProgress(steps: ProjectStep[]): StepProgress {
  const nDone = steps.filter((s) => s.status === 'done').length
  const nProg = steps.filter((s) => s.status === 'prog').length
  const nBefore = steps.filter((s) => s.status === 'before').length
  const nNa = steps.filter((s) => s.status === 'na').length
  const total = steps.length
  const valid = total - nNa
  const pct = valid > 0 ? Math.round(((nDone + nProg * 0.5) / valid) * 100) : 0
  return { nDone, nProg, nBefore, nNa, total, valid, pct }
}

export const STEP_LABEL: Record<string, [string, string]> = {
  done: ['st-done', '완료'],
  prog: ['st-prog', '진행 중'],
  before: ['st-before', '진행 전'],
  na: ['st-na', '해당없음'],
}
