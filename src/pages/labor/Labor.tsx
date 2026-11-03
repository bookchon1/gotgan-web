import { useMemo, useState } from 'react'
import { PageHead } from '../../components/PageHead'
import { ErrorBanner, LoadingRow, EmptyRow } from '../../components/States'
import { supabase } from '../../lib/supabase'
import { useQuery } from '../../lib/useQuery'
import { won, dateOnly } from '../../lib/format'
import type { Employee, PayrollRun, Payslip, LeaveRecord } from '../../types/db'

type Tab = 'att' | 'pay' | 'leave'

export default function Labor() {
  const [tab, setTab] = useState<Tab>('pay')

  // 직원 명부 (이름·부서 표시용)
  const empQ = useQuery<Pick<Employee, 'id' | 'name' | 'dept_key'>[]>(
    async () => await supabase.from('employees').select('id,name,dept_key').eq('status', '재직'),
    [],
  )
  const empById = useMemo(() => {
    const m: Record<string, { name: string; dept: string }> = {}
    for (const e of empQ.data ?? []) m[e.id] = { name: e.name, dept: deptLabel(e.dept_key) }
    return m
  }, [empQ.data])

  return (
    <div className="page on">
      <PageHead
        eyebrow="경영 · 노무"
        title="노무관리"
        desc="근무 기록·급여·휴가 현황을 관리하세요."
      />
      <div className="subtabs">
        {([
          ['att', '근무 기록'],
          ['pay', '급여 기록'],
          ['leave', '휴가 현황'],
        ] as [Tab, string][]).map(([k, t]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'pay' && <PayView empById={empById} />}
      {tab === 'leave' && <LeaveView empById={empById} />}
      {tab === 'att' && (
        <section className="panel">
          <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
            근무 기록 — 일용직 출퇴근/현장 연동 예정
          </div>
        </section>
      )}
    </div>
  )
}

function deptLabel(key: string | null): string {
  const m: Record<string, string> = {
    art: '미술',
    management: '경영',
    product: '상품',
    promotion: '홍보',
    experience: '체험',
    education: '교육',
  }
  return key ? m[key] ?? '대표' : '대표'
}

// ===================== 급여 =====================
function PayView({ empById }: { empById: Record<string, { name: string; dept: string }> }) {
  const [ym, setYm] = useState('2026-10')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const runQ = useQuery<PayrollRun[]>(
    async () => await supabase.from('payroll_runs').select('*').eq('ym', ym),
    [ym],
  )
  const run = runQ.data?.[0]
  const slipsQ = useQuery<Payslip[]>(
    async () =>
      run
        ? await supabase.from('payslips').select('*').eq('run_id', run.id)
        : { data: [], error: null },
    [run?.id],
  )
  const slips = slipsQ.data ?? []

  let tBase = 0,
    tAllow = 0,
    tDed = 0,
    tNet = 0
  for (const s of slips) {
    tBase += Number(s.base_pay) || 0
    tAllow += Number(s.allowances) || 0
    tDed += Number(s.deductions) || 0
    tNet += Number(s.net_pay) || 0
  }

  async function copyPrev() {
    setBusy(true)
    setMsg(null)
    const { error } = await supabase.rpc('copy_prev_payroll', { p_target_ym: ym })
    setBusy(false)
    if (error) {
      setMsg(error.message)
    } else {
      setMsg('전월 급여를 복사했습니다.')
      runQ.reload()
      slipsQ.reload()
    }
  }

  return (
    <section className="panel">
      <ErrorBanner error={runQ.error} table="payroll_runs" />
      <div className="panel-h">
        <div>
          <h2>
            급여대장 <span className="count">{slipsQ.loading ? '…' : slips.length}</span>
          </h2>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <select className="sel" value={ym} onChange={(e) => setYm(e.target.value)}>
            <option value="2026-10">2026-10</option>
            <option value="2026-09">2026-09</option>
            <option value="2026-11">2026-11</option>
          </select>
          <button className="btn sec" onClick={copyPrev} disabled={busy}>
            {busy ? '복사 중…' : '전월 급여 복사'}
          </button>
        </div>
      </div>

      {msg && (
        <div className={`login-alert ${msg.includes('복사했') ? 'warn' : 'err'}`} style={{ margin: '0 0 12px' }}>
          {msg}
        </div>
      )}

      <div className="tbl-wrap">
        <table style={{ fontSize: 12.5 }}>
          <thead>
            <tr>
              <th>직원</th>
              <th>부서</th>
              <th style={{ textAlign: 'right' }}>기본급</th>
              <th style={{ textAlign: 'right' }}>수당</th>
              <th style={{ textAlign: 'right' }}>공제</th>
              <th style={{ textAlign: 'right' }}>실지급액</th>
            </tr>
          </thead>
          <tbody>
            {slipsQ.loading && <LoadingRow cols={6} />}
            {!slipsQ.loading &&
              slips.map((s) => {
                const e = empById[s.employee_id]
                return (
                  <tr key={s.id}>
                    <td className="t-title">{e?.name ?? '—'}</td>
                    <td>{e?.dept ?? '—'}</td>
                    <td className="tnum" style={{ textAlign: 'right' }}>
                      {won(s.base_pay)}
                    </td>
                    <td className="tnum" style={{ textAlign: 'right' }}>
                      {won(s.allowances)}
                    </td>
                    <td className="tnum" style={{ textAlign: 'right', color: 'var(--expense)' }}>
                      {won(s.deductions)}
                    </td>
                    <td className="tnum" style={{ textAlign: 'right', fontWeight: 700 }}>
                      {won(s.net_pay)}
                    </td>
                  </tr>
                )
              })}
            {!slipsQ.loading && slips.length === 0 && (
              <EmptyRow cols={6} text="급여대장이 없습니다. '전월 급여 복사'로 시작하세요." />
            )}
          </tbody>
          {slips.length > 0 && (
            <tfoot>
              <tr style={{ background: 'var(--brand-soft)', fontWeight: 800 }}>
                <td colSpan={2}>합계 ({slips.length}명)</td>
                <td className="tnum" style={{ textAlign: 'right' }}>
                  {won(tBase)}
                </td>
                <td className="tnum" style={{ textAlign: 'right' }}>
                  {won(tAllow)}
                </td>
                <td className="tnum" style={{ textAlign: 'right', color: 'var(--expense)' }}>
                  {won(tDed)}
                </td>
                <td className="tnum" style={{ textAlign: 'right' }}>
                  {won(tNet)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {run && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginTop: 14, flexWrap: 'wrap' }}>
          <div className="sec-mini" style={{ margin: 0 }}>
            상태: <b>{run.status}</b> · 전 직원 급여를 <b>지출결의서 1건</b>으로 묶어 상신합니다.
          </div>
        </div>
      )}
    </section>
  )
}

// ===================== 연차 =====================
function LeaveView({ empById }: { empById: Record<string, { name: string; dept: string }> }) {
  const leaveQ = useQuery<LeaveRecord[]>(
    async () => await supabase.from('leave_records').select('*').order('start_date', { ascending: false }),
    [],
  )
  const records = leaveQ.data ?? []

  // 직원별 집계: 부여(granted+carry_over) − 승인사용(승인된 days 합)
  const byEmp = useMemo(() => {
    const m: Record<string, { granted: number; used: number }> = {}
    for (const r of records) {
      const g = (Number(r.granted) || 0) + (Number(r.carry_over) || 0)
      const u = r.status === '승인' ? Number(r.days) || 0 : 0
      if (!m[r.employee_id]) m[r.employee_id] = { granted: 0, used: 0 }
      m[r.employee_id].granted += g
      m[r.employee_id].used += u
    }
    return m
  }, [records])

  const emps = Object.keys(byEmp)

  return (
    <section className="panel">
      <ErrorBanner error={leaveQ.error} table="leave_records" />
      <div className="panel-h">
        <div>
          <h2>
            연차 현황 <span className="count">{leaveQ.loading ? '…' : emps.length}</span>
          </h2>
        </div>
      </div>
      <div className="tbl-wrap">
        <table>
          <thead>
            <tr>
              <th>직원</th>
              <th>부서</th>
              <th style={{ textAlign: 'right' }}>부여</th>
              <th style={{ textAlign: 'right' }}>승인 사용</th>
              <th style={{ textAlign: 'right' }}>현재 잔여</th>
            </tr>
          </thead>
          <tbody>
            {leaveQ.loading && <LoadingRow cols={5} />}
            {!leaveQ.loading &&
              emps.map((eid) => {
                const e = empById[eid]
                const a = byEmp[eid]
                const rem = a.granted - a.used
                return (
                  <tr key={eid}>
                    <td className="t-title">{e?.name ?? '—'}</td>
                    <td>{e?.dept ?? '—'}</td>
                    <td className="tnum" style={{ textAlign: 'right' }}>
                      {a.granted}
                    </td>
                    <td className="tnum" style={{ textAlign: 'right' }}>
                      {a.used}
                    </td>
                    <td className="tnum" style={{ textAlign: 'right', fontWeight: 800, color: 'var(--brand)' }}>
                      {rem}
                    </td>
                  </tr>
                )
              })}
            {!leaveQ.loading && emps.length === 0 && (
              <EmptyRow cols={5} text="연차 기록이 없습니다." />
            )}
          </tbody>
        </table>
      </div>
      {/* 최근 신청 내역 */}
      {records.length > 0 && (
        <>
          <div className="bud-h" style={{ marginTop: 16 }}>
            <div className="t">최근 신청 내역</div>
          </div>
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>직원</th>
                  <th>종류</th>
                  <th>기간</th>
                  <th style={{ textAlign: 'right' }}>일수</th>
                  <th>상태</th>
                </tr>
              </thead>
              <tbody>
                {records.slice(0, 10).map((r) => (
                  <tr key={r.id}>
                    <td>{empById[r.employee_id]?.name ?? '—'}</td>
                    <td>{r.leave_type}</td>
                    <td className="tnum">
                      {dateOnly(r.start_date)}
                      {r.end_date && r.end_date !== r.start_date ? ` ~ ${dateOnly(r.end_date)}` : ''}
                    </td>
                    <td className="tnum" style={{ textAlign: 'right' }}>
                      {r.days}
                    </td>
                    <td>
                      <span className={`chip ${r.status === '승인' ? 'c-done' : r.status === '반려' ? 'set-hold' : 'c-wait'}`}>
                        {r.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  )
}
