import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react'
import { PageHead } from '../../components/PageHead'
import { ErrorBanner, LoadingRow, EmptyRow } from '../../components/States'
import { supabase } from '../../lib/supabase'
import { useQuery } from '../../lib/useQuery'
import { useAuth } from '../../lib/auth'
import { won } from '../../lib/format'
import type { Employee } from '../../types/db'

// ===================== 미술 · 재고관리 (보존처리 재료·소모품) =====================
const CATS = ['약품·용제', '지류·한지', '접착제·풀', '안료·채색', '도구·장비', '소모품', '기타']

interface Supply {
  id: string
  name: string
  category: string | null
  spec: string | null
  unit: string
  stock: number
  min_qty: number
  unit_price: number
  incoming: number
  location: string | null
  memo: string | null
}
interface Move {
  id: string
  supply_id: string
  kind: '입고' | '출고' | '발주'
  qty: number
  balance: number | null
  memo: string | null
  created_at: string
}

const lack = (s: Supply) => Math.max(0, s.min_qty - s.stock) // 부족 수량
const nn = (v: string) => v.trim() || null
const num = (v: string) => parseInt(v.replace(/[^0-9]/g, ''), 10) || 0
const fmtDt = (iso: string) => {
  const d = new Date(iso)
  const z = (n: number) => String(n).padStart(2, '0')
  return `${z(d.getMonth() + 1)}-${z(d.getDate())} ${z(d.getHours())}:${z(d.getMinutes())}`
}

type Form = { name: string; category: string; spec: string; unit: string; stock: string; min_qty: string; unit_price: string; location: string; memo: string }
const EMPTY: Form = { name: '', category: CATS[0], spec: '', unit: '개', stock: '0', min_qty: '0', unit_price: '0', location: '', memo: '' }
const toForm = (s: Supply): Form => ({
  name: s.name,
  category: s.category ?? CATS[0],
  spec: s.spec ?? '',
  unit: s.unit || '개',
  stock: String(s.stock),
  min_qty: String(s.min_qty),
  unit_price: String(s.unit_price),
  location: s.location ?? '',
  memo: s.memo ?? '',
})

