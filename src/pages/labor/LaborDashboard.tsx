import { useMemo } from 'react'
import { ErrorBanner } from '../../components/States'
import { supabase } from '../../lib/supabase'
import { useQuery } from '../../lib/useQuery'
import type { Employee, LeaveRecord, PayrollRun, LaborAttendance } from '../../types/db'
import { ANNUAL_DEDUCT, grantedAnnual } from './leave'

/** 노무 대시보드 — 재직 인원·휴가 사용·연차 소진·급여 지급 상태 한눈 요약.
 *  모든 수치는 기존 데이터(employees/leave_records/payroll_runs/labor_attendance)에서 파생.
 *  데이터가 비어 있어도 0/— 로 안전하게 렌더링. */

const DEPT_LABEL: Record<string, string> = {
  art: '미술',
  management: '경영',
  product: '상품',
  promotion: '홍보',
  experience: '체험',
  education: '교육',
}
function deptLabel(key: string | null): string {
  return key ? DEPT_LABEL[key] ?? '—' : '—'
}

const NOW = new Date()
const CUR_YM = `${NOW.getFullYear()}-${String(NOW.getMonth() + 1).padStart(2, '0')}`
const CUR_YEAR = String(NOW.getFullYear())

/** 재직자 입사일 해석 — Labor.tsx 와 동일(join_date 우선, 없으면 join_ym→1일) */
function resolveJoin(e: Pick<Employee, 'join_date' | 'join_ym'>): string | null {
  return (
    e.join_date ??
    (e.join_ym && /^\d{4}\.\d{2}$/.test(e.join_ym) ? e.join_ym.replace('.', '-') + '-01' : null)
  )
}

/** 실근무 시간(대시보드 근태 요약용) — 출근·퇴근·익일·휴게(분) → 시간 */
function workHours(ci: string | null, co: string | null, nextDay: boolean, breakMin: number): number {
  if (!ci || !co) return 0
  const toSec = (t: string) => {
    const [h, m, s] = t.split(':').map(Number)
    return h * 3600 + m * 60 + (s || 0)
  }
  let sec = toSec(co) - toSec(ci) + (nextDay ? 86400 : 0) - (breakMin || 0) * 60
  if (sec < 0) sec = 0
  return sec / 3600
}

function payStatusBadge(status: string) {
  const cls = status === '지급완료' ? 'badge green' : status === '상신완료' ? 'badge gold' : status === '반려' ? 'badge red' : 'badge'
  return <span className={cls} style={{ fontSize: 10 }}>{status}</span>
}

type EmpRow = Pick<Employee, 'id' | 'name' | 'dept_key' | 'join_date' | 'join_ym' | 'employment_type'>

