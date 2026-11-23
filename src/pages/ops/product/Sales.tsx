import { useMemo, useState } from 'react'
import { LoadingRow, EmptyRow } from '../../../components/States'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../lib/auth'
import { won } from '../../../lib/format'
import { Kpi, NumIn, SearchBox, Thumb } from './parts'
import { CHANNELS, csvDownload, isProduct, type Item, type Sale } from './lib'

/** 판매 기록 — 입력하면 판매상품 가용재고에서 자동 차감 */
export function SalesTab({ items, sales, loading, isAdmin, reload }: { items: Item[]; sales: Sale[]; loading: boolean; isAdmin: boolean; reload: () => void }) {
  const { me } = useAuth()
  const today = new Date().toISOString().slice(0, 10)
  const products = useMemo(() => items.filter(isProduct), [items])
  const [month, setMonth] = useState(today.slice(0, 7))
  const [q, setQ] = useState('')
  const [f, setF] = useState({ sold_at: today, channel: CHANNELS[0], pid: '', qty: 1, price: 0, order_no: '', memo: '' })
  const [pq, setPq] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const byId = useMemo(() => new Map(items.map((x) => [x.id, x])), [items])
  const months = useMemo(() => [...new Set([today.slice(0, 7), ...sales.map((s) => s.sold_at.slice(0, 7))])].sort().reverse(), [sales, today])
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase()
    return sales.filter((s) => (month === 'all' || s.sold_at.startsWith(month)) && (!t || [byId.get(s.inventory_id ?? '')?.name, s.order_no, s.channel, s.memo].some((v) => (v ?? '').toLowerCase().includes(t))))
  }, [sales, month, q, byId])
  const amt = rows.reduce((s, x) => s + x.qty * x.unit_price, 0)
  const qty = rows.reduce((s, x) => s + x.qty, 0)

  const picked = f.pid ? byId.get(f.pid) : null
  const cands = useMemo(() => {
    const t = pq.trim().toLowerCase()
    if (!t) return []
    return products.filter((p) => [p.name, p.option_spec, p.item_id, p.code].some((v) => (v ?? '').toLowerCase().includes(t))).slice(0, 8)
  }, [pq, products])

  async function add() {
    if (!picked) { setErr('판매한 상품을 선택하세요.'); return }
    if (f.qty <= 0) { setErr('수량을 입력하세요.'); return }
    setBusy(true); setErr(null)
    const { error } = await supabase.from('product_sales').insert({
      sold_at: f.sold_at, channel: f.channel || null, inventory_id: picked.id, qty: f.qty, unit_price: f.price,
      order_no: f.order_no.trim() || null, memo: f.memo.trim() || null, created_by: me?.id ?? null,
    })
    setBusy(false)
    if (error) { setErr(error.message); return }
    setF({ ...f, pid: '', qty: 1, price: 0, order_no: '', memo: '' }); setPq('')
    reload()
  }
  async function del(s: Sale) {
    if (!window.confirm('이 판매 기록을 삭제할까요? 차감된 재고가 되돌아옵니다.')) return
    const { error } = await supabase.from('product_sales').delete().eq('id', s.id)
    if (error) { alert(error.message); return }
    reload()
  }

  return (
    <div className="pr-pane">
      {isAdmin && (
        <section className="pr-card pad pr-quick">
          <h3>판매 입력</h3>
          <div className="pr-qgrid">
            <label className="pr-f"><span>판매일자</span><input className="ctl" type="date" value={f.sold_at} onChange={(e) => setF({ ...f, sold_at: e.target.value })} /></label>
            <label className="pr-f"><span>판매채널</span>
              <select className="ctl" value={f.channel} onChange={(e) => setF({ ...f, channel: e.target.value })}>{CHANNELS.map((c) => <option key={c}>{c}</option>)}</select>
            </label>
            <div className="pr-f prod">
              <span>판매 품목</span>
              {picked ? (
                <div className="pr-picked">
                  <Thumb it={picked} size={28} />
                  <div><b>{picked.name}</b><small>{picked.option_spec ?? ''} · 가용 {picked.avail}</small></div>
                  <button className="pr-lnk" onClick={() => { setF({ ...f, pid: '' }); setPq('') }}>변경</button>
                </div>
              ) : (
                <div className="pr-pick">
                  <input className="ctl" placeholder="상품명·옵션·품목ID 검색" value={pq} onChange={(e) => setPq(e.target.value)} />
                  {cands.length > 0 && (
                    <ul>
                      {cands.map((p) => (
                        <li key={p.id} onClick={() => { setF({ ...f, pid: p.id, price: p.sell_price }); setPq('') }}>
                          <Thumb it={p} size={26} /><div><b>{p.name}</b><small>{p.option_spec ?? ''}</small></div><em className="tnum">가용 {p.avail}</em>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
            <label className="pr-f"><span>수량</span><NumIn value={f.qty} onChange={(n) => setF({ ...f, qty: n })} /></label>
            <label className="pr-f"><span>판매단가(원)</span><NumIn money value={f.price} onChange={(n) => setF({ ...f, price: n })} /></label>
            <label className="pr-f"><span>금액</span><input className="ctl tnum" value={won(f.qty * f.price)} disabled /></label>
            <label className="pr-f"><span>주문번호</span><input className="ctl" value={f.order_no} onChange={(e) => setF({ ...f, order_no: e.target.value })} /></label>
            <label className="pr-f"><span>비고</span><input className="ctl" value={f.memo} onChange={(e) => setF({ ...f, memo: e.target.value })} /></label>
            <div className="pr-qgo">
              {err && <span className="pr-err">{err}</span>}
              <button className="pr-btn pri" onClick={add} disabled={busy}>{busy ? '기록 중…' : '판매 기록'}</button>
            </div>
          </div>
        </section>
      )}

      <div className="pr-kpis three">
        <Kpi label="판매 금액" value={`₩${won(amt)}`} />
        <Kpi label="판매 수량" value={`${qty}개`} />
        <Kpi label="판매 건수" value={`${rows.length}건`} />
      </div>

      <div className="pr-top">
        <div className="pr-tools">
          <select className="pr-sel" value={month} onChange={(e) => setMonth(e.target.value)}>
            <option value="all">전체 기간</option>
            {months.map((m) => <option key={m} value={m}>{m.replace('-', '년 ')}월</option>)}
          </select>
          <SearchBox value={q} onChange={setQ} width={240} />
          <span className="pr-sp" />
          <button className="pr-btn" onClick={() => csvDownload('판매기록.csv', ['판매일자', '채널', '품목ID', '상품명', '옵션', '수량', '단가', '금액', '주문번호', '비고'], rows.map((s) => { const it = byId.get(s.inventory_id ?? ''); return [s.sold_at, s.channel, it?.item_id, it?.name, it?.option_spec, s.qty, s.unit_price, s.qty * s.unit_price, s.order_no, s.memo] }))}>엑셀 내려받기</button>
        </div>
      </div>
      <div className="pr-card">
        <div className="tbl-wrap">
          <table className="pr-tbl">
            <thead><tr><th>판매일자</th><th>채널</th><th>상품</th><th className="r">수량</th><th className="r">단가</th><th className="r">금액</th><th>주문번호</th><th>비고</th>{isAdmin && <th />}</tr></thead>
            <tbody>
              {loading && <LoadingRow cols={9} />}
              {!loading && rows.map((s) => {
                const it = byId.get(s.inventory_id ?? '')
                return (
                  <tr key={s.id}>
                    <td className="tnum">{s.sold_at}</td>
                    <td>{s.channel ? <span className="pr-tag">{s.channel}</span> : '—'}</td>
                    <td>{it ? <div className="pr-nm"><Thumb it={it} size={32} /><div><div className="t" title={it.name}>{it.name}</div><div className="s"><span className="opt">{it.option_spec ?? ''}</span><span>{it.item_id}</span></div></div></div> : <span className="pr-dash">삭제된 품목</span>}</td>
                    <td className="r tnum">{s.qty}</td>
                    <td className="r tnum">{won(s.unit_price)}</td>
                    <td className="r tnum b">{won(s.qty * s.unit_price)}</td>
                    <td className="tnum">{s.order_no || <span className="pr-dash">—</span>}</td>
                    <td className="pr-use">{s.memo || <span className="pr-dash">—</span>}</td>
                    {isAdmin && <td className="r"><button className="pr-lnk danger" onClick={() => del(s)}>삭제</button></td>}
                  </tr>
                )
              })}
              {!loading && rows.length === 0 && <EmptyRow cols={9} text="판매 기록이 없습니다." />}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
