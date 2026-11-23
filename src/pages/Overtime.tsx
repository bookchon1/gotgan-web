import { useMemo, useState } from 'react'
import { PageHead } from '../components/PageHead'
import { ErrorBanner, LoadingRow, EmptyRow } from '../components/States'
import { supabase } from '../lib/supabase'
import { useQuery } from '../lib/useQuery'
import { useAuth } from '../lib/auth'
import { dateOnly } from '../lib/format'
import { notifyApprovalsChanged } from '../lib/pendingApprovals'
import { ApprovalDraftModal } from './ApprovalDraftModal'

interface CompRow {
  id: string
  employee_id: string
  kind: '적립' | '사용'
  work_date: string
  start_time: string | null
  end_time: string | null
  hours: number
  reason: string | null
  approver_id: string | null
  approval_id: string | null
  status: '신청' | '승인' | '반려'
  decided_at: string | null
  created_at: string
}
interface Emp {
  id: string
  name: string
  title: string | null
  employment_type: string | null
  status: string | null
}

/** 12시간 → "12시간 (1일 4시간)" (8시간 = 1일) */
function fmtH(h: number): string {
  const v = Math.round(h * 100) / 100
  const d = Math.floor(Math.abs(v) / 8)
  const r = Math.round((Math.abs(v) - d * 8) * 100) / 100
  const sign = v < 0 ? '-' : ''
  const sub = d > 0 ? ` (${sign}${d}일${r ? ` ${r}시간` : ''})` : ''
  return `${v}시간${sub}`
}
const hm = (t: string | null) => (t ? t.slice(0, 5) : '')
const chip = (s: string) => (s === '승인' ? 'c-done' : s === '반려' ? 'set-hold' : 'c-wait')

function balanceOf(rows: CompRow[], empId: string) {
  let earn = 0
  let used = 0
  let pend = 0
  for (const r of rows) {
    if (r.employee_id !== empId) continue
    const h = Number(r.hours) || 0
    if (r.kind === '적립' && r.status === '승인') earn += h
    if (r.kind === '사용' && r.status === '승인') used += h
    if (r.kind === '사용' && r.status === '신청') pend += h
  }
  return { earn, used, pend, remain: earn - used, available: earn - used - pend }
}

