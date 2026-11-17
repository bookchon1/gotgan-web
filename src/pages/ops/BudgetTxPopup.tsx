import { useEffect, useState } from 'react'
import { eok, won, dateOnly } from '../../lib/format'
import { supabase } from '../../lib/supabase'
import type { AcctTx, ArtBudget, Approval } from '../../types/db'
import { usedByItem } from './artDetail'

type Row = Pick<Approval, 'id' | 'doc_no' | 'title' | 'amount' | 'status' | 'req_date' | 'drafter_id' | 'memo'>

const ST_CLS: Record<string, string> = {
  기안: '',
  진행: 'c-prog',
  승인: 'c-done',
  회계접수: 'c-done',
  반려: 'c-hold',
  회수: '',
}

/** 예산항목 클릭 팝업 — 해당 항목으로 상신된 지출결의서 목록 + 실제 집행(전표) 내역 */
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

  const [docs, setDocs] = useState<Row[] | null>(null)
  const [names, setNames] = useState<Record<string, string>>({})
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    supabase
      .from('approvals')
      .select('id,doc_no,title,amount,status,req_date,drafter_id,memo')
      .eq('project_id', projectId)
      .eq('budget_item', item)
      .eq('kind', '지출결의서')
      .order('req_date', { ascending: false })
      .then(({ data, error }) => {
        if (error) setErr(error.message)
        setDocs((data ?? []) as Row[])
      })
    supabase
      .from('employees')
      .select('id,name')
      .then(({ data }) => setNames(Object.fromEntries((data ?? []).map((e) => [e.id, e.name]))))
  }, [projectId, item])

  const pending = (docs ?? []).filter((d) => d.status === '기안' || d.status === '진행')

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 720 }} onClick={(e) => e.stopPropagation()}>
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
            {pending.length > 0 && (
              <span style={{ color: 'var(--muted)' }}>
                {' '}· 결재 진행 중 {pending.length}건 ({eok(pending.reduce((s, d) => s + (Number(d.amount) || 0), 0))})
              </span>
            )}
          </div>

          <div className="bud-h" style={{ marginTop: 12 }}>
            <div className="t">
              지출결의서 <span style={{ color: 'var(--muted)', fontWeight: 400 }}>· {docs?.length ?? 0}건</span>
            </div>
          </div>
          <table className="budtx">
            <thead>
              <tr>
                <th>상신일</th>
                <th>문서번호</th>
                <th>제목</th>
                <th>기안자</th>
                <th>상태</th>
                <th>금액</th>
              </tr>
            </thead>
            <tbody>
              {(docs ?? []).map((d) => (
                <tr key={d.id}>
                  <td className="tnum">{dateOnly(d.req_date)}</td>
                  <td className="tnum t-sub">{d.doc_no || '—'}</td>
                  <td>{d.title || d.memo || '—'}</td>
                  <td>{d.drafter_id ? names[d.drafter_id] || '—' : '—'}</td>
                  <td>
                    <span className={`chip ${ST_CLS[d.status] ?? ''}`}><i />{d.status === '진행' ? '결재중' : d.status}</span>
                  </td>
                  <td className="tnum">{won(d.amount)}</td>
                </tr>
              ))}
              {docs && docs.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', color: 'var(--muted)', padding: 14 }}>
                    {err ? '불러오기 실패: ' + err : '상신된 지출결의서가 없습니다.'}
                  </td>
                </tr>
              )}
              {!docs && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', color: 'var(--muted)', padding: 14 }}>
                    불러오는 중…
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          <div className="bud-h" style={{ marginTop: 14 }}>
            <div className="t">
              집행 전표 <span style={{ color: 'var(--muted)', fontWeight: 400 }}>· 회계 접수가 끝나 실제 집행된 내역 {rows.length}건</span>
            </div>
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
