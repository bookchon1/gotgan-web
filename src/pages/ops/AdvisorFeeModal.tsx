import { useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { won } from '../../lib/format'
import { useAuth } from '../../lib/auth'
import type { Advisor } from '../../types/db'

/** 자문비 차수 일괄 상신 — 참석 위원 선택 + 차수 + 위원별 자문비 → 지출결의서(전표) 생성 */
export function AdvisorFeeModal({
  projectName,
  advisors,
  onClose,
  onSubmitted,
}: {
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
    // 지출 전표 생성 (자문회비) — 법인·미술
    const { error } = await supabase.from('acct_tx').insert({
      date: new Date().toISOString().slice(0, 10),
      biz_code: '법인',
      dept_key: 'art',
      tx_type: '지출',
      account: '자문료',
      amount: total,
      partner: `자문위원 ${selCount}인`,
      memo: docTitle,
      budget_item: '자문회비',
      src: '결의서',
      year: new Date().getFullYear(),
    })
    setBusy(false)
    if (error) {
      setErr(error.message)
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
