import { useEffect, useState } from 'react'
import { CcPicker, ccLines } from '../../../components/CcPicker'
import { AttachPicker, uploadAttachments } from '../../../components/AttachPicker'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../lib/auth'
import { won, approverLabel, sortApprovers } from '../../../lib/format'
import type { Inventory as Inv, Employee } from '../../../types/db'

/** 부족수량(>0 이면 부족) — 안전재고 기준 */
export function lowQty(it: Inv & { avail?: number }): number {
  return it.min_qty - (it.avail ?? it.stock)
}
/** 선택 품목 기본 발주수량: 부족분(부족이면), 충분이면 1 */
export function defaultQty(it: Inv & { avail?: number }): number {
  const l = lowQty(it)
  return l > 0 ? l : 1
}

// ===================== 발주 지출결의서 모달 =====================
type DraftLine = { id: string; code: string | null; category: string | null; name: string; qty: number; price: number; lastPrice: number }

export function OrderExpenseModal({
  items,
  initialQty,
  onClose,
  onSubmitted,
}: {
  items: (Inv & { avail?: number })[]
  initialQty?: Record<string, number>
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
      qty: initialQty?.[it.id] ?? defaultQty(it),
      price: it.unit_price,
      lastPrice: it.unit_price,
    })),
  )
  const [memo, setMemo] = useState('재고 부족 품목 구입 품의')
  const [reason, setReason] = useState('재고 부족 품목 구입 (최소재고 기준 보충)')
  const [reviewerId, setReviewerId] = useState('')
  const [ccIds, setCcIds] = useState<string[]>([])
  const [files, setFiles] = useState<File[]>([])
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
        kind: '품의',
        drafter_id: me?.id ?? null,
        biz_code: '법인',
        dept_key: 'product',
        title: memo.trim() || '재고 발주 품의',
        amount: sumAmt,
        // 본문: 사유 + 품목별 내역(+구매링크). 계정과목은 회계 접수 때 품목별로 지정
        memo:
          (reason.trim() ? reason.trim() + '\n\n' : '') +
          active
            .map((d, i) => {
              const link = (items.find((x) => x.id === d.id)?.memo ?? '').match(/https?:\/\/[^\s<>"']+/)?.[0]
              return `${i + 1}. ${d.name} · ${d.qty}개 × ${won(d.price)}원 = ${won(d.qty * d.price)}원` + (link ? `\n   구매링크: ${link}` : '')
            })
            .join('\n') +
          `\n\n합계 ${won(sumAmt)}원`,
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
    if (files.length) {
      const bad = await uploadAttachments(appr.id, files, me?.id ?? null)
      if (bad.length) alert(`첨부 실패: ${bad.join(', ')}\n문서는 상신되었습니다. 상신문서에서 다시 확인해 주세요.`)
    }

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
      `✓ ${docNo} · 재고 발주 품의서를 상신했습니다(₩${won(sumAmt)}). ` +
        `결재 승인은 전자결재함에서, 회계처리는 회계관리에서 진행됩니다. 처리된 품목은 "입고예정"으로 바뀌며, "입고" 버튼으로 재고에 반영됩니다.` +
        (changedNames.length ? ` · 매입단가 갱신: ${changedNames.join(', ')}` : ''),
    )
  }

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640 }}>
        <div className="mh">
          <div>
            <div className="eyebrow">상품 · 재고 발주 품의</div>
            <h3>품의서 작성</h3>
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

          <div className="mfield">
            <label>제목</label>
            <input className="ctl" value={memo} onChange={(e) => setMemo(e.target.value)} />
          </div>
          <div className="mfield">
            <label>사유</label>
            <input className="ctl" value={reason} onChange={(e) => setReason(e.target.value)} />
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

          <CcPicker value={ccIds} onChange={setCcIds} className="mfield" />

          <AttachPicker files={files} onChange={setFiles} className="mfield" />
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
