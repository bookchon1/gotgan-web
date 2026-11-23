import { useMemo, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { Chips, SearchBox, Thumb, StatChip } from './parts'
import { OrderExpenseModal } from './OrderModal'
import { isProduct, type Bom, type Item } from './lib'

/** 상품별 구성표(BOM) — 상품 1개에 들어가는 자재, 제작 수량에 따른 필요·부족 계산 */
export function BomTab({ items, bom, isAdmin, reload }: { items: Item[]; bom: Bom[]; isAdmin: boolean; reload: () => void }) {
  const products = useMemo(() => items.filter(isProduct), [items])
  const mats = useMemo(() => items.filter((x) => !isProduct(x)), [items])
  const byId = useMemo(() => new Map(items.map((x) => [x.id, x])), [items])
  const [q, setQ] = useState('')
  const [only, setOnly] = useState('all')
  const [pid, setPid] = useState<string | null>(null)
  const [plan, setPlan] = useState<Record<string, number>>({})
  const [mq, setMq] = useState('')
  const [order, setOrder] = useState<{ items: Item[]; qty: Record<string, number> } | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const countOf = useMemo(() => {
    const m = new Map<string, number>()
    for (const b of bom) m.set(b.product_id, (m.get(b.product_id) ?? 0) + 1)
    return m
  }, [bom])
  const list = useMemo(() => {
    const t = q.trim().toLowerCase()
    return products.filter((p) => (only === 'all' || (only === 'has' ? countOf.has(p.id) : !countOf.has(p.id))) && (!t || [p.name, p.option_spec, p.item_id].some((v) => (v ?? '').toLowerCase().includes(t))))
  }, [products, q, only, countOf])

  const cur = pid ? byId.get(pid) ?? null : null
  const rows = useMemo(() => bom.filter((b) => b.product_id === pid).sort((a, b) => a.sort - b.sort), [bom, pid])
  const n = (pid && plan[pid]) || 0
  const calc = rows.map((b) => {
    const m = byId.get(b.material_id)
    const need = b.qty_per * n
    return { b, m, need, short: m ? Math.max(0, need - m.avail) : 0 }
  })
  const shortList = calc.filter((c) => c.m && c.short > 0)
  const cands = useMemo(() => {
    const t = mq.trim().toLowerCase()
    if (!t) return []
    const have = new Set(rows.map((r) => r.material_id))
    return mats.filter((m) => !have.has(m.id) && [m.name, m.option_spec, m.item_id, m.usage_note].some((v) => (v ?? '').toLowerCase().includes(t))).slice(0, 8)
  }, [mq, mats, rows])

  async function addMat(m: Item) {
    if (!pid) return
    const { error } = await supabase.from('product_bom').insert({ product_id: pid, material_id: m.id, qty_per: 1, sort: rows.length })
    if (error) { alert(error.message); return }
    setMq(''); reload()
  }
  async function setQty(b: Bom, v: number) {
    const { error } = await supabase.from('product_bom').update({ qty_per: v }).eq('id', b.id)
    if (error) alert(error.message); else reload()
  }
  async function setMemo(b: Bom, v: string) {
    if (v === (b.memo ?? '')) return
    const { error } = await supabase.from('product_bom').update({ memo: v || null }).eq('id', b.id)
    if (error) alert(error.message); else reload()
  }
  async function del(b: Bom) {
    const { error } = await supabase.from('product_bom').delete().eq('id', b.id)
    if (error) alert(error.message); else reload()
  }

  return (
    <div className="pr-pane pr-bom">
      <aside className="pr-card pr-bl">
        <div className="hd">
          <SearchBox value={q} onChange={setQ} />
          <Chips value={only} onChange={setOnly} options={[{ v: 'all', label: '전체' }, { v: 'has', label: '구성 있음', n: countOf.size }, { v: 'none', label: '미작성' }]} />
        </div>
        <ul>
          {list.map((p) => (
            <li key={p.id} className={pid === p.id ? 'on' : ''} onClick={() => setPid(p.id)}>
              <Thumb quiet it={p} size={34} />
              <div><b>{p.name}</b><small>{p.option_spec ?? p.item_id}</small></div>
              {countOf.has(p.id) ? <em className="tnum">{countOf.get(p.id)}종</em> : <em className="none">—</em>}
            </li>
          ))}
          {list.length === 0 && <li className="empty">상품이 없습니다.</li>}
        </ul>
      </aside>

      <section className="pr-card pr-br">
        {!cur ? (
          <div className="pr-empty big">왼쪽에서 상품을 선택하세요.</div>
        ) : (
          <>
            <header className="ph">
              <Thumb it={cur} size={52} />
              <div className="t"><small>{cur.item_id}</small><h3>{cur.name}</h3><span>{cur.option_spec}</span></div>
              <label className="plan">
                <small>제작 예정 수량</small>
                <input className="ctl tnum" inputMode="numeric" value={n || ''} placeholder="0" onChange={(e) => setPlan({ ...plan, [cur.id]: Number(e.target.value.replace(/[^0-9]/g, '')) || 0 })} />
              </label>
            </header>
            {note && <div className="pr-note">{note}</div>}
            <div className="tbl-wrap">
              <table className="pr-tbl">
                <thead><tr><th>구성 자재</th><th className="r">1개당 소요량</th><th className="r">가용재고</th><th className="r">필요 수량</th><th className="r">부족</th><th>메모</th>{isAdmin && <th />}</tr></thead>
                <tbody>
                  {calc.map(({ b, m, need, short }) => (
                    <tr key={b.id} className={short > 0 ? 'out' : ''}>
                      <td>{m ? <div className="pr-nm"><Thumb quiet it={m} size={32} /><div><div className="t" title={m.name}>{m.name}</div><div className="s"><span className="opt">{m.option_spec ?? ''}</span><span>{m.item_id}</span></div></div></div> : <span className="pr-dash">삭제된 자재</span>}</td>
                      <td className="r">{isAdmin ? <input className="ctl tnum pr-mini" defaultValue={b.qty_per} onBlur={(e) => { const v = Number(e.target.value); if (!isNaN(v) && v >= 0 && v !== b.qty_per) void setQty(b, v) }} /> : <span className="tnum">{b.qty_per}</span>}</td>
                      <td className="r">{m ? <><b className="tnum">{m.avail}</b> <StatChip it={m} /></> : '—'}</td>
                      <td className="r tnum">{n ? need : <span className="pr-dash">—</span>}</td>
                      <td className="r tnum">{n ? short > 0 ? <b className="pr-short">{short}</b> : <span className="pr-okc">충분</span> : <span className="pr-dash">—</span>}</td>
                      <td>{isAdmin ? <input className="ctl pr-memo" defaultValue={b.memo ?? ''} onBlur={(e) => void setMemo(b, e.target.value)} /> : b.memo}</td>
                      {isAdmin && <td className="r"><button className="pr-lnk danger" onClick={() => del(b)}>삭제</button></td>}
                    </tr>
                  ))}
                  {rows.length === 0 && <tr><td colSpan={7} className="pr-empty">구성 자재가 없습니다.</td></tr>}
                </tbody>
              </table>
            </div>
            {isAdmin && (
              <div className="pr-addmat">
                <div className="pr-pick">
                  <input className="ctl" placeholder="＋ 부자재 검색해서 추가" value={mq} onChange={(e) => setMq(e.target.value)} />
                  {cands.length > 0 && (
                    <ul>
                      {cands.map((m) => (
                        <li key={m.id} onClick={() => addMat(m)}>
                          <Thumb quiet it={m} size={26} /><div><b>{m.name}</b><small>{m.option_spec ?? m.mat_type ?? ''}</small></div><em className="tnum">가용 {m.avail}</em>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
            {n > 0 && (
              <footer className={`pr-bsum ${shortList.length ? 'bad' : 'ok'}`}>
                <span>{shortList.length ? <>부족 자재 <b>{shortList.length}종</b></> : <>모든 자재가 충분합니다</>}</span>
                {isAdmin && shortList.length > 0 && (
                  <button className="pr-btn pri" onClick={() => setOrder({ items: shortList.map((c) => c.m!), qty: Object.fromEntries(shortList.map((c) => [c.m!.id, Math.ceil(c.short)])) })}>
                    부족 자재 품의서 작성 →
                  </button>
                )}
              </footer>
            )}
          </>
        )}
      </section>
      {order && <OrderExpenseModal items={order.items} initialQty={order.qty} onClose={() => setOrder(null)} onSubmitted={(m) => { setOrder(null); setNote(m); reload() }} />}
    </div>
  )
}
