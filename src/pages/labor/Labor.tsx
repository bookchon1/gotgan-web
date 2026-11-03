import { useMemo, useState } from 'react'
import { PageHead } from '../../components/PageHead'
import { ErrorBanner, LoadingRow, EmptyRow } from '../../components/States'
import { supabase } from '../../lib/supabase'
import { useQuery } from '../../lib/useQuery'
import { won, dateOnly, mmdd } from '../../lib/format'
import type {
  Employee,
  PayrollRun,
  Payslip,
  LeaveRecord,
  LaborWorker,
  LaborAttendance,
  ArtProject,
} from '../../types/db'

type Tab = 'att' | 'pay' | 'leave'

export default function Labor() {
  const [tab, setTab] = useState<Tab>('att')

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

      {tab === 'att' && <AttView />}
      {tab === 'pay' && <PayView empById={empById} />}
      {tab === 'leave' && <LeaveView empById={empById} />}
    </div>
  )
}

// ===================== 근무 기록 (일용직) =====================
/** 실근무 시간: 출근·퇴근(HH:MM[:SS])·익일여부·휴게(분) → 시간 */
function workHours(ci: string | null, co: string | null, nextDay: boolean, breakMin: number): number | null {
  if (!ci || !co) return null
  const toSec = (t: string) => {
    const [h, m, s] = t.split(':').map(Number)
    return h * 3600 + m * 60 + (s || 0)
  }
  let sec = toSec(co) - toSec(ci) + (nextDay ? 86400 : 0) - (breakMin || 0) * 60
  if (sec < 0) sec = 0
  return sec / 3600
}
function hm(t: string | null): string {
  return t ? t.slice(0, 5) : '—'
}

