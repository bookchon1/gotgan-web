import { useEffect, useMemo, useState } from 'react'
import { CcPicker, ccLines } from '../../components/CcPicker'
import { PageHead } from '../../components/PageHead'
import { ErrorBanner, LoadingRow, EmptyRow } from '../../components/States'
import { supabase } from '../../lib/supabase'
import { useQuery } from '../../lib/useQuery'
import { useAuth } from '../../lib/auth'
import { won, invShort, approverLabel, sortApprovers } from '../../lib/format'
import type { Inventory as Inv, Employee } from '../../types/db'
import { PurchaseHistModal } from './PurchaseHistModal'

/** 부족수량(>0 이면 부족) */
function lowQty(it: Inv): number {
  return it.min_qty - it.stock
}
/** 선택 품목 기본 발주수량: 부족분(부족이면), 충분이면 1 */
function defaultQty(it: Inv): number {
  const l = lowQty(it)
  return l > 0 ? l : 1
}

/** 상품 재고현황 — 목록(부족 표시) + 체크박스 발주·지출결의서 + 매입이력 + 입고 */
export default function Inventory() {
  const [q, setQ] = useState('')
  const [histOf, setHistOf] = useState<Inv | null>(null)
  const [busy, setBusy] = useState(false)
  const [sel, setSel] = useState<Record<string, boolean>>({})
  const [orderOpen, setOrderOpen] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [addForm, setAddForm] = useState({ code: '', name: '', category: '완제품' as '완제품' | '부자재', stock: 0, min_qty: 0, unit_price: 0, location: '' })

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

  // 선택된 품목 (재고 충분 품목도 함께 발주 가능)
  const selectedItems = useMemo(() => items.filter((it) => sel[it.id]), [items, sel])
  const selTotal = selectedItems.reduce((s, it) => s + defaultQty(it) * it.unit_price, 0)

  // 현재 검색 결과가 모두 선택되었는지 (전체 선택 체크박스 상태)
  const allChecked = list.length > 0 && list.every((it) => sel[it.id])

  function toggle(id: string, on: boolean) {
    setSel((prev) => ({ ...prev, [id]: on }))
  }
  function toggleAll(on: boolean) {
    setSel((prev) => {
      const next = { ...prev }
      for (const it of list) next[it.id] = on
      return next
    })
  }

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

  async function addItem() {
    if (!addForm.name.trim()) return
    setBusy(true)
    const { error } = await supabase.from('inventory').insert({
      code: addForm.code.trim() || null,
      name: addForm.name.trim(),
      category: addForm.category,
      stock: addForm.stock,
      min_qty: addForm.min_qty,
      unit_price: addForm.unit_price,
      incoming: 0,
      location: addForm.location.trim() || null,
    })
    setBusy(false)
    if (error) {
      alert('품목 등록 실패: ' + error.message)
      return
    }
    setAddOpen(false)
    setAddForm({ code: '', name: '', category: '완제품', stock: 0, min_qty: 0, unit_price: 0, location: '' })
    invQ.reload()
  }

  async function removeItem(it: Inv) {
    if (!window.confirm(`품목 "${it.name}" 을(를) 삭제할까요?\n매입이력 등 연결 데이터가 함께 삭제될 수 있으며 되돌릴 수 없습니다.`)) return
    setBusy(true)
    const { error } = await supabase.from('inventory').delete().eq('id', it.id)
    setBusy(false)
    if (error) {
      alert('삭제 실패: ' + error.message)
      return
    }
    invQ.reload()
  }

  return (
    <div className="page on">
      <PageHead
        eyebrow="상품 · 재고"
        title="재고현황"
        desc="완제품·부자재 재고를 확인하고, 부족 품목을 선택해 발주·지출결의서를 상신하세요."
        actions={
          <button className="btn txt add-txt" onClick={() => setAddOpen(true)}>
            + 품목 등록
          </button>
        }
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
                <th style={{ width: 34, textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    checked={allChecked}
                    onChange={(e) => toggleAll(e.target.checked)}
                    title="검색 결과 전체 선택"
                  />
                </th>
                <th>코드</th>
                <th>품목</th>
                <th>구분</th>
                <th style={{ textAlign: 'right' }}>재고</th>
                <th style={{ textAlign: 'right' }}>적정</th>
                <th style={{ textAlign: 'right' }}>부족</th>
                <th style={{ textAlign: 'right' }}>단가</th>
                <th>상태</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {invQ.loading && <LoadingRow cols={10} />}
              {!invQ.loading &&
                list.map((it) => {
                  const lack = lowQty(it)
                  const low = lack > 0
                  return (
                    <tr key={it.id} style={low ? { background: 'var(--danger-soft)' } : undefined}>
                      <td style={{ textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={!!sel[it.id]}
                          onChange={(e) => toggle(it.id, e.target.checked)}
                        />
                      </td>
                      <td className="tnum" style={{ color: 'var(--muted)' }}>
                        {it.code}
                      </td>
                      <td>
                        <button
                          className="btn txt"
                          style={{ padding: 0, textAlign: 'left', display: 'block' }}
                          onClick={() => setHistOf(it)}
                          title="매입이력 보기"
                        >
                          <div className="t-title">{it.name}</div>
                          {it.location && <div className="t-sub">{it.location}</div>}
                        </button>
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
                      <td className="tnum" style={{ textAlign: 'right', fontWeight: 700 }}>
                        {low ? `-${lack}` : '—'}
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
                            부족 {lack}
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
                        <button
                          className="btn txt"
                          style={{ padding: '4px 7px', fontSize: 11, marginLeft: 4, color: 'var(--danger)' }}
                          onClick={() => removeItem(it)}
                          disabled={busy}
                        >
                          삭제
                        </button>
                      </td>
                    </tr>
                  )
                })}
              {!invQ.loading && list.length === 0 && !invQ.error && (
                <EmptyRow cols={10} text="재고 품목이 없습니다." />
              )}
            </tbody>
          </table>
        </div>

        {note && (
          <div className="login-alert warn" style={{ margin: '12px 0 0' }}>
            {note}
          </div>
        )}

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
            marginTop: 14,
            flexWrap: 'wrap',
          }}
        >
          <div className="sec-mini" style={{ margin: 0 }}>
            {selectedItems.length > 0 ? (
              <>
                선택 <b>{selectedItems.length}품목</b> · 발주 예상액{' '}
                <b style={{ color: 'var(--brand)' }}>₩{won(selTotal)}</b>{' '}
                <span style={{ color: 'var(--muted)' }}>(수량·단가는 작성 시 조정)</span>
              </>
            ) : (
              '품목을 선택하면 발주 예상액이 집계됩니다. (재고 충분 품목도 함께 구입 가능)'
            )}
          </div>
          <button
            className="btn pri"
            disabled={selectedItems.length === 0}
            style={{
              opacity: selectedItems.length === 0 ? 0.45 : 1,
              cursor: selectedItems.length === 0 ? 'not-allowed' : 'pointer',
            }}
            onClick={() => setOrderOpen(true)}
          >
            선택 품목 지출결의서 작성 →
          </button>
        </div>

        <div className="sec-mini" style={{ marginTop: 10 }}>
          재고가 적정 수량 미만이면 <b style={{ color: 'var(--danger)' }}>부족</b>으로 표시됩니다. 입고 예정 품목은 "입고" 버튼으로 재고에 반영하세요.
          {items.length > 0 && (
            <span style={{ color: 'var(--muted)' }}>
              {' '}· 총 재고 자산 {invShort(items.reduce((s, it) => s + it.stock * it.unit_price, 0))}원
            </span>
          )}
        </div>
      </section>

      {histOf && <PurchaseHistModal item={histOf} onClose={() => setHistOf(null)} />}
      {addOpen && (
        <div className="modal-bg" onClick={() => setAddOpen(false)}>
          <div className="modal" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <div className="mh">
              <div>
                <div className="eyebrow">재고 품목 등록</div>
                <h3>신규 품목</h3>
              </div>
              <button className="x" onClick={() => setAddOpen(false)}>✕</button>
            </div>
            <div className="mb">
              <div style={{ display: 'flex', gap: 10 }}>
                <div className="mfield" style={{ flex: 1 }}>
                  <label>품목명</label>
                  <input className="ctl" value={addForm.name} onChange={(e) => setAddForm({ ...addForm, name: e.target.value })} placeholder="예: 한지 (중목)" autoFocus />
                </div>
                <div className="mfield" style={{ width: 120 }}>
                  <label>구분</label>
                  <select className="ctl" value={addForm.category} onChange={(e) => setAddForm({ ...addForm, category: e.target.value as '완제품' | '부자재' })}>
                    <option value="완제품">완제품</option>
                    <option value="부자재">부자재</option>
                  </select>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <div className="mfield" style={{ flex: 1 }}>
                  <label>코드</label>
                  <input className="ctl" value={addForm.code} onChange={(e) => setAddForm({ ...addForm, code: e.target.value })} placeholder="예: A-001" />
                </div>
                <div className="mfield" style={{ flex: 1 }}>
                  <label>보관 위치</label>
                  <input className="ctl" value={addForm.location} onChange={(e) => setAddForm({ ...addForm, location: e.target.value })} placeholder="예: 창고 2층" />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <div className="mfield" style={{ flex: 1 }}>
                  <label>현재 재고</label>
                  <input className="ctl tnum" type="text" inputMode="numeric" value={addForm.stock || ''} onChange={(e) => setAddForm({ ...addForm, stock: Number(e.target.value.replace(/[^0-9]/g, '')) || 0 })} />
                </div>
                <div className="mfield" style={{ flex: 1 }}>
                  <label>적정 재고</label>
                  <input className="ctl tnum" type="text" inputMode="numeric" value={addForm.min_qty || ''} onChange={(e) => setAddForm({ ...addForm, min_qty: Number(e.target.value.replace(/[^0-9]/g, '')) || 0 })} />
                </div>
                <div className="mfield" style={{ flex: 1 }}>
                  <label>단가</label>
                  <input className="ctl tnum" type="text" inputMode="numeric" value={addForm.unit_price ? addForm.unit_price.toLocaleString('ko-KR') : ''} onChange={(e) => setAddForm({ ...addForm, unit_price: Number(e.target.value.replace(/[^0-9]/g, '')) || 0 })} />
                </div>
              </div>
            </div>
            <div className="mf">
              <button className="btn sec" onClick={() => setAddOpen(false)} disabled={busy}>취소</button>
              <button className="btn pri" onClick={addItem} disabled={busy || !addForm.name.trim()}>
                {busy ? '등록 중…' : '등록'}
              </button>
            </div>
          </div>
        </div>
      )}
      {orderOpen && (
        <OrderExpenseModal
          items={selectedItems}
          onClose={() => setOrderOpen(false)}
          onSubmitted={(msg) => {
            setOrderOpen(false)
            setSel({})
            setNote(msg)
            invQ.reload()
          }}
        />
      )}
    </div>
  )
}

// ===================== 발주 지출결의서 모달 =====================
type DraftLine = { id: string; code: string | null; category: string | null; name: string; qty: number; price: number; lastPrice: number }

function OrderExpenseModal({
  items,
  onClose,
  onSubmitted,
}: {
  items: Inv[]
  onClose: () => void
  onSubmitted: (msg: string) => void
}) {
  const { me } = useAuth()
  const [lines, setLines] = useState<DraftLine[]>(() =>
    items.map((it) => ({
      id: it.id,
      code: it.code,
      category: it.category,
      name: it.name,
      qty: defaultQty(it),
      price: it.unit_price,
      lastPrice: it.unit_price,
    })),
  )
  const [memo, setMemo] = useState('재고 부족 품목 발주 (최소재고 기준 보충)')
  const [account, setAccount] = useState('상품·재료 매입')
  const [reviewerId, setReviewerId] = useState('')
  const [ccIds, setCcIds] = useState<string[]>([])
  const [approverId, setApproverId] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const [admins, setAdmins] = useState<Pick<Employee, 'id' | 'name' | 'title'>[]>([])
  useEffect(() => {
    supabase
      .from('employees')
      .select('id,name,title')
      .eq('status', '재직')
      .then(({ data }) => setAdmins(sortApprovers((data ?? []).filter((e) => e.id !== me?.id))))
  }, [me?.id])

  const total = lines.reduce((s, d) => s + (d.qty || 0) * (d.price || 0), 0)

  function setLine(i: number, field: 'qty' | 'price', raw: string) {
    let n = parseInt(raw.replace(/[^0-9]/g, ''), 10)
    if (isNaN(n) || n < 0) n = 0
    setLines((prev) => prev.map((d, idx) => (idx === i ? { ...d, [field]: n } : d)))
  }

  async function submit() {
    if (!approverId) {
      setErr('승인할 사람을 선택하세요.')
      return
    }
    const active = lines.filter((d) => d.qty > 0)
    if (!active.length) {
      setErr('발주수량이 1 이상인 품목이 없습니다.')
      return
    }
    setBusy(true)
    setErr(null)
    const docNo = `제${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000)}호`
    const sumAmt = active.reduce((s, d) => s + d.qty * d.price, 0)

    // 1) 전자결재 지출결의서 등록
    const { data: appr, error } = await supabase
      .from('approvals')
      .insert({
        doc_no: docNo,
        kind: '지출결의서',
        drafter_id: me?.id ?? null,
        biz_code: '법인',
        dept_key: 'product',
        title: memo.trim() || '재고 발주',
        amount: sumAmt,
        account: account || null,
        memo: `재고 발주 ${active.length}품목`,
        req_date: new Date().toISOString().slice(0, 10),
        status: '진행',
      })
      .select('id')
      .single()
    if (error || !appr) {
      setBusy(false)
      setErr(error?.message ?? '생성 실패')
      return
    }

    // 2) 결재선: 기안(본인 승인) → 검토(선택) → 승인(선택) → 회계접수
    const lns: {
      approval_id: string
      seq: number
      approver_id: string | null
      role: '기안' | '검토' | '승인' | '회계접수' | '참조'
      decided: string
    }[] = [{ approval_id: appr.id, seq: 1, approver_id: me?.id ?? null, role: '기안', decided: '승인' }]
    if (reviewerId) lns.push({ approval_id: appr.id, seq: lns.length + 1, approver_id: reviewerId, role: '검토', decided: '대기' })
    if (approverId) lns.push({ approval_id: appr.id, seq: lns.length + 1, approver_id: approverId, role: '승인', decided: '대기' })
    lns.push({ approval_id: appr.id, seq: lns.length + 1, approver_id: null, role: '회계접수', decided: '대기' })
    lns.push(...ccLines(appr.id, lns.length + 1, ccIds))
    await supabase.from('approval_lines').insert(lns)

    // 3) 시안 동작: 상신 즉시 각 품목 incoming 누적 + 단가 갱신
    const changedNames: string[] = []
    for (const d of active) {
      if (d.price !== d.lastPrice) changedNames.push(`${d.name}(${won(d.lastPrice)}→${won(d.price)})`)
      const it = items.find((x) => x.id === d.id)
      await supabase
        .from('inventory')
        .update({
          incoming: (it?.incoming ?? 0) + d.qty,
          unit_price: d.price,
          updated_at: new Date().toISOString(),
        })
        .eq('id', d.id)
    }

    setBusy(false)
    onSubmitted(
      `✓ ${docNo} · 재고 발주 지출결의서를 상신했습니다(₩${won(sumAmt)}). ` +
        `결재 승인은 전자결재함에서, 회계처리는 회계관리에서 진행됩니다. 처리된 품목은 "입고예정"으로 바뀌며, "입고" 버튼으로 재고에 반영됩니다.` +
        (changedNames.length ? ` · 매입단가 갱신: ${changedNames.join(', ')}` : ''),
    )
  }

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640 }}>
        <div className="mh">
          <div>
            <div className="eyebrow">상품 · 재고 발주 지출결의</div>
            <h3>지출결의서 작성</h3>
          </div>
          <button className="x" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="mb">
          <div className="field-grid" style={{ gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
            <div className="field">
              <div className="fl">대상 품목</div>
              <div className="fv tnum">{lines.length}품목</div>
            </div>
            <div className="field">
              <div className="fl">발주 수량 합</div>
              <div className="fv tnum">{lines.reduce((s, d) => s + (d.qty || 0), 0)}개</div>
            </div>
            <div className="field">
              <div className="fl">발주 총액</div>
              <div className="fv tnum" style={{ color: 'var(--brand)', fontWeight: 800 }}>
                ₩{won(total)}
              </div>
            </div>
          </div>

          <div className="tbl-wrap" style={{ marginTop: 10 }}>
            <table style={{ fontSize: 12 }}>
              <thead>
                <tr>
                  <th>코드</th>
                  <th>분류</th>
                  <th>품목</th>
                  <th style={{ textAlign: 'right' }}>발주수량</th>
                  <th style={{ textAlign: 'right' }}>매입단가</th>
                  <th className="tnum" style={{ textAlign: 'right' }}>
                    금액
                  </th>
                </tr>
              </thead>
              <tbody>
                {lines.map((d, i) => {
                  const amt = (d.qty || 0) * (d.price || 0)
                  const changed = d.price !== d.lastPrice
                  return (
                    <tr key={d.id}>
                      <td className="t-sub" style={{ fontWeight: 700 }}>
                        {d.code}
                      </td>
                      <td>
                        <span className="badge">{d.category}</span>
                      </td>
                      <td>
                        <div>{d.name}</div>
                        {changed && (
                          <div
                            className="t-sub"
                            style={{ color: d.price > d.lastPrice ? 'var(--danger)' : 'var(--ok)' }}
                          >
                            최근 {won(d.lastPrice)} → {d.price > d.lastPrice ? '▲' : '▼'}
                            {won(Math.abs(d.price - d.lastPrice))}
                          </div>
                        )}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <input
                          className="ctl"
                          type="number"
                          min={1}
                          value={d.qty}
                          onChange={(e) => setLine(i, 'qty', e.target.value)}
                          style={{ width: 68, textAlign: 'right', padding: '5px 7px' }}
                        />
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <input
                          className="ctl"
                          type="number"
                          min={0}
                          step={100}
                          value={d.price}
                          onChange={(e) => setLine(i, 'price', e.target.value)}
                          style={{ width: 92, textAlign: 'right', padding: '5px 7px' }}
                        />
                      </td>
                      <td className="tnum" style={{ textAlign: 'right', fontWeight: 700 }}>
                        {won(amt)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="sec-mini" style={{ margin: '2px 0 0' }}>
            ※ 구입 시 가격이 바뀌면 <b>매입단가</b>를 수정하세요. 금액·총액이 다시 계산되고, 상신 시 해당 품목의 최근 단가로 갱신됩니다.
          </div>

          <div className="mfield">
            <label>적요</label>
            <input className="ctl" value={memo} onChange={(e) => setMemo(e.target.value)} />
          </div>
          <div className="mfield">
            <label>계정과목</label>
            <select className="ctl" value={account} onChange={(e) => setAccount(e.target.value)}>
              <option value="상품·재료 매입">상품·재료 매입</option>
              <option value="소모품비">소모품비</option>
              <option value="포장비">포장비</option>
            </select>
          </div>
          <div className="mfield">
            <label>결재선</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <select className="ctl" value={reviewerId} onChange={(e) => setReviewerId(e.target.value)} style={{ flex: 1 }}>
                <option value="">검토</option>
                {admins.map((e) => (
                  <option key={e.id} value={e.id}>
                    {approverLabel(e)}
                  </option>
                ))}
              </select>
              <select className="ctl" value={approverId} onChange={(e) => setApproverId(e.target.value)} style={{ flex: 1 }}>
                <option value="">승인</option>
                {admins.map((e) => (
                  <option key={e.id} value={e.id}>
                    {approverLabel(e)}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 11.5, marginTop: 8 }}>
              <span className="badge">기안 {me?.name ?? '—'}</span>
              {reviewerId && (
                <>
                  <span style={{ color: 'var(--muted)' }}>›</span>
                  <span className="badge">검토 {admins.find((a) => a.id === reviewerId)?.name ?? ''}</span>
                </>
              )}
              {approverId && (
                <>
                  <span style={{ color: 'var(--muted)' }}>›</span>
                  <span className="badge gold">승인 {admins.find((a) => a.id === approverId)?.name ?? ''}</span>
                </>
              )}
              <span style={{ color: 'var(--muted)' }}>›</span>
              <span className="badge green">회계접수 담당</span>
            </div>
          </div>

          <div className="sec-mini" style={{ margin: '4px 0 0' }}>
            <b>상신하면 자동으로:</b> ① 전자결재에 지출결의서 1건 등록 ② 승인 후 <b>회계 › 접수 대기</b>로 이동 ③ 상신 즉시 선택 품목이 <b>입고예정</b>으로 누적되고 매입단가가 갱신됩니다.
          </div>

          <CcPicker value={ccIds} onChange={setCcIds} className="mfield" />
          {err && (
            <div className="login-alert err" style={{ margin: '8px 0 0' }}>
              {err}
            </div>
          )}
        </div>
        <div className="mf">
          <button className="btn sec" onClick={onClose} disabled={busy}>
            닫기
          </button>
          <button className="btn pri" onClick={submit} disabled={busy}>
            {busy ? '상신 중…' : '상신'}
          </button>
        </div>
      </div>
    </div>
  )
}