/** 품목 등록·수정 인라인 폼 */
function SupplyForm({
  title,
  initial,
  isNew,
  onSave,
  onCancel,
  onDelete,
}: {
  title: string
  initial: Form
  isNew?: boolean
  onSave: (f: Form) => Promise<string | null>
  onCancel: () => void
  onDelete?: () => Promise<string | null>
}) {
  const [f, setF] = useState<Form>(initial)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [conf, setConf] = useState(false)
  const set = (k: keyof Form, v: string) => setF((o) => ({ ...o, [k]: v }))
  async function save() {
    if (!f.name.trim()) return setErr('품목명을 입력하세요.')
    setBusy(true)
    setErr(null)
    const e = await onSave(f)
    setBusy(false)
    if (e) setErr(e)
  }
  async function del() {
    if (!onDelete) return
    if (!conf) return setConf(true)
    setBusy(true)
    const e = await onDelete()
    setBusy(false)
    if (e) setErr(e)
  }
  const fld = (label: string, k: keyof Form, o?: { ph?: string; span?: number; numeric?: boolean }) => (
    <label className="pf-f" style={o?.span ? { gridColumn: `span ${o.span}` } : undefined}>
      <span>{label}</span>
      <input
        className="hr-in"
        value={o?.numeric && f[k] !== '' ? Number(f[k] || 0).toLocaleString('ko-KR') : f[k]}
        inputMode={o?.numeric ? 'numeric' : undefined}
        placeholder={o?.ph}
        onChange={(e) => set(k, o?.numeric ? String(num(e.target.value)) : e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') save()
          if (e.key === 'Escape') onCancel()
        }}
      />
    </label>
  )
  return (
    <div className="pf">
      <div className="pf-h">{title}</div>
      <div className="pf-grid">
        {fld('품목명 *', 'name', { ph: '예: 메틸셀룰로오스(MC)', span: 2 })}
        <label className="pf-f">
          <span>분류</span>
          <select className="hr-in" value={f.category} onChange={(e) => set('category', e.target.value)}>
            {[...new Set([...CATS, f.category])].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        {fld('규격', 'spec', { ph: '예: 500g' })}
        {isNew && fld('현재고', 'stock', { numeric: true })}
        {fld('단위', 'unit', { ph: '개·병·통·장' })}
        {fld('적정(최소) 재고', 'min_qty', { numeric: true })}
        {fld('단가(원)', 'unit_price', { numeric: true })}
        {isNew ? fld('보관 위치', 'location', { ph: '예: 약품장 2단', span: 2 }) : fld('보관 위치', 'location', { ph: '예: 약품장 2단' })}
        {isNew ? fld('메모', 'memo', { span: 2 }) : fld('메모', 'memo', { span: 4 })}
      </div>
      {err && <div className="login-alert err" style={{ margin: '8px 0 0' }}>{err}</div>}
      <div className="pf-act">
        {onDelete && (
          <button className={`btn txt pf-del${conf ? ' on' : ''}`} onClick={del} disabled={busy} onBlur={() => setConf(false)}>
            {conf ? '정말 삭제' : '삭제'}
          </button>
        )}
        <span style={{ flex: 1 }} />
        <button className="sp-btn b2" onClick={onCancel} disabled={busy}>취소</button>
        <button className="sp-btn b1" onClick={save} disabled={busy || !f.name.trim()}>{busy ? '저장 중…' : '저장'}</button>
      </div>
    </div>
  )
}

/** 입고·출고 처리 + 이력 (행을 펼쳤을 때) */
function MovePanel({ s, onChanged }: { s: Supply; onChanged: () => void }) {
  const { me } = useAuth()
  const [qty, setQty] = useState('')
  const [memo, setMemo] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const movesQ = useQuery<Move[]>(
    async () => await supabase.from('art_supply_moves').select('*').eq('supply_id', s.id).order('created_at', { ascending: false }).limit(10),
    [s.id, s.stock, s.incoming],
  )
  const q = num(qty)

  async function apply(kind: '입고' | '출고') {
    if (q <= 0) return setErr('수량을 입력하세요.')
    if (kind === '출고' && q > s.stock) return setErr(`재고(${s.stock}${s.unit})보다 많이 출고할 수 없습니다.`)
    setBusy(true)
    setErr(null)
    const stock = kind === '입고' ? s.stock + q : s.stock - q
    const incoming = kind === '입고' ? Math.max(0, s.incoming - q) : s.incoming // 입고하면 입고예정에서 차감
    const { data, error } = await supabase
      .from('art_supplies')
      .update({ stock, incoming, updated_at: new Date().toISOString() })
      .eq('id', s.id)
      .select('id')
    if (error || !data || data.length === 0) {
      setBusy(false)
      return setErr(error?.message ?? '저장되지 않았습니다 (권한 확인)')
    }
    const { error: mErr } = await supabase
      .from('art_supply_moves')
      .insert({ supply_id: s.id, kind, qty: q, balance: stock, memo: nn(memo), by_id: me?.id ?? null })
    setBusy(false)
    if (mErr) return setErr('재고는 반영됐지만 이력 저장 실패: ' + mErr.message)
    setQty('')
    setMemo('')
    onChanged()
  }

  return (
    <div className="sp-mv">
      <div className="sp-mv-row">
        <b className="sp-mv-t">입·출고</b>
        <input className="hr-in" style={{ width: 80 }} inputMode="numeric" placeholder="수량" value={qty} onChange={(e) => setQty(String(num(e.target.value) || ''))} />
        <span className="t-sub">{s.unit}</span>
        <input className="hr-in" style={{ flex: 1, minWidth: 140 }} placeholder="메모 (예: 한양도성 사업 사용 / 구매 입고)" value={memo} onChange={(e) => setMemo(e.target.value)} />
        <button className="sp-btn b1" onClick={() => apply('입고')} disabled={busy}>입고</button>
        <button className="sp-btn b2" onClick={() => apply('출고')} disabled={busy}>출고</button>
      </div>
      {s.incoming > 0 && <div className="t-sub" style={{ fontSize: 11 }}>입고예정 {s.incoming}{s.unit} — 물품이 도착하면 수량을 넣고 <b>입고</b>를 누르세요.</div>}
      {err && <div className="login-alert err" style={{ margin: '6px 0 0' }}>{err}</div>}
      <div className="sp-hist">
        {(movesQ.data ?? []).length === 0 && <div className="t-sub" style={{ fontSize: 11 }}>입출고 이력이 없습니다.</div>}
        {(movesQ.data ?? []).map((m) => (
          <div className="sp-h" key={m.id}>
            <span className="dt">{fmtDt(m.created_at)}</span>
            <span className={`k k-${m.kind}`}>{m.kind}</span>
            <span className="tnum">{m.kind === '출고' ? '-' : '+'}{m.qty}{s.unit}</span>
            {m.balance !== null && <span className="t-sub tnum">재고 {m.balance}</span>}
            {m.memo && <span className="t-sub">{m.memo}</span>}
          </div>
        ))}
      </div>
    </div>
  )
}

type OrderLine = { id: string; name: string; unit: string; qty: number; price: number }

/** 품의서 작성 (전자결재로 상신) */
function OrderPanel({
  items,
  onClose,
  onSubmitted,
}: {
  items: Supply[]
  onClose: () => void
  onSubmitted: (msg: string) => void
}) {
  const { me } = useAuth()
  const [lines, setLines] = useState<OrderLine[]>(() =>
    items.map((s) => ({ id: s.id, name: s.name, unit: s.unit, qty: Math.max(1, s.min_qty - s.stock - s.incoming), price: s.unit_price })),
  )
  const [title, setTitle] = useState('보존처리 재료 구입 품의')
  const [reason, setReason] = useState('재고 부족 품목 구입')
  const [reviewerId, setReviewerId] = useState('')
  const [approverId, setApproverId] = useState('')
  const [admins, setAdmins] = useState<Pick<Employee, 'id' | 'name' | 'title'>[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    supabase
      .from('employees')
      .select('id,name,title')
      .eq('role', 'admin')
      .eq('status', '재직')
      .then(({ data }) => setAdmins((data ?? []).filter((e) => e.id !== me?.id)))
  }, [me?.id])

  const active = lines.filter((l) => l.qty > 0)
  const total = active.reduce((a, l) => a + l.qty * l.price, 0)
  const setLine = (i: number, k: 'qty' | 'price', v: string) =>
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, [k]: num(v) } : l)))

  async function submit() {
    if (!active.length) return setErr('구입 수량이 1 이상인 품목이 없습니다.')
    if (!title.trim()) return setErr('제목을 입력하세요.')
    setBusy(true)
    setErr(null)
    const docNo = `제${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000)}호`
    const body =
      (reason.trim() ? reason.trim() + '\n\n' : '') +
      active.map((l, i) => `${i + 1}. ${l.name} · ${l.qty}${l.unit} × ${won(l.price)}원 = ${won(l.qty * l.price)}원`).join('\n') +
      `\n\n합계 ${won(total)}원`
    const { data: appr, error } = await supabase
      .from('approvals')
      .insert({
        doc_no: docNo,
        kind: '품의',
        drafter_id: me?.id ?? null,
        biz_code: '법인',
        dept_key: 'art',
        title: title.trim(),
        amount: total,
        memo: body,
        req_date: new Date().toISOString().slice(0, 10),
        status: '진행',
      })
      .select('id')
      .single()
    if (error || !appr) {
      setBusy(false)
      return setErr(error?.message ?? '상신 실패')
    }
    const lns: { approval_id: string; seq: number; approver_id: string | null; role: '기안' | '검토' | '승인'; decided: string }[] = [
      { approval_id: appr.id, seq: 1, approver_id: me?.id ?? null, role: '기안', decided: '승인' },
    ]
    if (reviewerId) lns.push({ approval_id: appr.id, seq: lns.length + 1, approver_id: reviewerId, role: '검토', decided: '대기' })
    lns.push({ approval_id: appr.id, seq: lns.length + 1, approver_id: approverId || null, role: '승인', decided: '대기' })
    const { error: lErr } = await supabase.from('approval_lines').insert(lns)
    if (lErr) {
      setBusy(false)
      return setErr('결재선 저장 실패: ' + lErr.message)
    }
    // 상신 즉시: 입고예정 누적 + 단가 갱신 + 발주 이력
    for (const l of active) {
      const s = items.find((x) => x.id === l.id)!
      await supabase
        .from('art_supplies')
        .update({ incoming: s.incoming + l.qty, unit_price: l.price, updated_at: new Date().toISOString() })
        .eq('id', l.id)
      await supabase.from('art_supply_moves').insert({
        supply_id: l.id,
        kind: '발주',
        qty: l.qty,
        balance: s.stock,
        memo: `품의 ${docNo}`,
        approval_id: appr.id,
        by_id: me?.id ?? null,
      })
    }
    setBusy(false)
    onSubmitted(`✓ ${docNo} · 품의서를 상신했습니다 (${active.length}품목 · ${won(total)}원). 결재 진행은 전자결재에서 확인하세요. 물품이 도착하면 해당 품목에서 [입고]를 눌러 재고에 반영합니다.`)
  }

  return (
    <div className="pf">
      <div className="pf-h">품의서 작성 · 전자결재 상신</div>
      <div className="pf-grid" style={{ gridTemplateColumns: 'repeat(4,minmax(0,1fr))' }}>
        <label className="pf-f" style={{ gridColumn: 'span 4' }}>
          <span>제목</span>
          <input className="hr-in" value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="pf-f" style={{ gridColumn: 'span 4' }}>
          <span>사유</span>
          <input className="hr-in" value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
      </div>
      <table className="rowtbl sp-ord">
        <colgroup>
          <col />
          <col style={{ width: 130 }} />
          <col style={{ width: 130 }} />
          <col style={{ width: 120 }} />
        </colgroup>
        <thead>
          <tr>
            <th style={{ textAlign: 'left' }}>품목</th>
            <th>수량</th>
            <th>단가(원)</th>
            <th>금액</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={l.id}>
              <td><b>{l.name}</b></td>
              <td>
                <div className="sp-in">
                  <input className="hr-in tnum" value={l.qty || ''} inputMode="numeric" onChange={(e) => setLine(i, 'qty', e.target.value)} />
                  <span className="t-sub">{l.unit}</span>
                </div>
              </td>
              <td>
                <div className="sp-in">
                  <input className="hr-in tnum" value={l.price ? won(l.price) : ''} inputMode="numeric" onChange={(e) => setLine(i, 'price', e.target.value)} />
                </div>
              </td>
              <td className="tnum" style={{ fontWeight: 700 }}>{won(l.qty * l.price)}</td>
            </tr>
          ))}
          <tr className="sp-sum">
            <td colSpan={3}>합계</td>
            <td className="tnum">{won(total)}원</td>
          </tr>
        </tbody>
      </table>
      <div className="pf-grid" style={{ gridTemplateColumns: 'repeat(2,minmax(0,1fr))', marginTop: 12 }}>
        <label className="pf-f">
          <span>검토자 (생략 가능)</span>
          <select className="hr-in" value={reviewerId} onChange={(e) => setReviewerId(e.target.value)}>
            <option value="">선택 안 함</option>
            {admins.map((e) => (<option key={e.id} value={e.id}>{e.name} {e.title}</option>))}
          </select>
        </label>
        <label className="pf-f">
          <span>승인자</span>
          <select className="hr-in" value={approverId} onChange={(e) => setApproverId(e.target.value)}>
            <option value="">선택 (실장)</option>
            {admins.map((e) => (<option key={e.id} value={e.id}>{e.name} {e.title}</option>))}
          </select>
        </label>
      </div>
      {err && <div className="login-alert err" style={{ margin: '8px 0 0' }}>{err}</div>}
      <div className="pf-act">
        <span className="t-sub" style={{ fontSize: 11 }}>기안 {me?.name ?? '—'} › 검토 › 승인</span>
        <span style={{ flex: 1 }} />
        <button className="sp-btn b2" onClick={onClose} disabled={busy}>취소</button>
        <button className="sp-btn b1" onClick={submit} disabled={busy}>{busy ? '상신 중…' : '품의 상신'}</button>
      </div>
    </div>
  )
}

