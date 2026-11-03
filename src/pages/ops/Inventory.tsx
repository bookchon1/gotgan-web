import { useMemo, useState } from 'react'
import { PageHead } from '../../components/PageHead'
import { ErrorBanner, LoadingRow, EmptyRow } from '../../components/States'
import { supabase } from '../../lib/supabase'
import { useQuery } from '../../lib/useQuery'
import { won, invShort } from '../../lib/format'
import type { Inventory as Inv } from '../../types/db'
import { PurchaseHistModal } from './PurchaseHistModal'

/** 상품 재고현황 — 목록(부족 표시) + 매입이력 + 입고 */
export default function Inventory() {
  const [q, setQ] = useState('')
  const [histOf, setHistOf] = useState<Inv | null>(null)
  const [busy, setBusy] = useState(false)

  const invQ = useQuery<Inv[]>(
    async () => await supabase.from('inventory').select('*').order('code', { ascending: true }),
    [],
  )
  const items = invQ.data ?? []

  const list = useMemo(() => {
    if (!q) return items
    if (q.trim() === '부족') return items.filter((it) => it.stock < it.min_qty)
    return items.filter(
      (it) => it.name.includes(q) || (it.code ?? '').includes(q) || (it.category ?? '').includes(q),
    )
  }, [items, q])

  const lowCount = items.filter((it) => it.stock < it.min_qty).length

  async function receive(it: Inv) {
    if (!it.incoming) return
    setBusy(true)
    // 입고: stock += incoming, incoming=0, 매입이력 기록
    await supabase
      .from('inventory')
      .update({ stock: it.stock + it.incoming, incoming: 0, updated_at: new Date().toISOString() })
      .eq('id', it.id)
    await supabase.from('purchase_history').insert({
      inventory_id: it.id,
      code: it.code,
      date: new Date().toISOString().slice(0, 10),
      qty: it.incoming,
      unit_price: it.unit_price,
      partner: '입고',
    })
    setBusy(false)
    invQ.reload()
  }

  return (
    <div className="page on">
      <PageHead
        eyebrow="상품 · 재고"
        title="재고현황"
        desc="완제품·부자재 재고를 확인하고, 부족 품목을 발주·입고하세요."
      />
      <section className="panel">
        <ErrorBanner error={invQ.error} table="inventory" />
        <div className="toolbar">
          <h2 style={{ fontSize: 15, fontWeight: 800 }}>
            재고 목록 <span className="count">{invQ.loading ? '…' : list.length}</span>
            {lowCount > 0 && (
              <span className="chip set-hold" style={{ marginLeft: 8, fontSize: 10 }}>
                <i />
                부족 {lowCount}
              </span>
            )}
          </h2>
          <label className="search r" style={{ marginLeft: 'auto' }}>
            <svg className="icon" width="16" height="16" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4-4" />
            </svg>
            <input placeholder="품목·코드 검색 (또는 '부족')" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
        </div>
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>코드</th>
                <th>품목</th>
                <th>구분</th>
                <th style={{ textAlign: 'right' }}>재고</th>
                <th style={{ textAlign: 'right' }}>적정</th>
                <th style={{ textAlign: 'right' }}>단가</th>
                <th>상태</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {invQ.loading && <LoadingRow cols={8} />}
              {!invQ.loading &&
                list.map((it) => {
                  const low = it.stock < it.min_qty
                  return (
                    <tr key={it.id}>
                      <td className="tnum" style={{ color: 'var(--muted)' }}>
                        {it.code}
                      </td>
                      <td>
                        <div className="t-title">{it.name}</div>
                        {it.location && <div className="t-sub">{it.location}</div>}
                      </td>
                      <td>
                        <span className="badge">{it.category}</span>
                      </td>
                      <td className="tnum" style={{ textAlign: 'right', fontWeight: 700, color: low ? 'var(--danger)' : 'var(--ink)' }}>
                        {it.stock}
                      </td>
                      <td className="tnum" style={{ textAlign: 'right', color: 'var(--muted)' }}>
                        {it.min_qty}
                      </td>
                      <td className="tnum" style={{ textAlign: 'right' }}>
                        {won(it.unit_price)}
                      </td>
                      <td>
                        {it.incoming > 0 ? (
                          <span className="chip c-prog">
                            <i />
                            입고예정 {it.incoming}
                          </span>
                        ) : low ? (
                          <span className="chip set-hold">
                            <i />
                            부족 {it.min_qty - it.stock}
                          </span>
                        ) : (
                          <span className="chip c-done">
                            <i />
                            충분
                          </span>
                        )}
                      </td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button className="btn sec" style={{ padding: '4px 9px', fontSize: 11 }} onClick={() => setHistOf(it)}>
                          이력
                        </button>
                        {it.incoming > 0 && (
                          <button
                            className="btn pri"
                            style={{ padding: '4px 9px', fontSize: 11, marginLeft: 5 }}
                            onClick={() => receive(it)}
                            disabled={busy}
                          >
                            입고
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              {!invQ.loading && list.length === 0 && !invQ.error && (
                <EmptyRow cols={8} text="재고 품목이 없습니다." />
              )}
            </tbody>
          </table>
        </div>
        <div className="sec-mini" style={{ marginTop: 10 }}>
          재고가 적정 수량 미만이면 <b style={{ color: 'var(--danger)' }}>부족</b>으로 표시됩니다. 입고 예정 품목은 "입고" 버튼으로 재고에 반영하세요.
          {/* 단위 요약 */}
          {items.length > 0 && (
            <span style={{ color: 'var(--muted)' }}>
              {' '}· 총 재고 자산 {invShort(items.reduce((s, it) => s + it.stock * it.unit_price, 0))}원
            </span>
          )}
        </div>
      </section>

      {histOf && <PurchaseHistModal item={histOf} onClose={() => setHistOf(null)} />}
    </div>
  )
}