function AttView() {
  const [ym, setYm] = useState('2026-10')
  const [addOpen, setAddOpen] = useState(false)
  const [wkOpen, setWkOpen] = useState(false)

  const workerQ = useQuery<LaborWorker[]>(
    async () => await supabase.from('labor_workers').select('*').order('name'),
    [],
  )
  const projQ = useQuery<Pick<ArtProject, 'id' | 'name'>[]>(
    async () => await supabase.from('art_projects').select('id,name'),
    [],
  )
  const attQ = useQuery<LaborAttendance[]>(
    async () =>
      await supabase
        .from('labor_attendance')
        .select('*')
        .gte('work_date', `${ym}-01`)
        .lte('work_date', `${ym}-31`)
        .order('work_date', { ascending: true }),
    [ym],
  )

  const workerById = useMemo(
    () => Object.fromEntries((workerQ.data ?? []).map((w) => [w.id, w])),
    [workerQ.data],
  )
  const projById = useMemo(
    () => Object.fromEntries((projQ.data ?? []).map((p) => [p.id, p.name])),
    [projQ.data],
  )
  const rows = attQ.data ?? []

  // 월 선택지 (최근 6개월 + 당월)
  const months = useMemo(() => {
    const out: string[] = []
    const base = new Date(2026, 10, 1) // 2026-11 기준 표기
    for (let i = 0; i < 6; i++) {
      const d = new Date(base.getFullYear(), base.getMonth() - i, 1)
      out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    }
    return out
  }, [])

  return (
    <section className="panel">
      <ErrorBanner error={attQ.error} table="labor_attendance" />
      <div className="panel-h">
        <div>
          <h2>
            근무 기록 <span className="count">일용직</span>
          </h2>
          <p>출근·퇴근·휴게·실근무 · 익일 퇴근 지원</p>
        </div>
        <div className="r" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select className="sel" value={ym} onChange={(e) => setYm(e.target.value)}>
            {months.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <button className="btn sec" onClick={() => setWkOpen(true)}>
            작업자 관리
          </button>
          <button className="btn pri" onClick={() => setAddOpen(true)}>
            + 근무 추가
          </button>
        </div>
      </div>

      <div className="tbl-wrap">
        <table>
          <thead>
            <tr>
              <th>근무일</th>
              <th>작업자</th>
              <th>출근 · 퇴근</th>
              <th style={{ textAlign: 'right' }}>휴게</th>
              <th style={{ textAlign: 'right' }}>실근무</th>
              <th>근무 장소</th>
            </tr>
          </thead>
          <tbody>
            {attQ.loading && <LoadingRow cols={6} />}
            {!attQ.loading &&
              rows.map((r) => {
                const w = workerById[r.worker_id]
                const h = workHours(r.check_in, r.check_out, r.next_day, r.break_min)
                const place = r.place || (r.project_id ? projById[r.project_id] : '') || '—'
                return (
                  <tr key={r.id}>
                    <td className="tnum">{mmdd(r.work_date)}</td>
                    <td className="t-title">{w?.name ?? '—'}</td>
                    <td className="tnum">
                      {hm(r.check_in)} · {hm(r.check_out)}
                      {r.next_day && <span className="badge" style={{ marginLeft: 6, fontSize: 9 }}>익일</span>}
                    </td>
                    <td className="tnum" style={{ textAlign: 'right' }}>
                      {r.break_min}분
                    </td>
                    <td className="tnum" style={{ textAlign: 'right', fontWeight: 700 }}>
                      {h == null ? '—' : `${h.toFixed(1)}시간`}
                    </td>
                    <td>{place}</td>
                  </tr>
                )
              })}
            {!attQ.loading && rows.length === 0 && !attQ.error && (
              <EmptyRow cols={6} text="이 달 근무 기록이 없습니다. '근무 추가'로 입력하세요." />
            )}
          </tbody>
        </table>
      </div>
      <div className="table-foot">
        <span>일용직 근무기록은 현장 작업과 연동되며, 익일 퇴근(자정 초과)도 기록합니다.</span>
      </div>

      {addOpen && (
        <AttAddModal
          workers={workerQ.data ?? []}
          projects={projQ.data ?? []}
          ym={ym}
          onClose={() => setAddOpen(false)}
          onSaved={() => {
            setAddOpen(false)
            attQ.reload()
          }}
        />
      )}
      {wkOpen && (
        <WorkerModal
          workers={workerQ.data ?? []}
          onClose={() => setWkOpen(false)}
          onChanged={() => workerQ.reload()}
        />
      )}
    </section>
  )
}

/** 근무 추가 모달 */
function AttAddModal({
  workers,
  projects,
  ym,
  onClose,
  onSaved,
}: {
  workers: LaborWorker[]
  projects: Pick<ArtProject, 'id' | 'name'>[]
  ym: string
  onClose: () => void
  onSaved: () => void
}) {
  const [f, setF] = useState({
    worker_id: workers[0]?.id ?? '',
    work_date: `${ym}-01`,
    check_in: '09:00',
    check_out: '18:00',
    next_day: false,
    break_min: 60,
    project_id: projects[0]?.id ?? '',
    place: '',
  })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const hrs = workHours(f.check_in, f.check_out, f.next_day, f.break_min)

  async function save() {
    if (!f.worker_id || !f.work_date) return
    setBusy(true)
    setErr(null)
    const { error } = await supabase.from('labor_attendance').insert({
      worker_id: f.worker_id,
      work_date: f.work_date,
      check_in: f.check_in || null,
      check_out: f.check_out || null,
      next_day: f.next_day,
      break_min: Number(f.break_min) || 0,
      project_id: f.project_id || null,
      place: f.place || null,
    })
    setBusy(false)
    if (error) setErr(error.message)
    else onSaved()
  }

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460 }}>
        <div className="mh">
          <div>
            <div className="eyebrow">근무 기록</div>
            <h3>일용직 근무 추가</h3>
          </div>
          <button className="x" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="mb">
          {err && <div className="login-alert err" style={{ margin: '0 0 10px' }}>{err}</div>}
          <div style={{ display: 'flex', gap: 10 }}>
            <div className="mfield" style={{ flex: 1 }}>
              <label>작업자</label>
              <select className="ctl" value={f.worker_id} onChange={(e) => setF({ ...f, worker_id: e.target.value })}>
                {workers.length === 0 && <option value="">작업자를 먼저 등록하세요</option>}
                {workers.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} ({won(w.day_rate)}원)
                  </option>
                ))}
              </select>
            </div>
            <div className="mfield" style={{ flex: 1 }}>
              <label>근무일</label>
              <input type="date" className="ctl" value={f.work_date} onChange={(e) => setF({ ...f, work_date: e.target.value })} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div className="mfield" style={{ flex: 1 }}>
              <label>출근</label>
              <input type="time" className="ctl" value={f.check_in} onChange={(e) => setF({ ...f, check_in: e.target.value })} />
            </div>
            <div className="mfield" style={{ flex: 1 }}>
              <label>퇴근</label>
              <input type="time" className="ctl" value={f.check_out} onChange={(e) => setF({ ...f, check_out: e.target.value })} />
            </div>
            <div className="mfield" style={{ width: 92 }}>
              <label>휴게(분)</label>
              <input type="number" className="ctl" value={f.break_min} onChange={(e) => setF({ ...f, break_min: Number(e.target.value) })} />
            </div>
          </div>
          <label className="mfield" style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={f.next_day} onChange={(e) => setF({ ...f, next_day: e.target.checked })} />
            <span style={{ fontSize: 13 }}>익일 퇴근 (자정 넘김)</span>
            <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--brand)', fontWeight: 700 }}>
              실근무 {hrs == null ? '—' : `${hrs.toFixed(1)}시간`}
            </span>
          </label>
          <div style={{ display: 'flex', gap: 10 }}>
            <div className="mfield" style={{ flex: 1 }}>
              <label>사업 현장</label>
              <select
                className="ctl"
                value={f.project_id}
                onChange={(e) => {
                  const pid = e.target.value
                  const pname = projects.find((p) => p.id === pid)?.name ?? ''
                  setF({ ...f, project_id: pid, place: f.place || (pname ? `${pname} 현장` : '') })
                }}
              >
                <option value="">선택 안 함</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="mfield" style={{ flex: 1 }}>
              <label>근무 장소</label>
              <input className="ctl" value={f.place} onChange={(e) => setF({ ...f, place: e.target.value })} placeholder="예: 삼국유사 현장" />
            </div>
          </div>
        </div>
        <div className="mf">
          <button className="btn sec" onClick={onClose} disabled={busy}>
            취소
          </button>
          <button className="btn pri" onClick={save} disabled={busy || !f.worker_id}>
            {busy ? '저장 중…' : '저장'}
          </button>
        </div>
      </div>
    </div>
  )
}

