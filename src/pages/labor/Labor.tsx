import { useMemo, useState } from 'react'
import { PageHead } from '../../components/PageHead'
import { ErrorBanner, LoadingRow, EmptyRow } from '../../components/States'
import { supabase } from '../../lib/supabase'
import { useQuery } from '../../lib/useQuery'
import { useAuth } from '../../lib/auth'
import { won, dateOnly, mmdd } from '../../lib/format'
import { ANNUAL_DEDUCT, grantedAnnual } from './leave'
import { prevMonth, recentMonths, payrollMonths, monthRange } from './month'
import Certificates from './Certificates'
import type {
  Employee,
  PayrollRun,
  Payslip,
  LeaveRecord,
  LaborWorker,
  LaborAttendance,
} from '../../types/db'

type Tab = 'pay' | 'att' | 'leave' | 'cert'

export default function Labor() {
  const [tab, setTab] = useState<Tab>('pay')

  // 직원 명부 (이름·부서·입사일·고용형태 — 연차 자동계산/정규직 필터용)
  const empQ = useQuery<Pick<Employee, 'id' | 'name' | 'dept_key' | 'join_date' | 'join_ym' | 'employment_type'>[]>(
    async () => await supabase.from('employees').select('id,name,dept_key,join_date,join_ym,employment_type').eq('status', '재직'),
    [],
  )
  const empById = useMemo(() => {
    const m: Record<string, { name: string; dept: string; join: string | null; empType: string | null }> = {}
    for (const e of empQ.data ?? []) {
      // join_date 우선, 없으면 join_ym('YYYY.MM')→'YYYY-MM-01'
      const join =
        e.join_date ??
        (e.join_ym && /^\d{4}\.\d{2}$/.test(e.join_ym) ? e.join_ym.replace('.', '-') + '-01' : null)
      m[e.id] = { name: e.name, dept: deptLabel(e.dept_key), join, empType: e.employment_type ?? null }
    }
    return m
  }, [empQ.data])

  return (
    <div className="page on">
      <PageHead
        eyebrow="경영 · 노무"
        title="노무관리"
        desc="근무기록·급여·휴가현황을 관리하세요."
      />
      <div className="subtabs">
        {([
          ['pay', '급여기록'],
          ['att', '근무기록'],
          ['leave', '휴가현황'],
          ['cert', '증명서'],
        ] as [Tab, string][]).map(([k, t]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'pay' && <PayView empById={empById} />}
      {tab === 'att' && <AttView />}
      {tab === 'leave' && <LeaveView empById={empById} />}
      {tab === 'cert' && <Certificates />}
    </div>
  )
}

// ===================== 근무기록 (일용직) =====================
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
  const [ym, setYm] = useState(recentMonths(1)[0]) // 당월
  const [addOpen, setAddOpen] = useState(false)
  const [wkOpen, setWkOpen] = useState(false)

  const workerQ = useQuery<LaborWorker[]>(
    async () => await supabase.from('labor_workers').select('*').order('name'),
    [],
  )
  const attQ = useQuery<LaborAttendance[]>(
    async () =>
      await supabase
        .from('labor_attendance')
        .select('*')
        .gte('work_date', monthRange(ym).start)
        .lt('work_date', monthRange(ym).endExclusive)
        .order('work_date', { ascending: true }),
    [ym],
  )

  const workerById = useMemo(
    () => Object.fromEntries((workerQ.data ?? []).map((w) => [w.id, w])),
    [workerQ.data],
  )
  const rows = attQ.data ?? []

  // 월 요약 — 총 근무 건수 / 총 실근무시간 합계
  const totalHours = rows.reduce((a, r) => {
    const h = workHours(r.check_in, r.check_out, r.next_day, r.break_min)
    return a + (h ?? 0)
  }, 0)

  // 월 선택지 (당월 포함 최근 6개월, 최신순)
  const months = useMemo(() => recentMonths(6), [])

  return (
    <section className="panel">
      <ErrorBanner error={attQ.error} table="labor_attendance" />
      <div className="panel-h">
        <div>
          <h2>
            근무기록 <span className="count">일용직</span>
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
          <button className="btn txt add-txt" onClick={() => setAddOpen(true)}>
            + 근무추가
          </button>
        </div>
      </div>

      {/* 월 요약 */}
      <div className="ops-stats">
        <div className="s">
          <small>이번 달 근무 건수</small>
          <b className="tnum">{attQ.loading ? '…' : `${rows.length}건`}</b>
        </div>
        <div className="s">
          <small>총 실근무시간</small>
          <b className="tnum">{attQ.loading ? '…' : `${totalHours.toFixed(1)}시간`}</b>
        </div>
        <div className="s">
          <small>평균 1건당</small>
          <b className="tnum">{rows.length > 0 ? `${(totalHours / rows.length).toFixed(1)}시간` : '—'}</b>
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
              <th>부서 · 업무</th>
            </tr>
          </thead>
          <tbody>
            {attQ.loading && <LoadingRow cols={6} />}
            {!attQ.loading &&
              rows.map((r) => {
                const w = workerById[r.worker_id]
                const h = workHours(r.check_in, r.check_out, r.next_day, r.break_min)
                const dept = deptLabel(r.dept_key)
                const task = r.place || ''
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
                    <td>
                      {dept && <span className="badge" style={{ marginRight: 6, fontSize: 10 }}>{dept}</span>}
                      {task || (dept ? '' : '—')}
                    </td>
                  </tr>
                )
              })}
            {!attQ.loading && rows.length === 0 && !attQ.error && (
              <EmptyRow cols={6} text="이 달 근무기록이 없습니다. '근무추가'로 입력하세요." />
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

/** 근무추가 모달 */
function AttAddModal({
  workers,
  ym,
  onClose,
  onSaved,
}: {
  workers: LaborWorker[]
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
    dept_key: '',
    task: '', // 업무 내용(무슨 일) — place 컬럼에 저장
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
      dept_key: f.dept_key || null,
      place: f.task || null, // 업무 내용
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
            <div className="eyebrow">근무기록</div>
            <h3>일용직 근무추가</h3>
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
            <div className="mfield" style={{ width: 150 }}>
              <label>부서</label>
              <select className="ctl" value={f.dept_key} onChange={(e) => setF({ ...f, dept_key: e.target.value })}>
                <option value="">선택 안 함</option>
                {DEPT_WORK_OPTS.map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div className="mfield" style={{ flex: 1 }}>
              <label>업무 내용</label>
              <input className="ctl" value={f.task} onChange={(e) => setF({ ...f, task: e.target.value })} placeholder="예: 유물 포장 보조, 전시 설치" />
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

/** 작업자 관리 모달 — 일용직 작업자 등록·수정·삭제 */
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
  // 수정 중인 작업자
  const [editId, setEditId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editRate, setEditRate] = useState(0)

  async function add() {
    if (!name.trim()) return
    setBusy(true)
    await supabase.from('labor_workers').insert({ name: name.trim(), day_rate: Number(rate) || 0 })
    setBusy(false)
    setName('')
    setRate(150000)
    onChanged()
  }

  function startEdit(w: LaborWorker) {
    setEditId(w.id)
    setEditName(w.name)
    setEditRate(w.day_rate)
  }
  function cancelEdit() {
    setEditId(null)
  }
  async function saveEdit(id: string) {
    if (!editName.trim()) return
    setBusy(true)
    await supabase
      .from('labor_workers')
      .update({ name: editName.trim(), day_rate: Number(editRate) || 0 })
      .eq('id', id)
    setBusy(false)
    setEditId(null)
    onChanged()
  }
  async function removeWorker(w: LaborWorker) {
    const ok = window.confirm(
      `'${w.name}' 작업자를 삭제합니다.\n\n` +
        `· 이 작업자의 근무기록도 함께 삭제됩니다.\n` +
        `· 되돌릴 수 없습니다.\n\n정말 삭제하시겠습니까?`,
    )
    if (!ok) return
    setBusy(true)
    await supabase.from('labor_workers').delete().eq('id', w.id)
    setBusy(false)
    if (editId === w.id) setEditId(null)
    onChanged()
  }

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
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
                  <th style={{ textAlign: 'right', width: 96 }}>관리</th>
                </tr>
              </thead>
              <tbody>
                {workers.map((w) =>
                  editId === w.id ? (
                    <tr key={w.id}>
                      <td>
                        <input
                          className="ctl"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          style={{ padding: '5px 8px', fontSize: 12 }}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          className="ctl"
                          value={editRate}
                          onChange={(e) => setEditRate(Number(e.target.value))}
                          style={{ padding: '5px 8px', fontSize: 12, textAlign: 'right' }}
                        />
                      </td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button className="btn pri" style={{ padding: '4px 7px', fontSize: 11 }} onClick={() => saveEdit(w.id)} disabled={busy || !editName.trim()}>
                          저장
                        </button>
                        <button className="btn sec" style={{ padding: '4px 7px', fontSize: 11, marginLeft: 3 }} onClick={cancelEdit} disabled={busy}>
                          취소
                        </button>
                      </td>
                    </tr>
                  ) : (
                    <tr key={w.id}>
                      <td className="t-title">{w.name}</td>
                      <td className="tnum" style={{ textAlign: 'right' }}>
                        {won(w.day_rate)}원
                      </td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button className="btn sec" style={{ padding: '4px 7px', fontSize: 11 }} onClick={() => startEdit(w)} disabled={busy}>
                          수정
                        </button>
                        <button className="btn danger-txt" style={{ padding: '4px 5px', fontSize: 11, marginLeft: 2 }} onClick={() => removeWorker(w)} disabled={busy}>
                          삭제
                        </button>
                      </td>
                    </tr>
                  ),
                )}
                {workers.length === 0 && <EmptyRow cols={3} text="등록된 작업자가 없습니다." />}
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

const DEPT_WORK_OPTS: [string, string][] = [
  ['art', '미술'],
  ['management', '경영'],
  ['product', '상품'],
  ['promotion', '홍보'],
  ['experience', '체험'],
  ['education', '교육'],
]
function deptLabel(key: string | null): string {
  const m: Record<string, string> = Object.fromEntries(DEPT_WORK_OPTS)
  return key ? m[key] ?? '' : ''
}

// ===================== 급여 =====================
/** 상태 배지 색상 (작성중 → 상신완료 → 지급완료) */
function payStatusBadge(status: string) {
  const cls = status === '지급완료' ? 'badge green' : status === '상신완료' ? 'badge gold' : 'badge'
  return <span className={cls} style={{ fontSize: 10 }}>{status}</span>
}

function PayView({ empById }: { empById: Record<string, { name: string; dept: string }> }) {
  // 급여는 전월분을 이번 달에 지급 → 기본 귀속월 = 전월 (예: 11월이면 10월 급여)
  const [ym, setYm] = useState(prevMonth())
  const payMonths = useMemo(() => payrollMonths(6), [])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [submitOpen, setSubmitOpen] = useState(false)

  const runQ = useQuery<PayrollRun[]>(
    async () => await supabase.from('payroll_runs').select('*').eq('ym', ym),
    [ym],
  )
  const run = runQ.data?.[0]
  const status = run?.status ?? '작성중'
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
    // 기존 대장(명세 있음)이면 덮어쓰기 경고
    if (slips.length > 0) {
      const ok = window.confirm(
        `${ym} 급여대장이 이미 ${slips.length}명 작성되어 있습니다.\n전월 복사는 작성중 대장이 비어 있을 때만 가능합니다. 계속하시겠습니까?`,
      )
      if (!ok) return
    }
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

  // 전 직원 명세서 발송 — 각 급여 행을 payslips 에 발급(발송)하고 지급완료로.
  async function sendSlips() {
    if (!run || slips.length === 0) return
    const ok = window.confirm(`전 직원 ${slips.length}명에게 ${ym} 급여명세서를 발송하시겠습니까?`)
    if (!ok) return
    setBusy(true)
    setMsg(null)
    const payDate = `${ym}-25`
    // 급여 행(지급·공제 6항목·실지급액)을 payslips 로 발급. pay_date 기록 = 발송 처리.
    // run_id+employee_id 유니크 → upsert 로 기존 행에도 안전하게 반영(유일 생성 경로).
    const rows = slips.map((s) => ({
      run_id: run.id,
      employee_id: s.employee_id,
      base_pay: s.base_pay,
      allowances: s.allowances,
      d_pension: s.d_pension,
      d_health: s.d_health,
      d_ltc: s.d_ltc,
      d_employment: s.d_employment,
      d_income_tax: s.d_income_tax,
      d_local_tax: s.d_local_tax,
      d_other: s.d_other,
      pay_date: payDate,
    }))
    const { error: upErr } = await supabase
      .from('payslips')
      .upsert(rows, { onConflict: 'run_id,employee_id' })
    if (upErr) {
      setBusy(false)
      setMsg(upErr.message)
      return
    }
    const { error: stErr } = await supabase
      .from('payroll_runs')
      .update({ status: '지급완료', paid_at: new Date().toISOString() })
      .eq('id', run.id)
    setBusy(false)
    if (stErr) {
      setMsg(stErr.message)
    } else {
      setMsg(`전 직원 ${slips.length}명에게 ${ym} 급여명세서를 발송했습니다. (지급일 ${payDate})`)
      runQ.reload()
      slipsQ.reload()
    }
  }

  const canSubmit = status === '작성중' && slips.length > 0
  const canSend = (status === '상신완료' || status === '지급완료') && slips.length > 0
  const showCopy = status === '작성중'

  return (
    <section className="panel">
      <ErrorBanner error={runQ.error} table="payroll_runs" />
      <div className="panel-h">
        <div>
          <h2>
            급여대장 <span className="count">{slipsQ.loading ? '…' : slips.length}</span>
          </h2>
          <p>
            {ym} 귀속(익월 지급) · {payStatusBadge(status)} · 전 직원 급여를 한 표로 관리 · 지출결의서 일괄 상신
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <select className="sel" value={ym} onChange={(e) => setYm(e.target.value)}>
            {payMonths.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          {showCopy && (
            <button className="btn sec" onClick={copyPrev} disabled={busy}>
              {busy ? '복사 중…' : '전월 급여 복사'}
            </button>
          )}
        </div>
      </div>

      {msg && (
        <div className={`login-alert ${msg.includes('복사') || msg.includes('발송') ? 'warn' : 'err'}`} style={{ margin: '0 0 12px' }}>
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

      {slips.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginTop: 14, flexWrap: 'wrap' }}>
          <div className="sec-mini" style={{ margin: 0 }}>
            {status === '상신완료' ? (
              <>지급총액 <b>₩{won(tNet)}</b> · 지출결의서 상신됨 → <b>회계 › 접수 대기</b> 반영 후 명세서를 발송하세요.</>
            ) : status === '지급완료' ? (
              <>지급총액 <b>₩{won(tNet)}</b> · <b style={{ color: 'var(--brand)' }}>회계처리 완료</b> → 각 직원에게 급여명세서를 발송하세요(본인만 열람).</>
            ) : (
              <>지급총액 <b>₩{won(tNet)}</b> · 전 직원 급여를 <b>지출결의서 1건</b>으로 묶어 상신합니다.</>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {canSend && (
              <button className="btn sec" onClick={sendSlips} disabled={busy}>
                {busy ? '발송 중…' : '전 직원 명세서 발송'}
              </button>
            )}
            <button
              className="btn pri"
              disabled={!canSubmit || busy}
              style={{ opacity: canSubmit ? 1 : 0.45, cursor: canSubmit ? 'pointer' : 'not-allowed' }}
              onClick={() => setSubmitOpen(true)}
            >
              {status === '상신완료' ? '상신 완료 · 회계 승인 대기' : '지출결의서 일괄 상신 →'}
            </button>
          </div>
        </div>
      )}

      {submitOpen && run && (
        <PaySubmitModal
          ym={ym}
          runId={run.id}
          count={slips.length}
          total={tNet}
          onClose={() => setSubmitOpen(false)}
          onSubmitted={(m) => {
            setSubmitOpen(false)
            setMsg(m)
            runQ.reload()
            slipsQ.reload()
          }}
        />
      )}
    </section>
  )
}

// ===================== 급여 지출결의서 일괄 상신 모달 =====================
function PaySubmitModal({
  ym,
  runId,
  count,
  total,
  onClose,
  onSubmitted,
}: {
  ym: string
  runId: string
  count: number
  total: number
  onClose: () => void
  onSubmitted: (msg: string) => void
}) {
  const { me } = useAuth()
  const [title, setTitle] = useState(`${ym} 급여 지급`)
  const [account, setAccount] = useState('급여 (판매관리비)')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // 결재선 안내용 담당자 이름 (기안 이윤정 → 검토 김성헌 → 승인 김도래). 실제 id 는 null 허용.
  const lineQ = useQuery<Pick<Employee, 'id' | 'name' | 'title'>[]>(
    async () =>
      await supabase
        .from('employees')
        .select('id,name,title')
        .in('name', ['이윤정', '김성헌', '김도래'])
        .eq('status', '재직'),
    [],
  )
  const byName = useMemo(() => {
    const m: Record<string, { id: string; name: string }> = {}
    for (const e of lineQ.data ?? []) m[e.name] = { id: e.id, name: e.name }
    return m
  }, [lineQ.data])

  async function submit() {
    setBusy(true)
    setErr(null)
    const docNo = `제${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000)}호`
    // 1) 전자결재 지출결의서 1건 (kind:지출결의서, amount:급여총액, memo:'{월} 급여 N인')
    const { data: appr, error } = await supabase
      .from('approvals')
      .insert({
        doc_no: docNo,
        kind: '지출결의서',
        drafter_id: me?.id ?? null,
        biz_code: '법인',
        dept_key: 'management',
        title: title.trim() || `${ym} 급여 지급`,
        amount: total,
        account: account || null,
        memo: `${ym} 급여 ${count}인`,
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

    // 2) 결재선: 기안(이윤정/본인, 승인) → 검토(김성헌) → 승인(김도래) → 회계접수. id 는 null 허용.
    const drafter = byName['이윤정']?.id ?? me?.id ?? null
    const reviewer = byName['김성헌']?.id ?? null
    const approver = byName['김도래']?.id ?? null
    const lns = [
      { approval_id: appr.id, seq: 1, approver_id: drafter, role: '기안' as const, decided: '승인' },
      { approval_id: appr.id, seq: 2, approver_id: reviewer, role: '승인' as const, decided: '대기' },
      { approval_id: appr.id, seq: 3, approver_id: approver, role: '승인' as const, decided: '대기' },
      { approval_id: appr.id, seq: 4, approver_id: null, role: '회계접수' as const, decided: '대기' },
    ]
    await supabase.from('approval_lines').insert(lns)

    // 3) payroll_runs.status = '상신완료'
    const { error: stErr } = await supabase
      .from('payroll_runs')
      .update({ status: '상신완료', submitted_at: new Date().toISOString() })
      .eq('id', runId)
    setBusy(false)
    if (stErr) {
      setErr(stErr.message)
      return
    }
    onSubmitted(
      `✓ ${docNo} · ${ym} 급여 지급 지출결의서를 상신했습니다(₩${won(total)}, ${count}인). ` +
        `→ 전자결재 승인 후 회계 › 접수 대기로 이동합니다.`,
    )
  }

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="mh">
          <div>
            <div className="eyebrow">노무 · 급여 지출결의</div>
            <h3>지출결의서 일괄 상신</h3>
          </div>
          <button className="x" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="mb">
          <div className="field-grid" style={{ gridTemplateColumns: 'repeat(2,1fr)', gap: 10 }}>
            <div className="field">
              <div className="fl">문서번호</div>
              <div className="fv">상신 시 자동 발번</div>
            </div>
            <div className="field">
              <div className="fl">귀속월</div>
              <div className="fv">{ym}</div>
            </div>
            <div className="field">
              <div className="fl">대상 인원</div>
              <div className="fv tnum">{count}명</div>
            </div>
            <div className="field">
              <div className="fl">지급 총액</div>
              <div className="fv tnum" style={{ color: 'var(--brand)', fontWeight: 800 }}>
                ₩{won(total)}
              </div>
            </div>
          </div>
          <div className="mfield">
            <label>적요</label>
            <input className="ctl" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="mfield">
            <label>계정과목</label>
            <select className="ctl" value={account} onChange={(e) => setAccount(e.target.value)}>
              <option value="급여 (판매관리비)">급여 (판매관리비)</option>
              <option value="임금 (제조원가)">임금 (제조원가)</option>
            </select>
          </div>
          <div className="mfield">
            <label>결재선</label>
            <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center' }}>
              <span className="badge">기안 이윤정</span>
              <span style={{ color: 'var(--muted)' }}>→</span>
              <span className="badge">검토 김성헌</span>
              <span style={{ color: 'var(--muted)' }}>→</span>
              <span className="badge gold">승인 김도래</span>
              <span style={{ color: 'var(--muted)' }}>→</span>
              <span className="badge green">회계접수 담당</span>
            </div>
          </div>
          <div className="sec-mini" style={{ margin: '4px 0 0' }}>
            <b>상신하면 자동으로:</b> ① 전자결재에 지출결의서 1건 등록(급여 명세 첨부) ② 최종 승인 시 <b>회계 › 접수 대기</b>로 이동 ③ 담당자 접수 시 장부에 <b>급여 지출</b>로 반영 — 개별 직원 전표가 아니라 <b>월 급여 1건</b>으로 처리됩니다.
          </div>
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

// ===================== 휴가 현황 =====================
// 연차 소진 계산(ANNUAL_DEDUCT)·입사일 기준 자동 부여(grantedAnnual)는 ./leave 로 분리.
// (노무 대시보드와 동일 로직을 공유 — 이 뷰의 집계 규칙은 변경하지 않는다.)

function LeaveView({ empById }: { empById: Record<string, { name: string; dept: string; join: string | null; empType: string | null }> }) {
  const [q, setQ] = useState('')
  const leaveQ = useQuery<LeaveRecord[]>(
    async () => await supabase.from('leave_records').select('*').order('start_date', { ascending: false }),
    [],
  )
  // '이월' 전용 레코드는 집계/표시용이 아니라 이월값 저장용 → 내역 목록에서 제외
  const records = (leaveQ.data ?? []).filter((r) => r.leave_type !== '이월')

  // 직원별 집계
  //  - 이월(carry_over): 전체 레코드('이월' 전용 레코드 포함)의 최대값(직원당 1개 값)
  //  - 연차사용: '승인'된 연차 차감 유형(연차/반차/월차/휴가)의 days 합
  //  - 대체 등 비차감: 승인된 대체휴무/대체반차/병가/생일휴무 등의 days 합(참고 표시)
  const byEmp = useMemo(() => {
    const m: Record<string, { carry: number; annualUsed: number; otherUsed: number }> = {}
    const ensure = (id: string) => (m[id] ??= { carry: 0, annualUsed: 0, otherUsed: 0 })
    // 이월은 '이월' 레코드 포함 전체에서 계산
    for (const r of leaveQ.data ?? []) {
      ensure(r.employee_id).carry = Math.max(m[r.employee_id].carry, Number(r.carry_over) || 0)
    }
    // 사용은 '이월' 제외한 실제 휴가에서 계산
    for (const r of records) {
      if (r.status !== '승인') continue
      const d = Number(r.days) || 0
      if (ANNUAL_DEDUCT.has(r.leave_type)) ensure(r.employee_id).annualUsed += d
      else ensure(r.employee_id).otherUsed += d
    }
    return m
  }, [records, leaveQ.data])

  // 연차는 정규직만 대상. 정규직 재직자만 표시(휴가 기록 없어도 0으로). 입사 순서 정렬.
  // 입사일 없는 직원은 뒤로, 같으면 이름순.
  const emptySlot = { carry: 0, annualUsed: 0, otherUsed: 0 }
  const allEmps = useMemo(
    () =>
      Object.entries(empById)
        .filter(([, e]) => e.empType === '정규직')
        .map(([id, e]) => ({ id, name: e.name, dept: e.dept, join: e.join }))
        .sort((a, b) => {
          if (a.join && b.join) return a.join < b.join ? -1 : a.join > b.join ? 1 : a.name.localeCompare(b.name)
          if (a.join) return -1
          if (b.join) return 1
          return a.name.localeCompare(b.name)
        }),
    [empById],
  )

  return (
    <section className="panel">
      <ErrorBanner error={leaveQ.error} table="leave_records" />
      <div className="panel-h">
        <div>
          <h2>
            휴가현황 <span className="count">{allEmps.length}</span>
          </h2>
        </div>
      </div>
      <div className="tbl-wrap">
        <table>
          <thead>
            <tr>
              <th>직원</th>
              <th>부서</th>
              <th style={{ textAlign: 'right' }}>이월</th>
              <th style={{ textAlign: 'right' }}>부여</th>
              <th style={{ textAlign: 'right' }}>연차 사용</th>
              <th style={{ textAlign: 'right' }}>잔여</th>
              <th style={{ textAlign: 'right' }}>대체·기타</th>
            </tr>
          </thead>
          <tbody>
            {leaveQ.loading && <LoadingRow cols={7} />}
            {!leaveQ.loading &&
              allEmps.map((e) => {
                const a = byEmp[e.id] ?? emptySlot
                const { granted, basis } = grantedAnnual(e.join)
                const rem = a.carry + granted - a.annualUsed
                return (
                  <tr key={e.id}>
                    <td className="t-title">{e.name}</td>
                    <td>{e.dept}</td>
                    <td className="tnum" style={{ textAlign: 'right' }}>
                      {a.carry}
                    </td>
                    <td className="tnum" style={{ textAlign: 'right' }} title={basis}>
                      {granted}
                    </td>
                    <td className="tnum" style={{ textAlign: 'right' }}>
                      {a.annualUsed}
                    </td>
                    <td className="tnum" style={{ textAlign: 'right', fontWeight: 800, color: rem < 0 ? 'var(--danger)' : 'var(--brand)' }}>
                      {rem}
                    </td>
                    <td className="tnum" style={{ textAlign: 'right', color: 'var(--muted)' }}>
                      {a.otherUsed || '—'}
                    </td>
                  </tr>
                )
              })}
            {!leaveQ.loading && allEmps.length === 0 && (
              <EmptyRow cols={7} text="재직 직원이 없습니다." />
            )}
          </tbody>
        </table>
      </div>
      <p className="sec-mini" style={{ marginTop: 10 }}>
        <b>부여</b>는 입사일 기준 자동 계산: 입사 1년 미만은 월 1개(최대 11), 1년 이상은 15개 + 입사 2년 이후 2년마다 +1. (숫자에 마우스를 올리면 산정 근거 표시)
        <br />연차 사용 = 연차·반차·월차 등 연차 차감 유형의 승인 일수. <b>대체휴무·대체반차·병가·생일휴무는 연차에서 차감되지 않습니다</b>(대체·기타 열). 잔여 = 이월 + 부여 − 연차 사용.
      </p>
      {/* 휴가 사용 내역 — 이름 검색 */}
      {records.length > 0 && (() => {
        const kw = q.trim().toLowerCase()
        const matched = records.filter((r) =>
          !kw || (empById[r.employee_id]?.name ?? '').toLowerCase().includes(kw),
        )
        // 검색 중이면 전체, 아니면 최근 5건
        const list = kw ? matched : matched.slice(0, 5)
        return (
          <>
            <div className="toolbar" style={{ marginTop: 16 }}>
              <div className="t" style={{ fontWeight: 700 }}>
                {kw ? <>검색 결과 <span className="count">{matched.length}</span></> : '최근 내역'}
              </div>
              <label className="search r" style={{ marginLeft: 'auto' }}>
                <svg className="icon" width="16" height="16" viewBox="0 0 24 24">
                  <circle cx="11" cy="11" r="7" />
                  <path d="M21 21l-4-4" />
                </svg>
                <input
                  placeholder="이름으로 검색 (예: 이윤정)"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </label>
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
                  {list.map((r) => (
                    <tr key={r.id}>
                      <td className="t-title">{empById[r.employee_id]?.name ?? '—'}</td>
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
                  {list.length === 0 && <EmptyRow cols={5} text="해당 이름의 휴가 내역이 없습니다." />}
                </tbody>
              </table>
            </div>
            {!kw && matched.length > 5 && (
              <p className="sec-mini" style={{ marginTop: 8 }}>
                최근 5건만 표시 중 · 이름을 검색하면 그 직원의 전체 휴가 내역을 볼 수 있어요.
              </p>
            )}
          </>
        )
      })()}
    </section>
  )
}
