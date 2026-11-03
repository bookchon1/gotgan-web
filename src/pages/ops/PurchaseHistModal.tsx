import { useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { useQuery } from '../../lib/useQuery'
import { won, dateOnly } from '../../lib/format'
import type { Inventory as Inv, PurchaseHistory } from '../../types/db'

/** 매입 이력 — 가중평균·최저·최고 단가 + 단가 추이 SVG 차트 + 이력 표 */
export function PurchaseHistModal({ item, onClose }: { item: Inv; onClose: () => void }) {
  const histQ = useQuery<PurchaseHistory[]>(
    async () =>
      await supabase
        .from('purchase_history')
        .select('*')
        .eq('inventory_id', item.id)
        .order('date', { ascending: true }),
    [item.id],
  )
  const rows = histQ.data ?? []

  const stats = useMemo(() => {
    if (!rows.length) return null
    let totalQty = 0,
      totalCost = 0,
      min = Infinity,
      max = 0
    for (const r of rows) {
      const price = Number(r.unit_price) || 0
      const qty = Number(r.qty) || 0
      totalQty += qty
      totalCost += price * qty
      min = Math.min(min, price)
      max = Math.max(max, price)
    }
    return { avg: totalQty ? Math.round(totalCost / totalQty) : 0, min, max, totalQty }
  }, [rows])

  // 단가 추이 SVG
  const chart = useMemo(() => {
    if (rows.length < 1) return null
    const prices = rows.map((r) => Number(r.unit_price) || 0)
    const maxP = Math.max(...prices, 1)
    const minP = Math.min(...prices)
    const W = 400,
      H = 120,
      padL = 10,
      padR = 10,
      padT = 14,
      padB = 20
    const span = maxP - minP || 1
    const pts = rows.map((r, i) => {
      const x = rows.length === 1 ? W / 2 : padL + ((W - padL - padR) * i) / (rows.length - 1)
      const y = padT + (H - padT - padB) * (1 - ((Number(r.unit_price) || 0) - minP) / span)
      return { x, y, price: Number(r.unit_price) || 0, date: dateOnly(r.date) }
    })
    const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
    return { W, H, pts, line }
  }, [rows])

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="mh">
          <div>
            <div className="eyebrow">매입 이력</div>
            <h3>{item.name}</h3>
          </div>
          <button className="x" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="mb">
          {histQ.loading && <div style={{ textAlign: 'center', color: 'var(--muted)', padding: 16 }}>불러오는 중…</div>}
          {!histQ.loading && stats && (
            <>
              {/* 통계 */}
              <div className="stats" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
                <div className="stat">
                  <div>
                    <div className="lbl">가중평균 단가</div>
                    <div className="val tnum" style={{ fontSize: 18 }}>
                      {won(stats.avg)}
                    </div>
                  </div>
                </div>
                <div className="stat">
                  <div>
                    <div className="lbl">최저</div>
                    <div className="val tnum" style={{ fontSize: 18, color: 'var(--ok)' }}>
                      {won(stats.min)}
                    </div>
                  </div>
                </div>
                <div className="stat">
                  <div>
                    <div className="lbl">최고</div>
                    <div className="val tnum" style={{ fontSize: 18, color: 'var(--expense)' }}>
                      {won(stats.max)}
                    </div>
                  </div>
                </div>
              </div>

              {/* 단가 추이 차트 */}
              {chart && chart.pts.length >= 2 && (
                <div>
                  <div className="sec-mini" style={{ margin: '0 0 4px' }}>
                    단가 추이
                  </div>
                  <svg viewBox={`0 0 ${chart.W} ${chart.H}`} style={{ width: '100%', height: 'auto' }}>
                    <path d={chart.line} fill="none" stroke="var(--brand)" strokeWidth="2" />
                    {chart.pts.map((p, i) => (
                      <g key={i}>
                        <circle cx={p.x} cy={p.y} r="3.5" fill="var(--brand)" />
                        <text x={p.x} y={p.y - 7} textAnchor="middle" fontSize="8.5" fontWeight="700" fill="var(--ink-soft)">
                          {Math.round(p.price / 1000)}천
                        </text>
                        <text x={p.x} y={chart.H - 6} textAnchor="middle" fontSize="8" fill="var(--muted)">
                          {p.date.slice(5)}
                        </text>
                      </g>
                    ))}
                  </svg>
                </div>
              )}

              {/* 이력 표 */}
              <table className="budtx">
                <thead>
                  <tr>
                    <th>일자</th>
                    <th>수량</th>
                    <th>단가</th>
                    <th>거래처</th>
                  </tr>
                </thead>
                <tbody>
                  {rows
                    .slice()
                    .reverse()
                    .map((r) => (
                      <tr key={r.id}>
                        <td className="tnum">{dateOnly(r.date)}</td>
                        <td className="tnum">{r.qty}</td>
                        <td className="tnum" style={{ color: 'var(--ink)' }}>
                          {won(r.unit_price)}
                        </td>
                        <td>{r.partner || '—'}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </>
          )}
          {!histQ.loading && !stats && (
            <div style={{ textAlign: 'center', color: 'var(--muted)', padding: 16 }}>매입 이력이 없습니다.</div>
          )}
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
