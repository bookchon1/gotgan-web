import { useMemo, useState } from 'react'
import { LoadingRow, EmptyRow } from '../../../components/States'
import { supabase } from '../../../lib/supabase'
import { won } from '../../../lib/format'
import { Chips, Drawer, Field, NumIn, SearchBox, StoreChip, Thumb } from './parts'
import { STORE_STATES, isProduct, type Item, type Listing } from './lib'

const FIELDS: { k: keyof Listing; label: string }[] = [
  { k: 'store_category', label: '스토어 카테고리' }, { k: 'display_name', label: '노출용 상품명' }, { k: 'keywords', label: '검색 키워드' },
  { k: 'summary', label: '상품 요약' }, { k: 'detail', label: '상세 설명' }, { k: 'main_image', label: '대표 이미지' },
  { k: 'detail_images', label: '상세 이미지' }, { k: 'shipping', label: '배송방법·배송비' },
]
/** 등록 준비도: 항목 8개 + URL */
function readiness(it: Item, l?: Listing): number {
  const done = FIELDS.filter((f) => ((l?.[f.k] as string | null) ?? '').trim()).length + (it.store_url ? 1 : 0)
  return Math.round((done / (FIELDS.length + 1)) * 100)
}

/** 스마트스토어 등록 준비 */
export function StoreTab({ items, listings, loading, isAdmin, reload, preset }: { items: Item[]; listings: Listing[]; loading: boolean; isAdmin: boolean; reload: () => void; preset?: string }) {
  const products = useMemo(() => items.filter(isProduct), [items])
  const lm = useMemo(() => new Map(listings.map((l) => [l.inventory_id, l])), [listings])
  const [st, setSt] = useState(preset ?? 'all')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<Item | null>(null)
  const stOf = (it: Item) => it.store_status ?? '미지정'
  const list = useMemo(() => {
    const t = q.trim().toLowerCase()
    return products.filter((it) => (st === 'all' || stOf(it) === st) && (!t || [it.name, it.option_spec, it.item_id, it.major].some((v) => (v ?? '').toLowerCase().includes(t))))
  }, [products, st, q])
  const cnt = (s: string) => products.filter((it) => stOf(it) === s).length

  return (
    <div className="pr-pane">
      <div className="pr-top">
        <Chips value={st} onChange={setSt} options={[{ v: 'all', label: '전체', n: products.length }, ...[...STORE_STATES, '미지정'].map((s) => ({ v: s, label: s, n: cnt(s) }))]} />
        <div className="pr-tools"><SearchBox value={q} onChange={setQ} width={240} /></div>
      </div>
      <div className="pr-card">
        <div className="tbl-wrap">
          <table className="pr-tbl">
            <thead><tr><th>상품</th><th>상태</th><th className="r">판매가</th><th>등록 준비도</th><th>등록일</th><th>URL</th></tr></thead>
            <tbody>
              {loading && <LoadingRow cols={6} />}
              {!loading && list.map((it) => {
                const l = lm.get(it.id)
                const r = readiness(it, l)
                return (
                  <tr key={it.id} className="pr-row" onClick={() => setOpen(it)}>
                    <td><div className="pr-nm"><Thumb quiet it={it} /><div><div className="t" title={it.name}>{it.name}</div><div className="s"><span className="opt">{it.option_spec ?? ''}</span><span>{it.item_id}</span></div></div></div></td>
                    <td><StoreChip v={it.store_status} /></td>
                    <td className="r tnum">{it.sell_price ? won(it.sell_price) : <span className="pr-dash">—</span>}</td>
                    <td><div className="pr-prog"><i><u style={{ width: `${r}%` }} className={r >= 100 ? 'ok' : ''} /></i><b className="tnum">{r}%</b></div></td>
                    <td className="tnum">{l?.registered_on ?? <span className="pr-dash">—</span>}</td>
                    <td onClick={(e) => e.stopPropagation()}>{it.store_url ? <a className="pr-link" href={it.store_url} target="_blank" rel="noreferrer">열기 ↗</a> : <span className="pr-dash">—</span>}</td>
                  </tr>
                )
              })}
              {!loading && list.length === 0 && <EmptyRow cols={6} text="조건에 맞는 상품이 없습니다." />}
            </tbody>
          </table>
        </div>
        <div className="pr-foot"><span>{list.length === products.length ? `총 ${products.length}개` : `${list.length} / ${products.length}개`}</span></div>
      </div>
      {open && <StoreDrawer it={open} l={lm.get(open.id)} isAdmin={isAdmin} onClose={() => setOpen(null)} onSaved={() => { setOpen(null); reload() }} />}
    </div>
  )
}

