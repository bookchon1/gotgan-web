import { eok, won, dateOnly } from '../../lib/format'
import type { AcctTx, ArtBudget } from '../../types/db'
import { usedByItem } from './artDetail'

/** 예산항목 "내역 보기" 팝업 — 해당 항목의 지출 전표 목록 */
export function BudgetTxPopup({
  item,
  projectId,
  tx,
  budget,
  onClose,
}: {
  item: string
  projectId: string
  tx: AcctTx[]
  budget: ArtBudget[]
  onClose: () => void
}) {
  const rows = tx.filter(
    (t) => t.project_id === projectId && t.tx_type === '지출' && t.budget_item === item,
  )
  const used = usedByItem(tx, projectId)[item] || 0
  const alloc = Number(budget.find((b) => b.item === item)?.alloc) || 0
  const pct = alloc > 0 ? Math.round((used / alloc) * 100) : 0

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="mh">
          <div>
            <div className="eyebrow">예산 집행 내역</div>
            <h3>{item}</h3>
          </div>
          <button className="x" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="mb">
          <div className="sec-mini" style={{ margin: 0 }}>
            예산액 {eok(alloc)} · 집행 {eok(used)} ({pct}%) · 잔여 {eok(alloc - used)}
          </div>
          <table className="budtx">
            <thead>
              <tr>
                <th>날짜</th>
                <th>거래처</th>
                <th>적요</th>
                <th>구분</th>
                <th>금액</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id}>
                  <td className="tnum">{dateOnly(t.date)}</td>
                  <td>{t.partner || '—'}</td>
                  <td>{t.memo}</td>
                  <td>
                    <span className="badge" style={{ fontSize: 10 }}>
                      {t.src === '카드' ? '법인카드' : '지출결의'}
                    </span>
                  </td>
                  <td className="tnum">{won(t.amount)}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', color: 'var(--muted)', padding: 14 }}>
                    집행 내역이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="mf">
          <button className="btn sec" onClick={onClose}>
            닫기
          </button>
        </div>
      </div>
    </div>
  )
}