export default function Overtime() {
  const { me, isAdmin } = useAuth()
  // 신청은 전자결재 기안 작성에서 한다 (연장근무 양식 / 휴가신청 양식의 '대체휴무')
  const [modal, setModal] = useState<null | '적립' | '사용'>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const empQ = useQuery<Emp[]>(
    async () => await supabase.from('employees').select('id,name,title,employment_type,status'),
    [],
  )
  const rowQ = useQuery<CompRow[]>(
    async () => await supabase.from('comp_time').select('*').order('work_date', { ascending: false }),
    [],
  )
  const emps = empQ.data ?? []
  const rows = rowQ.data ?? []
  const empById = useMemo(() => Object.fromEntries(emps.map((e) => [e.id, e])), [emps])
  const myId = me?.id ?? ''
  const isRegular = empById[myId]?.employment_type === '정규직'
  const bal = balanceOf(rows, myId)
  const mine = rows.filter((r) => r.employee_id === myId)
  const regulars = useMemo(
    () => emps.filter((e) => e.employment_type === '정규직' && e.status === '재직').sort((a, b) => a.name.localeCompare(b.name, 'ko')),
    [emps],
  )

  // 취소 = 전자결재 회수 (연결된 신청은 DB가 자동 삭제). 결재와 연결되지 않은 옛 신청은 바로 삭제
  async function cancel(r: CompRow) {
    setBusyId(r.id)
    setMsg(null)
    if (r.approval_id) {
      const { data, error } = await supabase.from('approvals').update({ status: '회수' }).eq('id', r.approval_id).eq('status', '진행').select('id')
      if (error || !data || data.length === 0) {
        setBusyId(null)
        return setMsg(error?.message ?? '취소되지 않았습니다. 이미 결재가 시작됐거나 처리된 문서입니다.')
      }
      await supabase.from('approvals').delete().eq('id', r.approval_id).eq('status', '회수') // SQL 29 필요 — 실패해도 무시
    } else {
      const { error } = await supabase.from('comp_time').delete().eq('id', r.id).eq('status', '신청')
      if (error) {
        setBusyId(null)
        return setMsg(error.message)
      }
    }
    setBusyId(null)
    notifyApprovalsChanged()
    rowQ.reload()
  }

  const top = isRegular ? (
    <>
      <button className="btn txt add-txt" onClick={() => setModal('적립')}>
        + 연장근무 신청
      </button>
      <button className="btn txt add-txt" onClick={() => setModal('사용')}>
        + 대체휴무 신청
      </button>
    </>
  ) : undefined

  return (
    <div className="page on">
      <PageHead eyebrow="" title="연장근무" actions={top} />
      <ErrorBanner error={rowQ.error} table="comp_time" />
      {msg && <div style={{ margin: '0 0 10px', padding: '8px 12px', borderRadius: 8, fontSize: 12.5, background: 'var(--danger-soft)', color: 'var(--danger)' }}>{msg}</div>}

      {!empQ.loading && !isRegular && (
        <section className="panel" style={{ padding: 16 }}>
          연장근무와 대체휴무는 <b>정규직</b>만 신청할 수 있습니다.
        </section>
      )}

      {isRegular && (
        <div className="ops-stats" style={{ marginBottom: 14 }}>
          <div className="s">
            <small>적립한 연장근무</small>
            <b className="tnum">{fmtH(bal.earn)}</b>
          </div>
          <div className="s">
            <small>사용한 대체휴무</small>
            <b className="tnum">{fmtH(bal.used)}</b>
          </div>
          <div className="s">
            <small>대체휴무 잔여</small>
            <b className="tnum" style={{ color: bal.remain < 0 ? 'var(--danger)' : 'var(--brand)' }}>{fmtH(bal.remain)}</b>
            {bal.pend > 0 && <small style={{ display: 'block' }}>사용 신청 중 {fmtH(bal.pend)}</small>}
          </div>
        </div>
      )}

      {isRegular && (
        <section className="panel" style={{ marginBottom: 14 }}>
          <div className="panel-h">
            <h2>
              내 신청 내역 <span className="count">{mine.length}</span>
            </h2>
          </div>
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>구분</th>
                  <th>날짜</th>
                  <th style={{ textAlign: 'right' }}>시간</th>
                  <th>사유</th>
                  <th>승인자</th>
                  <th>결재 상태</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rowQ.loading && <LoadingRow cols={7} />}
                {!rowQ.loading &&
                  mine.map((r) => (
                    <tr key={r.id}>
                      <td>{r.kind === '적립' ? '연장근무 적립' : '대체휴무 사용'}</td>
                      <td className="tnum">
                        {dateOnly(r.work_date)}
                        {r.start_time ? ` ${hm(r.start_time)}~${hm(r.end_time)}` : ''}
                      </td>
                      <td className="tnum" style={{ textAlign: 'right' }}>
                        {r.kind === '사용' ? '−' : '+'}
                        {Number(r.hours)}시간
                      </td>
                      <td className="t-sub">{r.reason ?? ''}</td>
                      <td>{empById[r.approver_id ?? '']?.name ?? '—'}</td>
                      <td>
                        <span className={`chip ${chip(r.status)}`}>{r.status}</span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {r.status === '신청' && (
                          <button className="sp-btn b2" disabled={busyId === r.id} onClick={() => cancel(r)}>
                            취소
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                {!rowQ.loading && mine.length === 0 && <EmptyRow cols={7} text="신청 내역이 없습니다." />}
              </tbody>
            </table>
          </div>
          <p className="sec-mini" style={{ marginTop: 10 }}>
            신청은 <b>전자결재</b>에서 합니다. 연장근무는 <b>연장근무</b> 양식으로, 대체휴무는 <b>휴가신청</b> 양식의 휴가 종류 <b>대체휴무</b>로 올리고, 지정한 승인자가 승인하면 반영됩니다. 연장근무는 <b>1:1</b>로 적립되고 소멸기한이 없으며, 8시간 = 1일입니다. 승인된 대체휴무는 일정표에도 표시됩니다.
          </p>
        </section>
      )}

      {isAdmin && (
        <section className="panel">
          <div className="panel-h">
            <h2>
              전 직원 대체휴무 잔여 <span className="count">{regulars.length}</span>
            </h2>
          </div>
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>직원</th>
                  <th style={{ textAlign: 'right' }}>적립</th>
                  <th style={{ textAlign: 'right' }}>사용</th>
                  <th style={{ textAlign: 'right' }}>잔여</th>
                </tr>
              </thead>
              <tbody>
                {regulars.map((e) => {
                  const b = balanceOf(rows, e.id)
                  return (
                    <tr key={e.id}>
                      <td className="t-title">{e.name}</td>
                      <td className="tnum" style={{ textAlign: 'right' }}>{b.earn}시간</td>
                      <td className="tnum" style={{ textAlign: 'right' }}>{b.used}시간</td>
                      <td className="tnum" style={{ textAlign: 'right', fontWeight: 800, color: b.remain < 0 ? 'var(--danger)' : 'var(--brand)' }}>
                        {fmtH(b.remain)}
                      </td>
                    </tr>
                  )
                })}
                {regulars.length === 0 && <EmptyRow cols={4} text="정규직 재직자가 없습니다." />}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {modal && (
        <ApprovalDraftModal
          initialForm={modal === '적립' ? 'overtime' : 'leave'}
          presetValues={modal === '사용' ? { '휴가 종류': '대체휴무' } : undefined}
          onClose={() => setModal(null)}
          onCreated={() => {
            setModal(null)
            notifyApprovalsChanged()
            rowQ.reload()
          }}
        />
      )}
    </div>
  )
}