export default function ArtSupplies() {
  const [q, setQ] = useState('')
  const [catF, setCatF] = useState('전체')
  const [lowOnly, setLowOnly] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [sel, setSel] = useState<Record<string, boolean>>({})
  const [orderOpen, setOrderOpen] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  const supQ = useQuery<Supply[]>(async () => await supabase.from('art_supplies').select('*').order('name', { ascending: true }), [])
  const all = supQ.data ?? []
  const lowCount = all.filter((s) => lack(s) > 0).length
  const incCount = all.filter((s) => s.incoming > 0).length
  const cats = ['전체', ...new Set(all.map((s) => s.category).filter((c): c is string => !!c))]
  const list = useMemo(
    () =>
      all.filter(
        (s) =>
          (catF === '전체' || s.category === catF) &&
          (!lowOnly || lack(s) > 0) &&
          (!q || s.name.includes(q) || (s.spec ?? '').includes(q) || (s.location ?? '').includes(q) || (s.category ?? '').includes(q)),
      ),
    [all, catF, lowOnly, q],
  )
  const picked = all.filter((s) => sel[s.id])
  const allChecked = list.length > 0 && list.every((s) => sel[s.id])

  const payload = (f: Form) => ({
    name: f.name.trim(),
    category: nn(f.category),
    spec: nn(f.spec),
    unit: nn(f.unit) ?? '개',
    min_qty: num(f.min_qty),
    unit_price: num(f.unit_price),
    location: nn(f.location),
    memo: nn(f.memo),
    updated_at: new Date().toISOString(),
  })
  async function create(f: Form): Promise<string | null> {
    const { error } = await supabase.from('art_supplies').insert({ ...payload(f), stock: num(f.stock) })
    if (error) return error.message + (/art_supplies/.test(error.message) ? ' (SQL 24 실행 필요)' : '')
    setAdding(false)
    supQ.reload()
    return null
  }
  async function update(id: string, f: Form): Promise<string | null> {
    const { data, error } = await supabase.from('art_supplies').update(payload(f)).eq('id', id).select('id')
    if (error) return error.message
    if (!data || data.length === 0) return '저장되지 않았습니다 (권한 확인)'
    setOpenId(null)
    supQ.reload()
    return null
  }
  async function remove(id: string): Promise<string | null> {
    const { data, error } = await supabase.from('art_supplies').delete().eq('id', id).select('id')
    if (error) return error.message
    if (!data || data.length === 0) return '삭제되지 않았습니다 (권한 확인)'
    setOpenId(null)
    setSel((o) => ({ ...o, [id]: false }))
    supQ.reload()
    return null
  }
  function selectLow() {
    const o: Record<string, boolean> = {}
    for (const s of all) if (lack(s) > 0) o[s.id] = true
    setSel(o)
  }

  return (
    <div className="page on">
      <PageHead
        eyebrow="미술 · 재고관리"
        title="재고관리"
        desc="보존처리에 쓰는 재료·소모품 재고를 관리하고, 필요한 물품은 품의서로 올립니다."
        actions={
          <button
            className="btn txt add-txt"
            onClick={() => {
              setAdding((v) => !v)
              setOpenId(null)
              setOrderOpen(false)
            }}
          >
            {adding ? '닫기' : '+ 품목 등록'}
          </button>
        }
      />
      <section className="panel">
        <ErrorBanner error={supQ.error} table="art_supplies" />
        {note && (
          <div className="login-alert ok" style={{ margin: '0 0 10px' }} onClick={() => setNote(null)}>
            {note}
          </div>
        )}
        <div className="toolbar">
          <h2 style={{ fontSize: 15, fontWeight: 800 }}>
            재고 목록
            {lowCount > 0 && (
              <button className={`chip set-hold sp-chipbtn${lowOnly ? ' on' : ''}`} style={{ marginLeft: 8, fontSize: 10 }} onClick={() => setLowOnly((v) => !v)} title="부족 품목만 보기">
                <i />
                부족 {lowCount}
              </button>
            )}
            {incCount > 0 && (
              <span className="chip c-prog" style={{ marginLeft: 6, fontSize: 10 }}>
                <i />
                입고예정 {incCount}
              </span>
            )}
          </h2>
          <div className="sp-tools">
            <select className="hr-in" style={{ width: 120 }} value={catF} onChange={(e) => setCatF(e.target.value)} aria-label="분류 필터">
              {cats.map((c) => (<option key={c} value={c}>{c === '전체' ? '분류 전체' : c}</option>))}
            </select>
            <label className="search">
              <svg className="icon" width="16" height="16" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" /></svg>
              <input placeholder="품목·규격·위치 검색" value={q} onChange={(e) => setQ(e.target.value)} />
            </label>
            {lowCount > 0 && (
              <button className="sp-btn b2" onClick={selectLow}>부족 품목 선택</button>
            )}
            <button
              className="sp-btn b1"
              disabled={picked.length === 0}
              onClick={() => {
                setOrderOpen(true)
                setAdding(false)
                setOpenId(null)
              }}
              title={picked.length === 0 ? '품목을 체크하면 품의를 올릴 수 있습니다' : ''}
            >
              품의 올리기{picked.length > 0 ? ` (${picked.length})` : ''}
            </button>
          </div>
        </div>

        {adding && <SupplyForm title="새 품목 등록" isNew initial={EMPTY} onSave={create} onCancel={() => setAdding(false)} />}
        {orderOpen && picked.length > 0 && (
          <OrderPanel
            key={picked.map((p) => p.id).join(',')}
            items={picked}
            onClose={() => setOrderOpen(false)}
            onSubmitted={(m) => {
              setOrderOpen(false)
              setSel({})
              setNote(m)
              supQ.reload()
            }}
          />
        )}

        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ width: 34, textAlign: 'center' }}>
                  <input type="checkbox" checked={allChecked} onChange={(e) => setSel(e.target.checked ? Object.fromEntries(list.map((s) => [s.id, true])) : {})} title="검색 결과 전체 선택" />
                </th>
                <th>품목</th>
                <th>분류</th>
                <th>규격</th>
                <th style={{ textAlign: 'right' }}>현재고</th>
                <th style={{ textAlign: 'right' }}>적정</th>
                <th style={{ textAlign: 'right' }}>단가</th>
                <th>위치</th>
                <th>상태</th>
              </tr>
            </thead>
            <tbody>
              {supQ.loading && <LoadingRow cols={9} />}
              {!supQ.loading &&
                list.map((s) => {
                  const l = lack(s)
                  const on = openId === s.id
                  return (
                    <SupplyRows key={s.id}>
                      <tr
                        className={on ? 'pf-row on' : 'pf-row'}
                        style={{ cursor: 'pointer', background: !on && l > 0 ? 'var(--danger-soft)' : undefined }}
                        onClick={() => {
                          setOpenId(on ? null : s.id)
                          setAdding(false)
                        }}
                      >
                        <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                          <input type="checkbox" checked={!!sel[s.id]} onChange={(e) => setSel((o) => ({ ...o, [s.id]: e.target.checked }))} />
                        </td>
                        <td><b>{s.name}</b></td>
                        <td className="t-sub">{s.category || '—'}</td>
                        <td className="t-sub">{s.spec || '—'}</td>
                        <td className="tnum" style={{ textAlign: 'right', fontWeight: 700, color: l > 0 ? 'var(--danger)' : 'var(--ink)' }}>
                          {s.stock}<span className="t-sub" style={{ fontWeight: 400 }}> {s.unit}</span>
                        </td>
                        <td className="tnum" style={{ textAlign: 'right', color: 'var(--muted)' }}>{s.min_qty}</td>
                        <td className="tnum" style={{ textAlign: 'right' }}>{s.unit_price ? won(s.unit_price) : '—'}</td>
                        <td className="t-sub">{s.location || '—'}</td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          {l > 0 ? (
                            <span className="chip set-hold"><i />부족 {l}</span>
                          ) : (
                            <span className="chip c-done"><i />충분</span>
                          )}
                          {s.incoming > 0 && (
                            <span className="chip c-prog" style={{ marginLeft: 4 }}><i />입고예정 {s.incoming}</span>
                          )}
                        </td>
                      </tr>
                      {on && (
                        <tr className="pf-edit">
                          <td colSpan={9}>
                            <MovePanel s={s} onChanged={() => supQ.reload()} />
                            <SupplyForm title="품목 정보 수정" initial={toForm(s)} onSave={(f) => update(s.id, f)} onCancel={() => setOpenId(null)} onDelete={() => remove(s.id)} />
                          </td>
                        </tr>
                      )}
                    </SupplyRows>
                  )
                })}
              {!supQ.loading && list.length === 0 && <EmptyRow cols={9} text={all.length === 0 ? '등록된 품목이 없습니다. 오른쪽 위 + 품목 등록으로 시작하세요.' : '조건에 맞는 품목이 없습니다.'} />}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

// key 를 가진 행 묶음용 (Fragment)
function SupplyRows({ children }: { children: ReactNode }) {
  return <Fragment>{children}</Fragment>
}