/** 작업자 관리 모달 */
function WorkerModal({
  workers,
  onClose,
  onChanged,
}: {
  workers: LaborWorker[]
  onClose: () => void
  onChanged: () => void
}) {
  const [name, setName] = useState('')
  const [rate, setRate] = useState(150000)
  const [busy, setBusy] = useState(false)

  async function add() {
    if (!name.trim()) return
    setBusy(true)
    await supabase.from('labor_workers').insert({ name: name.trim(), day_rate: Number(rate) || 0 })
    setBusy(false)
    setName('')
    setRate(150000)
    onChanged()
  }

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
        <div className="mh">
          <div>
            <div className="eyebrow">작업자 관리</div>
            <h3>일용직 작업자</h3>
          </div>
          <button className="x" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="mb">
          <div className="tbl-wrap" style={{ marginBottom: 12 }}>
            <table>
              <thead>
                <tr>
                  <th>작업자</th>
                  <th style={{ textAlign: 'right' }}>기본 일당</th>
                </tr>
              </thead>
              <tbody>
                {workers.map((w) => (
                  <tr key={w.id}>
                    <td className="t-title">{w.name}</td>
                    <td className="tnum" style={{ textAlign: 'right' }}>
                      {won(w.day_rate)}원
                    </td>
                  </tr>
                ))}
                {workers.length === 0 && <EmptyRow cols={2} text="등록된 작업자가 없습니다." />}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
            <div className="mfield" style={{ flex: 1, margin: 0 }}>
              <label>이름</label>
              <input className="ctl" value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 김일용" />
            </div>
            <div className="mfield" style={{ width: 130, margin: 0 }}>
              <label>기본 일당</label>
              <input type="number" className="ctl" value={rate} onChange={(e) => setRate(Number(e.target.value))} />
            </div>
            <button className="btn pri" onClick={add} disabled={busy || !name.trim()} style={{ flex: 'none' }}>
              {busy ? '…' : '등록'}
            </button>
          </div>
        </div>
      </div>
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