export default function LaborDashboard() {
  const empQ = useQuery<EmpRow[]>(
    async () =>
      await supabase
        .from('employees')
        .select('id,name,dept_key,join_date,join_ym,employment_type')
        .eq('status', '재직'),
    [],
  )
  const leaveQ = useQuery<LeaveRecord[]>(
    async () => await supabase.from('leave_records').select('*'),
    [],
  )
  const runQ = useQuery<PayrollRun[]>(
    async () => await supabase.from('payroll_runs').select('*').eq('ym', CUR_YM),
    [],
  )
  const attQ = useQuery<LaborAttendance[]>(
    async () =>
      await supabase
        .from('labor_attendance')
        .select('*')
        .gte('work_date', `${CUR_YM}-01`)
        .lte('work_date', `${CUR_YM}-31`),
    [],
  )

  const emps = empQ.data ?? []
  const loading = empQ.loading || leaveQ.loading

  // 재직 인원 (정규직/기타)
  const regular = emps.filter((e) => e.employment_type === '정규직').length
  const others = emps.length - regular

  // 승인된 휴가만 집계 (LeaveView 와 동일 규칙). '이월' 전용 레코드는 사용 집계에서 제외.
  const approvedUse = useMemo(
    () => (leaveQ.data ?? []).filter((r) => r.status === '승인' && r.leave_type !== '이월'),
    [leaveQ.data],
  )

  // 이번 달 휴가 사용(승인 days 합, 시작일 기준)
  const monthDays = approvedUse
    .filter((r) => (r.start_date ?? '').slice(0, 7) === CUR_YM)
    .reduce((a, r) => a + (Number(r.days) || 0), 0)

  // 유형별 집계 (이번 달 / 올해)
  const byType = useMemo(() => {
    const month: Record<string, number> = {}
    const year: Record<string, number> = {}
    for (const r of approvedUse) {
      const ym = (r.start_date ?? '').slice(0, 7)
      const yr = (r.start_date ?? '').slice(0, 4)
      const d = Number(r.days) || 0
      if (yr === CUR_YEAR) year[r.leave_type] = (year[r.leave_type] ?? 0) + d
      if (ym === CUR_YM) month[r.leave_type] = (month[r.leave_type] ?? 0) + d
    }
    return { month, year }
  }, [approvedUse])

  // 직원별 연차 집계 (정규직 대상) — 이월/연차사용. 잔여 = 이월 + 부여 − 연차사용.
  const annualRows = useMemo(() => {
    // 이월: '이월' 레코드 포함 전체에서 직원당 최대값
    const carry: Record<string, number> = {}
    for (const r of leaveQ.data ?? []) {
      carry[r.employee_id] = Math.max(carry[r.employee_id] ?? 0, Number(r.carry_over) || 0)
    }
    // 연차 사용: 승인 + 연차차감 유형 days 합
    const used: Record<string, number> = {}
    for (const r of approvedUse) {
      if (ANNUAL_DEDUCT.has(r.leave_type)) used[r.employee_id] = (used[r.employee_id] ?? 0) + (Number(r.days) || 0)
    }
    return emps
      .filter((e) => e.employment_type === '정규직')
      .map((e) => {
        const g = grantedAnnual(resolveJoin(e)).granted
        const c = carry[e.id] ?? 0
        const u = used[e.id] ?? 0
        const total = c + g
        return {
          id: e.id,
          name: e.name,
          dept: deptLabel(e.dept_key),
          total,
          used: u,
          remain: total - u,
          rate: total > 0 ? Math.round((u / total) * 100) : 0,
        }
      })
  }, [emps, approvedUse, leaveQ.data])

  // 전 정규직 연차 소진률 평균(부여 총합 대비 사용 총합)
  const totGrant = annualRows.reduce((a, r) => a + r.total, 0)
  const totUsed = annualRows.reduce((a, r) => a + r.used, 0)
  const burnRate = totGrant > 0 ? Math.round((totUsed / totGrant) * 100) : 0

  // 연차 소진 주의 — 잔여가 적은 순 상위 5명(촉진 관점). 부여가 있는 직원만.
  const watch = useMemo(
    () =>
      [...annualRows]
        .filter((r) => r.total > 0)
        .sort((a, b) => a.remain - b.remain || b.total - a.total)
        .slice(0, 5),
    [annualRows],
  )

  // 급여 지급 상태 (이번 달 귀속)
  const run = runQ.data?.[0]
  const payStatus = run?.status ?? '미작성'

  // 근태 요약 (이번 달 일용직)
  const attRows = attQ.data ?? []
  const attCount = attRows.length
  const attHours = attRows.reduce((a, r) => a + workHours(r.check_in, r.check_out, r.next_day, r.break_min), 0)

  const curMonthLabel = `${parseInt(CUR_YM.slice(5), 10)}월`

  return (
    <>
      <ErrorBanner error={empQ.error} table="employees" />

      {/* KPI 카드 */}
      <div className="stats">
        <Kpi
          lbl="재직 인원"
          val={`${emps.length}`}
          unit="명"
          sub={loading ? '불러오는 중…' : `정규직 ${regular} · 기타 ${others}`}
        />
        <Kpi
          lbl={`${curMonthLabel} 휴가 사용`}
          val={`${+monthDays.toFixed(1)}`}
          unit="일"
          color="var(--brand)"
          sub="승인된 휴가 합계"
        />
        <Kpi
          lbl="연차 소진률"
          val={`${burnRate}`}
          unit="%"
          color={burnRate >= 70 ? 'var(--ok)' : burnRate >= 40 ? 'var(--brand)' : 'var(--gold)'}
          sub={totGrant > 0 ? `사용 ${+totUsed.toFixed(1)} / 부여 ${+totGrant.toFixed(1)}` : '정규직 평균'}
        />
        <Kpi
          lbl={`${curMonthLabel} 급여`}
          val=""
          badge={payStatusBadge(payStatus)}
          sub={payStatus === '미작성' ? '대장 미작성' : `귀속 ${CUR_YM}`}
        />
      </div>

      <div className="labor-dash-grid">
        {/* 휴가 유형별 사용 요약 */}
        <section className="panel">
          <div className="panel-h">
            <div>
              <h2>휴가 사용 요약</h2>
            </div>
            <span className="count" style={{ marginLeft: 'auto' }}>{CUR_YEAR}년</span>
          </div>
          <LeaveTypeTable month={byType.month} year={byType.year} monthLabel={curMonthLabel} />
        </section>

        {/* 연차 소진 주의 */}
        <section className="panel">
          <div className="panel-h">
            <div>
              <h2>연차 소진 주의</h2>
            </div>
            <span className="count" style={{ marginLeft: 'auto' }}>잔여 적은 순</span>
          </div>
          <WatchList rows={watch} loading={loading} />
          <p className="dash-note">
            연차는 입사일 기준 자동 부여(정규직)되며, 미사용 잔여가 많은 직원은 연차 촉진 대상입니다.
            잔여 = 이월 + 부여 − 승인 연차.
          </p>
        </section>
      </div>

      {/* 근태 요약 */}
      <section className="panel" style={{ marginTop: 14 }}>
        <div className="panel-h">
          <div>
            <h2>{curMonthLabel} 근태 요약 <span className="count">일용직</span></h2>
          </div>
        </div>
        <div className="ops-stats" style={{ marginBottom: 0 }}>
          <div className="s">
            <small>근무 건수</small>
            <b className="tnum">{attQ.loading ? '…' : `${attCount}건`}</b>
          </div>
          <div className="s">
            <small>총 실근무시간</small>
            <b className="tnum">{attQ.loading ? '…' : `${attHours.toFixed(1)}시간`}</b>
          </div>
          <div className="s">
            <small>평균 1건당</small>
            <b className="tnum">{attCount > 0 ? `${(attHours / attCount).toFixed(1)}시간` : '—'}</b>
          </div>
        </div>
        {!attQ.loading && attCount === 0 && (
          <p className="dash-note">이번 달 일용직 근무기록이 없습니다. (근무기록 탭에서 입력)</p>
        )}
      </section>
    </>
  )
}