function StoreDrawer({ it, l, isAdmin, onClose, onSaved }: { it: Item; l?: Listing; isAdmin: boolean; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<Record<string, string>>(() => {
    const o: Record<string, string> = { registered_on: l?.registered_on ?? '', check_note: l?.check_note ?? '', store_status: it.store_status ?? '', store_url: it.store_url ?? '' }
    for (const x of FIELDS) o[x.k] = (l?.[x.k] as string | null) ?? ''
    return o
  })
  const [price, setPrice] = useState(it.sell_price)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }))
  const ro = !isAdmin
  async function save() {
    setBusy(true); setErr(null)
    const r1 = await supabase.from('inventory').update({ store_status: f.store_status || null, store_url: f.store_url.trim() || null, sell_price: price, updated_at: new Date().toISOString() }).eq('id', it.id)
    if (r1.error) { setBusy(false); setErr(r1.error.message); return }
    const row: Record<string, string | null> = { inventory_id: it.id, registered_on: f.registered_on || null, check_note: f.check_note.trim() || null }
    for (const x of FIELDS) row[x.k] = f[x.k].trim() || null
    const r2 = await supabase.from('store_listings').upsert({ ...row, updated_at: new Date().toISOString() })
    setBusy(false)
    if (r2.error) { setErr(r2.error.message); return }
    onSaved()
  }
  const long = new Set(['summary', 'detail', 'detail_images'])
  return (
    <Drawer sub={`${it.item_id} · 스토어 등록 준비`} title={it.name + (it.option_spec ? ` · ${it.option_spec}` : '')} onClose={onClose}
      footer={<><span className="pr-sp" />{err && <span className="pr-err">{err}</span>}<button className="pr-btn" onClick={onClose} disabled={busy}>{isAdmin ? '취소' : '닫기'}</button>{isAdmin && <button className="pr-btn pri" onClick={save} disabled={busy}>{busy ? '저장 중…' : '저장'}</button>}</>}>
      <section className="pr-sec">
        <h4>등록 현황</h4>
        <div className="pr-grid">
          <Field label="등록 상태"><select className="ctl" value={f.store_status} disabled={ro} onChange={(e) => set('store_status', e.target.value)}><option value=""></option>{STORE_STATES.map((s) => <option key={s}>{s}</option>)}</select></Field>
          <Field label="등록일"><input className="ctl" type="date" value={f.registered_on} disabled={ro} onChange={(e) => set('registered_on', e.target.value)} /></Field>
          <Field label="판매가(원)"><NumIn money value={price} disabled={ro} onChange={setPrice} /></Field>
          <Field label="상품 URL" wide><input className="ctl" value={f.store_url} disabled={ro} onChange={(e) => set('store_url', e.target.value)} /></Field>
        </div>
      </section>
      <section className="pr-sec">
        <h4>등록 정보</h4>
        <div className="pr-grid">
          {FIELDS.map((x) => (
            <Field key={x.k} label={x.label} wide={long.has(x.k) || x.k === 'display_name'}>
              {long.has(x.k) ? <textarea className="ctl" rows={x.k === 'detail' ? 6 : 3} value={f[x.k]} disabled={ro} onChange={(e) => set(x.k, e.target.value)} /> : <input className="ctl" value={f[x.k]} disabled={ro} onChange={(e) => set(x.k, e.target.value)} />}
            </Field>
          ))}
        </div>
      </section>
      <section className="pr-sec">
        <h4>수정·확인사항</h4>
        <textarea className="ctl" rows={3} value={f.check_note} disabled={ro} onChange={(e) => set('check_note', e.target.value)} />
      </section>
    </Drawer>
  )
}
