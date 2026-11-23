import { useMemo, useState } from 'react'
import { PageHead } from '../components/PageHead'
import { ErrorBanner, LoadingRow, EmptyRow } from '../components/States'
import { supabase } from '../lib/supabase'
import { useQuery } from '../lib/useQuery'
import { useAuth } from '../lib/auth'
import { dateOnly } from '../lib/format'
import { deptLabel } from '../data/areas'
import { notifyApprovalsChanged } from '../lib/pendingApprovals'
import { ANNUAL_DEDUCT, grantedAnnual } from './labor/leave'
import { ApprovalDraftModal } from './ApprovalDraftModal'
import type { Employee, LeaveRecord } from '../types/db'

interface CompRow {
  id: string
  kind: '적립' | '사용'
  work_date: string
  start_time: string | null
  end_time: string | null
  hours: number
  reason: string | null
  approver_id: string | null
  approval_id: string | null
  status: '신청' | '승인' | '반려'
}

/** 12시간 → "12시간" + 보조 "1일 4시간" (8시간 = 1일) */
function hoursParts(h: number): { main: string; sub: string } {
  const v = Math.round(h * 100) / 100
  const d = Math.floor(Math.abs(v) / 8)
  const r = Math.round((Math.abs(v) - d * 8) * 100) / 100
  return { main: `${v}시간`, sub: d > 0 ? `${v < 0 ? '-' : ''}${d}일${r ? ` ${r}시간` : ''}` : '' }
}
const hm = (t: string | null) => (t ? t.slice(0, 5) : '')
const chip = (s: string) => (s === '승인' ? 'c-done' : s === '반려' ? 'set-hold' : 'c-wait')

function tenure(joinISO: string | null): string {
  if (!joinISO) return ''
  const j = new Date(joinISO)
  if (isNaN(+j)) return ''
  const t = new Date()
  let m = (t.getFullYear() - j.getFullYear()) * 12 + (t.getMonth() - j.getMonth())
  if (t.getDate() < j.getDate()) m -= 1
  if (m < 1) return '입사 1개월 미만'
  const y = Math.floor(m / 12)
  return `${y > 0 ? `${y}년 ` : ''}${m % 12 ? `${m % 12}개월` : ''}`.trim()
}

