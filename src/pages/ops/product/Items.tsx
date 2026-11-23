import { useEffect, useMemo, useRef, useState } from 'react'
import { LoadingRow, EmptyRow } from '../../../components/States'
import { supabase } from '../../../lib/supabase'
import { won } from '../../../lib/format'
import { PurchaseHistModal } from '../PurchaseHistModal'
import { OrderExpenseModal } from './OrderModal'
import { Chips, Drawer, Field, NumIn, SearchBox, StatChip, StoreChip, Thumb } from './parts'
import {
  MAJORS, MAT_TYPES, MINORS, PREP_STATES, STOCK_FORMS, STORE_STATES, csvDownload, imgUrl, isProduct, nextItemId, statOf, type Item,
} from './lib'

export type ItemFilter = { stat?: string; store?: string; major?: string; q?: string }

/** 판매상품 / 부자재 목록 + 상세 패널 */
export function ItemsTab({
  kind, items, loading, isAdmin, reload, preset, openId, clearOpen,
}: {
  kind: 'product' | 'material'
  items: Item[]
  loading: boolean
  isAdmin: boolean
  reload: () => void
  preset?: ItemFilter
  openId?: string | null
  clearOpen?: () => void
}) {
  const isP = kind === 'product'
  const mine = useMemo(() => items.filter((it) => (isP ? isProduct(it) : !isProduct(it))), [items, isP])
  const [q, setQ] = useState(preset?.q ?? '')
  const [grp, setGrp] = useState(preset?.major ?? 'all') // 대분류 / 부자재 종류
  const [minor, setMinor] = useState('all')
  const [stat, setStat] = useState(preset?.stat ?? 'all')
  const [store, setStore] = useState(preset?.store ?? 'all')
  const [sel, setSel] = useState<Record<string, boolean>>({})
  const [edit, setEdit] = useState<Item | 'new' | null>(null)
  const [order, setOrder] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  useEffect(() => {
    if (openId) {
      const f = items.find((x) => x.id === openId)
      if (f) setEdit(f)
      clearOpen?.()
    }
  }, [openId, items, clearOpen])

  const groups = isP ? MAJORS : ['제작 부자재', '포장 부자재', '기타']
  const key = (it: Item) => (isP ? it.major : it.mat_type) ?? ''
  const minors = isP && grp !== 'all' ? MINORS[grp] ?? [] : []

  const list = useMemo(() => {
    const t = q.trim().toLowerCase()
    return mine.filter((it) => {
      if (grp !== 'all' && key(it) !== grp) return false
      if (minor !== 'all' && (it.minor ?? '') !== minor) return false
      if (stat !== 'all' && statOf(it) !== stat) return false
      if (isP && store !== 'all' && (it.store_status ?? '미지정') !== store) return false
      if (!t) return true
      return [it.name, it.option_spec, it.item_id, it.code, it.location, it.minor, it.usage_note, it.memo].some((v) => (v ?? '').toLowerCase().includes(t))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mine, q, grp, minor, stat, store, isP])

  const cnt = (f: (it: Item) => boolean) => mine.filter(f).length
  const selected = useMemo(() => mine.filter((it) => sel[it.id]), [mine, sel])
  const allChecked = list.length > 0 && list.every((it) => sel[it.id])
  const selTotal = selected.reduce((s, it) => s + Math.max(it.min_qty - it.avail, 1) * it.unit_price, 0)

  function exportCsv() {
    if (isP)
      csvDownload('판매상품_재고.csv', ['품목ID', '관리코드', '대분류', '소분류', '상품명', '옵션·규격', '보관위치', '기준재고', '입고예정', '사용수량', '판매누계', '가용재고', '안전재고', '재고상태', '매입단가', '판매가', '스토어 등록상태', '상품 URL', '비고'],
        list.map((it) => [it.item_id, it.code, it.major, it.minor, it.name, it.option_spec, it.location, it.stock, it.incoming, it.used_qty, it.sold_qty, it.avail, it.min_qty, statOf(it), it.unit_price, it.sell_price, it.store_status, it.store_url, it.memo]))
    else
      csvDownload('부자재_재고.csv', ['품목ID', '관리코드', '부자재 종류', '자재명', '옵션·규격', '보관위치', '기준재고', '입고예정', '사용·출고', '가용재고', '안전재고', '재고상태', '매입단가', '사용처·관련상품', '비고'],
        list.map((it) => [it.item_id, it.code, it.mat_type, it.name, it.option_spec, it.location, it.stock, it.incoming, it.used_qty, it.avail, it.min_qty, statOf(it), it.unit_price, it.usage_note, it.memo]))
  }

  const cols = isP ? 9 : 8

  return (
    <div className="pr-pane">
      <div className="pr-top">
        <Chips
          value={grp}
          onChange={(v) => { setGrp(v); setMinor('all') }}
          options={[{ v: 'all', label: '전체', n: mine.length }, ...groups.map((g) => ({ v: g, label: g, n: cnt((it) => key(it) === g) }))]}
        />
        <div className="pr-tools">
          <SearchBox value={q} onChange={setQ} width={240} />
          {minors.length > 0 && (
            <select className="pr-sel" value={minor} onChange={(e) => setMinor(e.target.value)}>
              <option value="all">소분류 전체</option>
              {minors.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          )}
          <select className="pr-sel" value={stat} onChange={(e) => setStat(e.target.value)}>
            <option value="all">재고상태 전체</option>
            <option value="ok">정상</option>
            <option value="low">발주 검토</option>
            <option value="out">{isP ? '품절' : '소진'}</option>
          </select>
          {isP && (
            <select className="pr-sel" value={store} onChange={(e) => setStore(e.target.value)}>
              <option value="all">스토어 전체</option>
              {[...STORE_STATES, '미지정'].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
          <span className="pr-sp" />
          <button className="pr-btn" onClick={exportCsv}>엑셀 내려받기</button>
          {isAdmin && <button className="pr-btn pri" onClick={() => setEdit('new')}>＋ {isP ? '상품' : '자재'} 등록</button>}
        </div>
      </div>

      {note && <div className="pr-note">{note}</div>}

      <div className="pr-card">
        <div className="tbl-wrap">
          <table className="pr-tbl">
            <thead>
              <tr>
                <th style={{ width: 34 }}>
                  <input type="checkbox" checked={allChecked} onChange={(e) => { const n = { ...sel }; for (const it of list) n[it.id] = e.target.checked; setSel(n) }} aria-label="전체 선택" />
                </th>
                <th>{isP ? '상품' : '자재'}</th>
                <th>{isP ? '분류' : '종류'}</th>
                <th className="r">가용재고</th>
                <th>상태</th>
                <th className="r">매입단가</th>
                {isP ? <th className="r">판매가</th> : <th>사용처·관련상품</th>}
                {isP && <th>스토어</th>}
                <th>위치</th>
              </tr>
            </thead>
            <tbody>
              {loading && <LoadingRow cols={cols + 1} />}
              {!loading &&
                list.map((it) => {
                  const st = statOf(it)
                  const margin = isP && it.sell_price > 0 && it.unit_price > 0 ? Math.round(((it.sell_price - it.unit_price) / it.sell_price) * 100) : null
                  return (
                    <tr key={it.id} className={`pr-row ${st}`} onClick={() => setEdit(it)}>
                      <td onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={!!sel[it.id]} onChange={(e) => setSel({ ...sel, [it.id]: e.target.checked })} aria-label="선택" />
                      </td>
                      <td>
                        <div className="pr-nm">
                          <Thumb it={it} />
                          <div>
                            <div className="t" title={it.name}>{it.name}</div>
                            <div className="s">
                              {it.option_spec && <span className="opt">{it.option_spec}</span>}
                              <span>{it.item_id}{it.code ? ` · ${it.code}` : ''}</span>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="pr-cat">
                        {isP ? (
                          <>
                            <span>{it.major || '—'}</span>
                            {it.minor && <small>{it.minor}</small>}
                          </>
                        ) : (
                          <span className={`pr-mt ${it.mat_type === '제작 부자재' ? 'a' : it.mat_type === '포장 부자재' ? 'b' : 'c'}`}>{it.mat_type || '—'}</span>
                        )}
                      </td>
                      <td className="r">
                        <div className={`pr-qty ${st}`}>{it.avail}</div>
                        {(it.incoming > 0 || it.used_qty > 0 || it.sold_qty > 0) && (
                          <small className="pr-qs">
                            기준 {it.stock}
                            {it.incoming > 0 && <em className="in"> +{it.incoming}</em>}
                            {(it.used_qty > 0 || it.sold_qty > 0) && <em className="out"> −{it.used_qty + it.sold_qty}</em>}
                          </small>
                        )}
                      </td>
                      <td><StatChip it={it} />{it.incoming > 0 && <span className="pr-inc">입고예정 {it.incoming}</span>}</td>
                      <td className="r tnum">{it.unit_price ? won(it.unit_price) : <span className="pr-dash">—</span>}</td>
                      {isP ? (
                        <td className="r tnum">
                          {it.sell_price ? won(it.sell_price) : <span className="pr-dash">—</span>}
                          {margin !== null && <small className={`pr-mg ${margin < 0 ? 'neg' : ''}`}>마진 {margin}%</small>}
                        </td>
                      ) : (
                        <td className="pr-use">{it.usage_note || <span className="pr-dash">—</span>}</td>
                      )}
                      {isP && (
                        <td onClick={(e) => e.stopPropagation()}>
                          <StoreChip v={it.store_status} />
                          {it.store_url && <a className="pr-link" href={it.store_url} target="_blank" rel="noreferrer" title="스토어 상품 페이지">↗</a>}
                        </td>
                      )}
                      <td className="pr-loc">{it.location || <span className="pr-dash">—</span>}</td>
                    </tr>
                  )
                })}
              {!loading && list.length === 0 && <EmptyRow cols={cols + 1} text="조건에 맞는 품목이 없습니다." />}
            </tbody>
          </table>
        </div>
        <div className="pr-foot">
          <span>{list.length === mine.length ? `총 ${mine.length}개` : `${list.length} / ${mine.length}개`}</span>
        </div>
      </div>

      {selected.length > 0 && (
        <div className="pr-bulk">
          <b>{selected.length}개 선택</b>
          <span>발주 예상 ₩{won(selTotal)}</span>
          <button className="pr-btn" onClick={() => setSel({})}>선택 해제</button>
          {isAdmin && <button className="pr-btn pri" onClick={() => setOrder(true)}>선택 품목 품의서 작성 →</button>}
        </div>
      )}

      {edit && (
        <ItemDrawer
          kind={kind} item={edit === 'new' ? null : edit} all={items} isAdmin={isAdmin}
          onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload() }}
        />
      )}
      {order && (
        <OrderExpenseModal
          items={selected}
          onClose={() => setOrder(false)}
          onSubmitted={(m) => { setOrder(false); setSel({}); setNote(m); reload() }}
        />
      )}
    </div>
  )
}

// ============ 상세·수정 패널 ============
type F = {
  name: string; option_spec: string; major: string; minor: string; mat_type: string; stock_form: string; prep_status: string
  code: string; location: string; unit: string; stock: number; min_qty: number; incoming: number; used_qty: number
  unit_price: number; sell_price: number; store_status: string; store_url: string; usage_note: string; memo: string; image_path: string
}
const toF = (it: Item | null, isP: boolean): F => ({
  name: it?.name ?? '', option_spec: it?.option_spec ?? '', major: it?.major ?? (isP ? MAJORS[0] : ''), minor: it?.minor ?? '',
  mat_type: it?.mat_type ?? (isP ? '' : MAT_TYPES[0]), stock_form: it?.stock_form ?? '', prep_status: it?.prep_status ?? '',
  code: it?.code ?? '', location: it?.location ?? '', unit: it?.unit ?? '', stock: it?.stock ?? 0, min_qty: it?.min_qty ?? 0,
  incoming: it?.incoming ?? 0, used_qty: it?.used_qty ?? 0, unit_price: it?.unit_price ?? 0, sell_price: it?.sell_price ?? 0,
  store_status: it?.store_status ?? '', store_url: it?.store_url ?? '', usage_note: it?.usage_note ?? '', memo: it?.memo ?? '', image_path: it?.image_path ?? '',
})

export function ItemDrawer({ kind, item, all, isAdmin, onClose, onSaved }: {
  kind: 'product' | 'material'; item: Item | null; all: Item[]; isAdmin: boolean; onClose: () => void; onSaved: () => void
}) {
  const isP = kind === 'product'
  const [f, setF] = useState<F>(() => toF(item, isP))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [hist, setHist] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const set = <K extends keyof F>(k: K, v: F[K]) => setF((p) => ({ ...p, [k]: v }))
  const ro = !isAdmin
  const sold = item?.sold_qty ?? 0
  const avail = f.stock + f.incoming - f.used_qty - sold
  const draft = { ...(item ?? ({ id: '', category: isP ? '완제품' : '부자재' } as Item)), ...f, sold_qty: sold, avail } as Item

  async function save() {
    if (!f.name.trim()) { setErr(`${isP ? '상품명' : '자재명'}을 입력하세요.`); return }
    setBusy(true); setErr(null)
    const patch = {
      name: f.name.trim(), option_spec: f.option_spec.trim() || null, code: f.code.trim() || null, location: f.location.trim() || null,
      unit: f.unit.trim() || null, stock_form: f.stock_form || null, stock: f.stock, min_qty: f.min_qty, incoming: f.incoming, used_qty: f.used_qty,
      unit_price: f.unit_price, memo: f.memo.trim() || null, image_path: f.image_path || null, updated_at: new Date().toISOString(),
      ...(isP
        ? { major: f.major || null, minor: f.minor || null, prep_status: f.prep_status || null, sell_price: f.sell_price, store_status: f.store_status || null, store_url: f.store_url.trim() || null }
        : { mat_type: f.mat_type || null, usage_note: f.usage_note.trim() || null }),
    }
    const { error } = item
      ? await supabase.from('inventory').update(patch).eq('id', item.id)
      : await supabase.from('inventory').insert({ ...patch, item_id: nextItemId(all, isP ? 'S' : 'M'), category: isP ? '완제품' : '부자재' })
    setBusy(false)
    if (error) { setErr(error.message); return }
    onSaved()
  }
  async function receive() {
    if (!item || !item.incoming) return
    setBusy(true)
    await supabase.from('inventory').update({ stock: item.stock + item.incoming, incoming: 0, updated_at: new Date().toISOString() }).eq('id', item.id)
    await supabase.from('purchase_history').insert({ inventory_id: item.id, code: item.code, date: new Date().toISOString().slice(0, 10), qty: item.incoming, unit_price: item.unit_price, partner: '입고' })
    setBusy(false)
    onSaved()
  }
  async function remove() {
    if (!item) return
    if (!window.confirm(`"${item.name}"을(를) 삭제할까요?\n판매기록·구성표·매입이력 연결 데이터가 함께 정리되며 되돌릴 수 없습니다.`)) return
    setBusy(true)
    const { error } = await supabase.from('inventory').delete().eq('id', item.id)
    setBusy(false)
    if (error) { setErr(error.message); return }
    onSaved()
  }
  async function upload(file: File) {
    const ext = (file.name.match(/\.([A-Za-z0-9]{1,5})$/)?.[1] ?? 'jpg').toLowerCase()
    const path = `${item?.item_id ?? 'new'}/${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('product-images').upload(path, file, { upsert: true, contentType: file.type || undefined })
    if (error) { setErr(`이미지 올리기 실패: ${error.message}`); return }
    set('image_path', path)
  }

  const heroName = f.name || (isP ? '새 상품' : '새 자재')
  return (
    <Drawer
      sub={item ? `${item.item_id ?? ''}${item.code ? ` · 관리코드 ${item.code}` : ''}` : isP ? '신규 판매상품' : '신규 부자재'}
      title={heroName}
      onClose={onClose}
      footer={
        <>
          {item && isAdmin && <button className="pr-btn danger" onClick={remove} disabled={busy}>삭제</button>}
          <span className="pr-sp" />
          {err && <span className="pr-err">{err}</span>}
          <button className="pr-btn" onClick={onClose} disabled={busy}>{isAdmin ? '취소' : '닫기'}</button>
          {isAdmin && <button className="pr-btn pri" onClick={save} disabled={busy}>{busy ? '저장 중…' : '저장'}</button>}
        </>
      }
    >
      <div className="pr-hero">
        <div className="pic">
          <Thumb it={draft} size={84} />
          {isAdmin && (
            <>
              <button className="pr-btn sm" onClick={() => fileRef.current?.click()}>{f.image_path ? '이미지 변경' : '이미지 올리기'}</button>
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { const x = e.target.files?.[0]; e.target.value = ''; if (x) void upload(x) }} />
              {f.image_path && imgUrl(f.image_path) && <button className="pr-lnk" onClick={() => set('image_path', '')}>지우기</button>}
            </>
          )}
        </div>
        <div className="nums">
          <div className={`big ${statOf(draft)}`}><small>가용재고</small><b className="tnum">{avail}</b><StatChipMini it={draft} /></div>
          <div><small>기준재고</small><b className="tnum">{f.stock}</b></div>
          <div><small>안전재고</small><b className="tnum">{f.min_qty}</b></div>
          <div><small>입고예정</small><b className="tnum">{f.incoming}</b></div>
        </div>
      </div>
      {item && (
        <div className="pr-acts">
          {isAdmin && item.incoming > 0 && <button className="pr-btn pri" onClick={receive} disabled={busy}>입고 처리 (+{item.incoming})</button>}
          <button className="pr-btn" onClick={() => setHist(true)}>매입 이력</button>
          {isP && item.store_url && <a className="pr-btn" href={item.store_url} target="_blank" rel="noreferrer">스토어 페이지 ↗</a>}
        </div>
      )}

      <section className="pr-sec">
        <h4>기본 정보</h4>
        <div className="pr-grid">
          <Field label={isP ? '상품명' : '자재명'} wide><input className="ctl" value={f.name} disabled={ro} onChange={(e) => set('name', e.target.value)} /></Field>
          <Field label="옵션·규격" wide><input className="ctl" value={f.option_spec} disabled={ro} onChange={(e) => set('option_spec', e.target.value)} /></Field>
          {isP ? (
            <>
              <Field label="대분류">
                <select className="ctl" value={f.major} disabled={ro} onChange={(e) => { set('major', e.target.value); set('minor', '') }}>
                  {MAJORS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </Field>
              <Field label="소분류">
                <select className="ctl" value={f.minor} disabled={ro || (MINORS[f.major] ?? []).length === 0} onChange={(e) => set('minor', e.target.value)}>
                  <option value=""></option>
                  {(MINORS[f.major] ?? []).map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </Field>
              <Field label="상품 준비 상태">
                <select className="ctl" value={f.prep_status} disabled={ro} onChange={(e) => set('prep_status', e.target.value)}>
                  <option value=""></option>{PREP_STATES.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </Field>
            </>
          ) : (
            <Field label="부자재 종류">
              <select className="ctl" value={f.mat_type} disabled={ro} onChange={(e) => set('mat_type', e.target.value)}>
                <option value=""></option>{MAT_TYPES.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </Field>
          )}
          <Field label="재고 형태">
            <select className="ctl" value={f.stock_form} disabled={ro} onChange={(e) => set('stock_form', e.target.value)}>
              <option value=""></option>{STOCK_FORMS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </Field>
          <Field label="보관위치"><input className="ctl" value={f.location} disabled={ro} onChange={(e) => set('location', e.target.value)} /></Field>
          <Field label="기존 관리코드"><input className="ctl" value={f.code} disabled={ro} onChange={(e) => set('code', e.target.value)} /></Field>
          <Field label="단위"><input className="ctl" value={f.unit} disabled={ro} onChange={(e) => set('unit', e.target.value)} /></Field>
        </div>
      </section>

      <section className="pr-sec">
        <h4>재고 · 단가</h4>
        <div className="pr-grid">
          <Field label="기준재고"><NumIn value={f.stock} disabled={ro} onChange={(n) => set('stock', n)} /></Field>
          <Field label="안전재고"><NumIn value={f.min_qty} disabled={ro} onChange={(n) => set('min_qty', n)} /></Field>
          <Field label="입고예정"><NumIn value={f.incoming} disabled={ro} onChange={(n) => set('incoming', n)} /></Field>
          <Field label={isP ? '기존 판매·사용수량' : '사용·출고수량'}><NumIn value={f.used_qty} disabled={ro} onChange={(n) => set('used_qty', n)} /></Field>
          {isP && <Field label="판매기록 누계"><input className="ctl tnum" value={sold} disabled /></Field>}
          <Field label="매입단가(원)"><NumIn money value={f.unit_price} disabled={ro} onChange={(n) => set('unit_price', n)} /></Field>
          {isP && <Field label="판매가(원)"><NumIn money value={f.sell_price} disabled={ro} onChange={(n) => set('sell_price', n)} /></Field>}
        </div>
      </section>

      {isP ? (
        <section className="pr-sec">
          <h4>스마트스토어</h4>
          <div className="pr-grid">
            <Field label="등록 상태">
              <select className="ctl" value={f.store_status} disabled={ro} onChange={(e) => set('store_status', e.target.value)}>
                <option value=""></option>{STORE_STATES.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </Field>
            <Field label="상품 URL" wide><input className="ctl" value={f.store_url} disabled={ro} onChange={(e) => set('store_url', e.target.value)} /></Field>
          </div>
        </section>
      ) : (
        <section className="pr-sec">
          <h4>사용처</h4>
          <div className="pr-grid">
            <Field label="사용처·관련상품" wide><input className="ctl" value={f.usage_note} disabled={ro} onChange={(e) => set('usage_note', e.target.value)} /></Field>
          </div>
        </section>
      )}

      <section className="pr-sec">
        <h4>비고</h4>
        <textarea className="ctl" rows={3} value={f.memo} disabled={ro} onChange={(e) => set('memo', e.target.value)} />
      </section>
      {hist && item && <PurchaseHistModal item={item} onClose={() => setHist(false)} />}
    </Drawer>
  )
}

function StatChipMini({ it }: { it: Item }) {
  return <StatChip it={it} />
}
