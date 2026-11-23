import { useMemo, useState } from 'react'
import { PageHead } from '../components/PageHead'
import { ErrorBanner, LoadingRow, EmptyRow } from '../components/States'
import { supabase } from '../lib/supabase'
import { useQuery } from '../lib/useQuery'
import { useAuth } from '../lib/auth'
import { approverLabel, dateOnly, sortApprovers } from '../lib/format'

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
  const toDecide = rows.filter((r) => r.approver_id === myId && r.status === '신청')
  const candidates = useMemo(
    () => sortApprovers(emps.filter((e) => e.status === '재직' && e.id !== myId)),
    [emps, myId],
  )
  const regulars = useMemo(
    () => emps.filter((e) => e.employment_type === '정규직' && e.status === '재직').sort((a, b) => a.name.localeCompare(b.name, 'ko')),
    [emps],
  )

  async function decide(r: CompRow, status: '승인' | '반려') {
    setBusyId(r.id)
    setMsg(null)
    const { data, error } = await supabase
      .from('comp_time')
      .update({ status, decided_at: new Date().toISOString() })
      .eq('id', r.id)
      .eq('status', '신청')
      .select('id')
    setBusyId(null)
    if (error || !data || data.length === 0) setMsg(error?.message ?? '처리되지 않았습니다. (이미 처리됐거나 권한 없음)')
    rowQ.reload()
  }
  async function cancel(r: CompRow) {
    setBusyId(r.id)
    setMsg(null)
    const { data, error } = await supabase.from('comp_time').delete().eq('id', r.id).eq('status', '신청').select('id')
    setBusyId(null)
    if (error || !data || data.length === 0) setMsg(error?.message ?? '취소되지 않았습니다.')
    rowQ.reload()
  }

  const top = isRegular ? (
    <>
      <button className="btn txt add-txt" onClick={() => setModal('적립')}>
        + 연장근무 적립 신청
      </button>
      <button className="btn txt add-txt" onClick={() => setModal('사용')}>
        + 대체휴무 사용 신청
      </button>
    </>
  ) : undefined

  return (
    <div className="page on">
      <PageHead eyebrow="" title="연장·대체휴무" actions={top} />
      <ErrorBanner error={rowQ.error} table="comp_time" />
      {msg && <div style={{ margin: '0 0 10px', padding: '8px 12px', borderRadius: 8, fontSize: 12.5, background: 'var(--danger-soft)', color: 'var(--danger)' }}>{msg}</div>}

      {!empQ.loading && !isRegular && (
        <section className="panel" style={{ padding: 16 }}>
          연장근무 적립·대체휴무는 <b>정규직</b>만 신청할 수 있습니다.
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

      {toDecide.length > 0 && (
        <section className="panel" style={{ marginBottom: 14 }}>
          <div className="panel-h">
            <h2>
              승인 요청 <span className="count">{toDecide.length}</span>
            </h2>
          </div>
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>신청자</th>
                  <th>구분</th>
                  <th>날짜</th>
                  <th style={{ textAlign: 'right' }}>시간</th>
                  <th>사유</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {toDecide.map((r) => (
                  <tr key={r.id}>
                    <td className="t-title">{empById[r.employee_id]?.name ?? '—'}</td>
                    <td>{r.kind === '적립' ? '연장근무 적립' : '대체휴무 사용'}</td>
                    <td className="tnum">
                      {dateOnly(r.work_date)}
                      {r.start_time ? ` ${hm(r.start_time)}~${hm(r.end_time)}` : ''}
                    </td>
                    <td className="tnum" style={{ textAlign: 'right' }}>{fmtH(Number(r.hours))}</td>
                    <td className="t-sub">{r.reason ?? ''}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button className="sp-btn b1" disabled={busyId === r.id} onClick={() => decide(r, '승인')}>
                        승인
                      </button>
                      <button className="sp-btn b2" style={{ marginLeft: 5 }} disabled={busyId === r.id} onClick={() => decide(r, '반려')}>
                        반려
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
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
                  <th>상태</th>
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
            연장근무 시간은 <b>1:1</b>로 적립되고 소멸기한이 없습니다. 8시간 = 1일이며, 승인된 적립에서 승인된 사용을 뺀 값이 잔여입니다.
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
        <ReqModal
          kind={modal}
          myId={myId}
          available={bal.available}
          candidates={candidates}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null)
            rowQ.reload()
          }}
        />
      )}
    </div>
  )
}

function ReqModal({
  kind,
  myId,
  available,
  candidates,
  onClose,
  onSaved,
}: {
  kind: '적립' | '사용'
  myId: string
  available: number
  candidates: Emp[]
  onClose: () => void
  onSaved: () => void
}) {
  const today = new Date().toISOString().slice(0, 10)
  const [date, setDate] = useState(today)
  const [start, setStart] = useState('18:00')
  const [end, setEnd] = useState('20:00')
  const [hoursTxt, setHoursTxt] = useState('')
  const [reason, setReason] = useState('')
  const [approverId, setApproverId] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // 적립: 시작·종료 시각으로 자동 계산(자정을 넘기면 다음 날로 계산), 직접 수정 가능
  const auto = useMemo(() => {
    if (kind !== '적립' || !start || !end) return 0
    const [sh, sm] = start.split(':').map(Number)
    const [eh, em] = end.split(':').map(Number)
    let min = eh * 60 + em - (sh * 60 + sm)
    if (min <= 0) min += 24 * 60
    return Math.round((min / 60) * 100) / 100
  }, [kind, start, end])
  const hours = hoursTxt !== '' ? Number(hoursTxt) : auto

  async function save() {
    if (!(hours > 0)) return setErr('시간을 입력하세요.')
    if (!approverId) return setErr('승인할 사람을 선택하세요.')
    if (kind === '사용' && hours > available + 1e-9) return setErr(`사용 가능한 잔여(${available}시간)를 넘었습니다.`)
    setBusy(true)
    setErr(null)
    const { error } = await supabase.from('comp_time').insert({
      employee_id: myId,
      kind,
      work_date: date,
      start_time: kind === '적립' ? start : null,
      end_time: kind === '적립' ? end : null,
      hours,
      reason: reason.trim() || null,
      approver_id: approverId,
      status: '신청',
    })
    setBusy(false)
    if (error) return setErr(error.message)
    onSaved()
  }

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460 }}>
        <div className="mh">
          <div>
            <div className="eyebrow">연장·대체휴무</div>
            <h3>{kind === '적립' ? '연장근무 적립 신청' : '대체휴무 사용 신청'}</h3>
          </div>
          <button className="x" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="mb">
          <div className="mfield">
            <label>{kind === '적립' ? '연장근무 날짜' : '대체휴무 사용 날짜'}</label>
            <input className="ctl" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          {kind === '적립' && (
            <div style={{ display: 'flex', gap: 10 }}>
              <div className="mfield" style={{ flex: 1 }}>
                <label>시작</label>
                <input className="ctl" type="time" value={start} onChange={(e) => { setStart(e.target.value); setHoursTxt('') }} />
              </div>
              <div className="mfield" style={{ flex: 1 }}>
                <label>종료</label>
                <input className="ctl" type="time" value={end} onChange={(e) => { setEnd(e.target.value); setHoursTxt('') }} />
              </div>
            </div>
          )}
          <div className="mfield">
            <label>{kind === '적립' ? '인정 시간 (1:1 적립)' : '사용 시간'}</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                className="ctl"
                style={{ width: 110 }}
                type="number"
                min="0.5"
                step="0.5"
                value={hoursTxt !== '' ? hoursTxt : hours || ''}
                onChange={(e) => setHoursTxt(e.target.value)}
              />
              <span className="t-sub">시간</span>
              {kind === '사용' && (
                <>
                  <button type="button" className="btn" onClick={() => setHoursTxt('8')}>종일 8시간</button>
                  <button type="button" className="btn" onClick={() => setHoursTxt('4')}>반일 4시간</button>
                  <span className="t-sub">사용 가능 잔여 {available}시간</span>
                </>
              )}
            </div>
          </div>
          <div className="mfield">
            <label>사유</label>
            <textarea
              className="ctl"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={kind === '적립' ? '연장근무 내용 (예: 현장 마감 작업)' : '사용 사유 (선택)'}
            />
          </div>
          <div className="mfield">
            <label>승인자</label>
            <select className="ctl" value={approverId} onChange={(e) => setApproverId(e.target.value)}>
              <option value="">승인</option>
              {candidates.map((e) => (
                <option key={e.id} value={e.id}>
                  {approverLabel(e)}
                </option>
              ))}
            </select>
          </div>
          {err && <div style={{ color: 'var(--danger)', fontSize: 12.5, marginTop: 6 }}>{err}</div>}
        </div>
        <div className="mf">
          <button className="btn sec" onClick={onClose}>
            취소
          </button>
          <button className="btn pri" onClick={save} disabled={busy}>
            {busy ? '신청 중…' : '신청'}
          </button>
        </div>
      </div>
    </div>
  )
}