/** 내 정보 — 본인의 기본 정보 · 연차 · 대체휴무(연장근무) 잔여와 내역. 본인 것만 보인다. */
export default function MyPage() {
  const { me } = useAuth()
  const myId = me?.id ?? ''
  const [form, setForm] = useState<null | 'leave' | 'overtime'>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const empQ = useQuery<Employee[]>(async () => await supabase.from('employees').select('*').eq('id', myId), [myId])
  const leaveQ = useQuery<LeaveRecord[]>(
    async () => await supabase.from('leave_records').select('*').eq('employee_id', myId).order('start_date', { ascending: false }),
    [myId],
  )
  const compQ = useQuery<CompRow[]>(
    async () => await supabase.from('comp_time').select('*').eq('employee_id', myId).order('work_date', { ascending: false }),
    [myId],
  )
  const emp = empQ.data?.[0] ?? null
  const join = emp?.join_date ?? (emp?.join_ym && /^\d{4}\.\d{2}$/.test(emp.join_ym) ? emp.join_ym.replace('.', '-') + '-01' : null)
  const isRegular = emp?.employment_type === '정규직'

  const all = leaveQ.data ?? []
  const records = all.filter((r) => r.leave_type !== '이월')
  const annual = useMemo(() => {
    const carry = all.reduce((m, r) => Math.max(m, Number(r.carry_over) || 0), 0)
    let used = 0
    let other = 0
    const yr = String(new Date().getFullYear())
    let yearTotal = 0
    for (const r of records) {
      if (r.status !== '승인') continue
      const d = Number(r.days) || 0
      if (ANNUAL_DEDUCT.has(r.leave_type)) used += d
      else other += d
      if ((r.start_date ?? '').startsWith(yr)) yearTotal += d
    }
    const { granted, basis } = grantedAnnual(join)
    return { carry, used, other, granted, basis, remain: carry + granted - used, yearTotal }
  }, [all, records, join])

  const comp = compQ.data ?? []
  const bal = useMemo(() => {
    let earn = 0
    let used = 0
    let pend = 0
    for (const r of comp) {
      const h = Number(r.hours) || 0
      if (r.kind === '적립' && r.status === '승인') earn += h
      if (r.kind === '사용' && r.status === '승인') used += h
      if (r.kind === '사용' && r.status === '신청') pend += h
    }
    return { earn, used, pend, remain: earn - used }
  }, [comp])
  const cr = hoursParts(bal.remain)

  // 취소 = 전자결재 회수 (연결된 신청은 DB가 자동 삭제)
  async function cancel(r: CompRow) {
    setBusyId(r.id)
    setMsg(null)
    if (r.approval_id) {
      const { data, error } = await supabase.from('approvals').update({ status: '회수' }).eq('id', r.approval_id).eq('status', '진행').select('id')
      if (error || !data || data.length === 0) {
        setBusyId(null)
        return setMsg(error?.message ?? '취소되지 않았습니다. 이미 결재가 시작됐거나 처리된 문서입니다.')
      }
      await supabase.from('approvals').delete().eq('id', r.approval_id).eq('status', '회수')
    } else {
      const { error } = await supabase.from('comp_time').delete().eq('id', r.id).eq('status', '신청')
      if (error) {
        setBusyId(null)
        return setMsg(error.message)
      }
    }
    setBusyId(null)
    notifyApprovalsChanged()
    compQ.reload()
  }

  const info: [string, string][] = [
    ['입사일', join ? `${dateOnly(join)}${tenure(join) ? ` · ${tenure(join)}` : ''}` : '—'],
    ['고용형태', emp?.employment_type ?? '—'],
    ['연락처', emp?.phone ?? '—'],
    ['이메일', emp?.email ?? '—'],
  ]

  return (
    <div className="page on me">
      <PageHead
        eyebrow=""
        title="내 정보"
        actions={
          <>
            <button className="btn txt add-txt" onClick={() => setForm('leave')}>
              + 휴가 신청
            </button>
            {isRegular && (
              <button className="btn txt add-txt" onClick={() => setForm('overtime')}>
                + 연장근무 신청
              </button>
            )}
          </>
        }
      />
      <ErrorBanner error={empQ.error} table="employees" />
      {msg && <div className="me-msg">{msg}</div>}

      {/* 프로필 */}
      <section className="me-hero">
        <div className="me-id">
          <span className="me-av">{(emp?.name ?? me?.name ?? '·').slice(0, 1)}</span>
          <div>
            <h2>{emp?.name ?? me?.name ?? ''}</h2>
            <p>
              {[emp?.title, deptLabel(emp?.dept_key ?? me?.dept_key)].filter(Boolean).join(' · ')}
              {emp?.status && emp.status !== '재직' ? ` · ${emp.status}` : ''}
            </p>
          </div>
        </div>
        <dl className="me-info">
          {info.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* 잔여 */}
      {isRegular ? (
        <div className="me-kpi">
          <div className="me-card">
            <small>연차 잔여</small>
            <b className="tnum" style={{ color: annual.remain < 0 ? 'var(--danger)' : undefined }}>
              {annual.remain}
              <i>일</i>
            </b>
            <span>
              이월 {annual.carry} + 부여 {annual.granted} − 사용 {annual.used}
            </span>
            <em title={annual.basis}>{annual.basis}</em>
          </div>
          <div className="me-card">
            <small>대체휴무 잔여</small>
            <b className="tnum" style={{ color: bal.remain < 0 ? 'var(--danger)' : undefined }}>
              {cr.main}
            </b>
            <span>
              {cr.sub ? `${cr.sub} · ` : ''}적립 {bal.earn} / 사용 {bal.used}시간
            </span>
            <em>{bal.pend > 0 ? `사용 신청 중 ${bal.pend}시간` : '연장근무 1:1 적립 · 소멸기한 없음'}</em>
          </div>
          <div className="me-card">
            <small>올해 휴가 사용</small>
            <b className="tnum">
              {annual.yearTotal}
              <i>일</i>
            </b>
            <span>
              연차 {annual.used} · 대체·기타 {annual.other}
            </span>
            <em>승인된 휴가 합계</em>
          </div>
        </div>
      ) : null}

      {/* 휴가 사용 내역 */}
      <section className="panel" style={{ marginBottom: 14 }}>
        <div className="panel-h">
          <h2>
            휴가 사용 내역 <span className="count">{records.length}</span>
          </h2>
        </div>
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>기간</th>
                <th>종류</th>
                <th style={{ textAlign: 'right' }}>일수</th>
                <th>사유</th>
                <th>상태</th>
              </tr>
            </thead>
            <tbody>
              {leaveQ.loading && <LoadingRow cols={5} />}
              {!leaveQ.loading &&
                records.map((r) => (
                  <tr key={r.id}>
                    <td className="tnum">
                      {dateOnly(r.start_date)}
                      {r.end_date && r.end_date !== r.start_date ? ` ~ ${dateOnly(r.end_date)}` : ''}
                    </td>
                    <td>{r.leave_type}</td>
                    <td className="tnum" style={{ textAlign: 'right' }}>{Number(r.days)}일</td>
                    <td className="t-sub">{r.reason ?? ''}</td>
                    <td>
                      <span className={`chip ${chip(r.status)}`}>{r.status}</span>
                    </td>
                  </tr>
                ))}
              {!leaveQ.loading && records.length === 0 && <EmptyRow cols={5} text="휴가 사용 내역이 없습니다." />}
            </tbody>
          </table>
        </div>
      </section>

      {/* 연장근무 · 대체휴무 내역 */}
      {(isRegular || comp.length > 0) && (
        <section className="panel">
          <div className="panel-h">
            <h2>
              연장근무 · 대체휴무 내역 <span className="count">{comp.length}</span>
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
                  <th>상태</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {compQ.loading && <LoadingRow cols={6} />}
                {!compQ.loading &&
                  comp.map((r) => (
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
                {!compQ.loading && comp.length === 0 && <EmptyRow cols={6} text="연장근무·대체휴무 내역이 없습니다." />}
              </tbody>
            </table>
          </div>
          <p className="sec-mini" style={{ marginTop: 10 }}>
            신청은 <b>전자결재</b>의 연장근무·휴가신청 양식으로 올립니다. 승인된 대체휴무는 일정표에도 표시되며, 8시간이 1일입니다.
          </p>
        </section>
      )}

      {form && (
        <ApprovalDraftModal
          initialForm={form}
          onClose={() => setForm(null)}
          onCreated={() => {
            setForm(null)
            notifyApprovalsChanged()
            leaveQ.reload()
            compQ.reload()
          }}
        />
      )}
    </div>
  )
}
