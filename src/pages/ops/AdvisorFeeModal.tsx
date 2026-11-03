import { useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { won } from '../../lib/format'
import { useAuth } from '../../lib/auth'
import type { Advisor } from '../../types/db'

/** 자문비 차수 일괄 상신 — 참석 위원 선택 + 차수 + 위원별 자문비 → 전자결재(지출결의서) 상신 */
export function AdvisorFeeModal({
  projectId,
  projectName,
  advisors,
  onClose,
  onSubmitted,
}: {
  projectId: string
  projectName: string
  advisors: Advisor[]
  onClose: () => void
  onSubmitted: () => void
}) {
  const { me } = useAuth()
  const [round, setRound] = useState(3)
  // 기본 전원 선택
  const [sel, setSel] = useState<Set<string>>(new Set(advisors.map((a) => a.id)))
  // 위원별 자문비 (기본 default_fee)
  const [fees, setFees] = useState<Record<string, number>>(
    Object.fromEntries(advisors.map((a) => [a.id, Number(a.default_fee) || 300000])),
  )
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const shortName = projectName.split(' ')[0] // 약칭
  const docTitle = `${shortName} ${round}차 자문회의 자문비`

  const total = useMemo(
    () => advisors.filter((a) => sel.has(a.id)).reduce((s, a) => s + (fees[a.id] || 0), 0),
    [advisors, sel, fees],
  )
  const selCount = sel.size

  function toggleAll(v: boolean) {
    setSel(v ? new Set(advisors.map((a) => a.id)) : new Set())
  }
  function toggleOne(id: string, v: boolean) {
    setSel((s) => {
      const n = new Set(s)
      if (v) n.add(id)
      else n.delete(id)
      return n
    })
  }

  async function submit() {
    if (selCount === 0) {
      setErr('참석 위원을 1명 이상 선택하세요.')
      return
    }
    setBusy(true)
    setErr(null)
    // 전자결재(지출결의서) 상신 — 기안→승인(실장)→회계접수. 전표는 회계접수 승인 시 자동 생성.
    const docNo = `제${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000)}호`
    const { data: appr, error } = await supabase
      .from('approvals')
      .insert({
        doc_no: docNo,
        kind: '지출결의서',
        drafter_id: me?.id ?? null,
        biz_code: '법인',
        dept_key: 'art',
        title: docTitle,
        amount: total,
        account: '자문료',
        memo: `${docTitle} · 자문위원 ${selCount}인`,
        project_id: projectId,
        budget_item: '자문회비',
        req_date: new Date().toISOString().slice(0, 10),
        status: '진행',
      })
      .select('id')
      .single()
    if (error || !appr) {
      setBusy(false)
      setErr(error?.message ?? '상신 실패')
      return
    }
    // 결재선: 기안(본인 승인됨) → 승인(실장) → 회계접수
    const lines: {
      approval_id: string
      seq: number
      approver_id: string | null
      role: '기안' | '승인' | '회계접수'
      decided: '대기' | '승인' | '반려'
    }[] = [
      { approval_id: appr.id, seq: 1, approver_id: me?.id ?? null, role: '기안', decided: '승인' },
      { approval_id: appr.id, seq: 2, approver_id: null, role: '승인', decided: '대기' },
      { approval_id: appr.id, seq: 3, approver_id: null, role: '회계접수', decided: '대기' },
    ]
    const { error: lineErr } = await supabase.from('approval_lines').insert(lines)
    setBusy(false)
    if (lineErr) {
      setErr(lineErr.message)
      return
    }
    onSubmitted()
  }

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="mh">
          <div>
            <div className="eyebrow">자문비 지출결의</div>
            <h3>{docTitle}</h3>
          </div>
          <button className="x" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="mb">
          {/* 적요 + 차수 */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
            <div className="mfield" style={{ flex: 1 }}>
              <label>적요</label>
              <input className="ctl" value={docTitle} readOnly />
            </div>
            <div className="mfield" style={{ width: 90 }}>
              <label>차수</label>
              <input
                className="ctl"
                type="number"
                min={1}
                value={round}
                onChange={(e) => setRound(parseInt(e.target.value, 10) || 1)}
              />
            </div>
          </div>

          {/* 참석 위원 + 자문비 */}
          <div>
            <table className="budtx">
              <thead>
                <tr>
                  <th style={{ width: 28 }}>
                    <input
                      type="checkbox"
                      checked={selCount === advisors.length && advisors.length > 0}
                      onChange={(e) => toggleAll(e.target.checked)}
                    />
                  </th>
                  <th>이름</th>
                  <th>소속</th>
                  <th>자문비</th>
                </tr>
              </thead>
              <tbody>
                {advisors.map((a) => {
                  const on = sel.has(a.id)
                  return (
                    <tr key={a.id}>
                      <td>
                        <input type="checkbox" checked={on} onChange={(e) => toggleOne(a.id, e.target.checked)} />
                      </td>
                      <td>
                        <b>{a.name}</b>
                      </td>
                      <td className="t-sub">{a.org}</td>
                      <td>
                        {on ? (
                          <input
                            className="advfee-in"
                            type="text"
                            value={won(fees[a.id] || 0)}
                            onChange={(e) =>
                              setFees((f) => ({
                                ...f,
                                [a.id]: parseInt(e.target.value.replace(/[^0-9]/g, ''), 10) || 0,
                              }))
                            }
                            style={{
                              width: 90,
                              textAlign: 'right',
                              border: '1px solid var(--line)',
                              borderRadius: 6,
                              padding: '3px 6px',
                              fontSize: 11.5,
                              background: 'var(--surface)',
                              fontFamily: 'inherit',
                              color: 'var(--ink)',
                            }}
                          />
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* 합계 */}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
            <span style={{ color: 'var(--muted)' }}>대상 {selCount}명</span>
            <span>
              지급 총액 <b style={{ color: 'var(--brand)' }}>{won(total)}원</b>
            </span>
          </div>

          {/* 결재선 */}
          <div className="mfield">
            <label>결재선</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 11.5 }}>
              <span className="badge">기안 {me?.name ?? '—'}</span>
              <span style={{ color: 'var(--muted)' }}>›</span>
              <span className="badge">승인 실장</span>
              <span style={{ color: 'var(--muted)' }}>›</span>
              <span className="badge green">회계접수 담당</span>
            </div>
          </div>

          {err && <div className="login-alert err" style={{ margin: 0 }}>{err}</div>}
        </div>
        <div className="mf">
          <button className="btn sec" onClick={onClose} disabled={busy}>
            취소
          </button>
          <button className="btn pri" onClick={submit} disabled={busy}>
            {busy ? '상신 중…' : '지출결의서 상신'}
          </button>
        </div>
      </div>
    </div>
  )
}