function Kpi({
  lbl,
  val,
  unit,
  color,
  badge,
  sub,
}: {
  lbl: string
  val: string
  unit?: string
  color?: string
  badge?: React.ReactNode
  sub?: string
}) {
  return (
    <div className="stat">
      <div>
        <div className="lbl" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span>{lbl}</span>
          {badge}
        </div>
        <div className="val tnum" style={color ? { color } : undefined}>
          {val}
          {unit && val !== '' && <small>{unit}</small>}
        </div>
        {sub && <div className="sub">{sub}</div>}
      </div>
    </div>
  )
}

/** 휴가 유형별 사용 집계 — 이번 달·올해 2열 */
function LeaveTypeTable({
  month,
  year,
  monthLabel,
}: {
  month: Record<string, number>
  year: Record<string, number>
  monthLabel: string
}) {
  // 유형 노출 순서 (연차 차감 유형 먼저, 그다음 기타)
  const ORDER = ['연차', '반차', '월차', '휴가', '대체휴무', '대체반차', '병가', '생일휴무', '경조사', '공가', '출장']
  const types = Array.from(new Set([...ORDER, ...Object.keys(year), ...Object.keys(month)])).filter(
    (t) => (year[t] ?? 0) > 0 || (month[t] ?? 0) > 0,
  )
  const yearTotal = Object.values(year).reduce((a, b) => a + b, 0)
  const monthTotal = Object.values(month).reduce((a, b) => a + b, 0)

  if (types.length === 0) {
    return <p className="dash-note" style={{ marginTop: 0 }}>올해 승인된 휴가 사용 내역이 없습니다.</p>
  }

  const max = Math.max(1, ...types.map((t) => year[t] ?? 0))

  return (
    <div className="tbl-wrap">
      <table style={{ fontSize: 12.5 }}>
        <thead>
          <tr>
            <th>유형</th>
            <th style={{ width: '42%' }}>올해 사용</th>
            <th style={{ textAlign: 'right' }}>{monthLabel}</th>
          </tr>
        </thead>
        <tbody>
          {types.map((t) => {
            const yv = year[t] ?? 0
            const mv = month[t] ?? 0
            const annual = ANNUAL_DEDUCT.has(t)
            return (
              <tr key={t}>
                <td className="t-title">
                  {t}
                  {!annual && <span className="badge" style={{ marginLeft: 6, fontSize: 9 }}>비차감</span>}
                </td>
                <td>
                  <div className="dash-bar-row">
                    <div className="dash-bar-track">
                      <div
                        className="dash-bar-fill"
                        style={{ width: `${Math.round((yv / max) * 100)}%`, background: annual ? 'var(--brand)' : 'var(--line-2)' }}
                      />
                    </div>
                    <b className="tnum" style={{ minWidth: 34, textAlign: 'right' }}>{+yv.toFixed(1)}일</b>
                  </div>
                </td>
                <td className="tnum" style={{ textAlign: 'right', color: mv > 0 ? 'var(--ink)' : 'var(--muted)' }}>
                  {mv > 0 ? `${+mv.toFixed(1)}일` : '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr style={{ background: 'var(--brand-soft)', fontWeight: 800 }}>
            <td>합계</td>
            <td className="tnum">{+yearTotal.toFixed(1)}일</td>
            <td className="tnum" style={{ textAlign: 'right' }}>{+monthTotal.toFixed(1)}일</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

/** 연차 소진 주의 리스트 */
function WatchList({
  rows,
  loading,
}: {
  rows: { id: string; name: string; dept: string; total: number; used: number; remain: number; rate: number }[]
  loading: boolean
}) {
  if (loading) return <p className="dash-note" style={{ marginTop: 0 }}>불러오는 중…</p>
  if (rows.length === 0)
    return <p className="dash-note" style={{ marginTop: 0 }}>표시할 정규직 연차 데이터가 없습니다.</p>
  return (
    <div className="tbl-wrap">
      <table style={{ fontSize: 12.5 }}>
        <thead>
          <tr>
            <th>직원</th>
            <th>부서</th>
            <th style={{ textAlign: 'right' }}>잔여</th>
            <th style={{ textAlign: 'right' }}>소진률</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="t-title">{r.name}</td>
              <td>{r.dept}</td>
              <td className="tnum" style={{ textAlign: 'right', fontWeight: 800, color: r.remain <= 3 ? 'var(--danger)' : 'var(--brand)' }}>
                {+r.remain.toFixed(1)}
              </td>
              <td className="tnum" style={{ textAlign: 'right', color: 'var(--muted)' }}>
                {r.rate}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
