import { useMemo, useState } from 'react'
import { PageHead } from '../components/PageHead'
import { ErrorBanner } from '../components/States'
import { supabase } from '../lib/supabase'
import { useQuery } from '../lib/useQuery'
import { useAuth } from '../lib/auth'
import { dateOnly } from '../lib/format'
import type { GotganEvent, LeaveRecord, Employee, WorkTask } from '../types/db'

const WD = ['일', '월', '화', '수', '목', '금', '토']

// 영역 → 색상/라벨
const AREA_COLOR: Record<string, { c: string; t: string }> = {
  art: { c: 'var(--ar-art)', t: '미술' },
  management: { c: 'var(--ar-manage)', t: '경영' },
  product: { c: 'var(--ar-product)', t: '상품' },
  promotion: { c: 'var(--ar-promo)', t: '홍보' },
  experience: { c: 'var(--ar-exp)', t: '체험' },
  education: { c: 'var(--ar-edu)', t: '교육' },
  leave: { c: 'var(--ar-leave)', t: '휴가' },
  personal: { c: '#536c84', t: '개인' },
}

// 범례 노출 순서 (시안과 동일) — 6개 부서는 이 달 일정 유무와 무관하게 항상 표시,
// 그 뒤에 휴가·개인. '전체' 버튼은 별도로 맨 앞에 둔다.
const LEGEND_ORDER = ['management', 'art', 'product', 'promotion', 'experience', 'education', 'leave', 'personal']

// 캘린더 표시용 통합 이벤트 (events + 승인된 휴가)
interface CalItem {
  id: string
  area: string | null
  title: string
}

export default function Calendar() {
  const { me } = useAuth()
  const today = new Date()
  const [ym, setYm] = useState({ y: today.getFullYear(), m: today.getMonth() + 1 })
  const [filters, setFilters] = useState<string[]>([])
  const [addOpen, setAddOpen] = useState(false)

  const lastDay = new Date(ym.y, ym.m, 0).getDate()
  const monthStart = `${ym.y}-${String(ym.m).padStart(2, '0')}-01`
  const monthEnd = `${ym.y}-${String(ym.m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

  const evQ = useQuery<GotganEvent[]>(
    async () =>
      await supabase
        .from('events')
        .select('*')
        .gte('date', monthStart)
        .lte('date', monthEnd),
    [monthStart],
  )
  const events = evQ.data ?? []

  // 승인된 휴가 → 캘린더 자동표시 (기간이 이번 달과 겹치는 건)
  const leaveQ = useQuery<LeaveRecord[]>(
    async () =>
      await supabase
        .from('leave_records')
        .select('*')
        .eq('status', '승인')
        .lte('start_date', monthEnd)
        .gte('end_date', monthStart),
    [monthStart],
  )
  // 부서별 업무현황 → 달력에 업무 기간(start~due)을 영역 색상으로 표시
  const taskQ = useQuery<WorkTask[]>(
    async () =>
      await supabase
        .from('work_tasks')
        .select('*')
        .lte('start_date', monthEnd)
        .gte('due_date', monthStart),
    [monthStart],
  )
  const empQ = useQuery<Pick<Employee, 'id' | 'name'>[]>(
    async () => await supabase.from('employees').select('id,name'),
    [],
  )
  const empName = useMemo(() => {
    const m: Record<string, string> = {}
    for (const e of empQ.data ?? []) m[e.id] = e.name
    return m
  }, [empQ.data])

  // 날짜별 이벤트 맵 (events + 승인 휴가 전개)
  const byDay = useMemo(() => {
    const m: Record<number, CalItem[]> = {}
    for (const e of events) {
      const d = parseInt(dateOnly(e.date).slice(8, 10), 10)
      ;(m[d] ??= []).push({ id: e.id, area: e.area, title: e.title })
    }
    // 부서별 업무현황: start_date~due_date 범위를 이번 달 안에서 하루씩 전개(영역 색상)
    for (const tk of taskQ.data ?? []) {
      const s = dateOnly(tk.start_date)
      const e = dateOnly(tk.due_date)
      if (!s || !e) continue
      const from = new Date(Math.max(+new Date(s), +new Date(monthStart)))
      const to = new Date(Math.min(+new Date(e), +new Date(monthEnd)))
      if (+from > +to) continue
      for (let t = +from; t <= +to; t += 86_400_000) {
        const d = new Date(t).getDate()
        ;(m[d] ??= []).push({ id: `tk-${tk.id}-${d}`, area: tk.area, title: tk.title })
      }
    }
    // 승인된 휴가: start~end 범위를 이번 달 안에서 하루씩 전개
    for (const lv of leaveQ.data ?? []) {
      const s = dateOnly(lv.start_date)
      const e = dateOnly(lv.end_date)
      if (!s || !e) continue
      const nm = lv.employee_id ? empName[lv.employee_id] ?? '' : ''
      const title = `${nm ? nm + ' ' : ''}${lv.leave_type || '휴가'}`
      const from = new Date(Math.max(+new Date(s), +new Date(monthStart)))
      const to = new Date(Math.min(+new Date(e), +new Date(monthEnd)))
      for (let t = +from; t <= +to; t += 86_400_000) {
        const d = new Date(t).getDate()
        ;(m[d] ??= []).push({ id: `lv-${lv.id}-${d}`, area: 'leave', title })
      }
    }
    return m
  }, [events, taskQ.data, leaveQ.data, empName, monthStart, monthEnd])

  const firstDow = new Date(ym.y, ym.m - 1, 1).getDay()
  const daysInMonth = new Date(ym.y, ym.m, 0).getDate()
  const isThisMonth = ym.y === today.getFullYear() && ym.m === today.getMonth() + 1
  const todayDate = today.getDate()

  // 범례: 6개 부서 + 휴가·개인을 시안처럼 항상 모두 표시(이 달 일정 유무와 무관).
  const legendAreas = LEGEND_ORDER

  const toggleFilter = (k: string) => {
    if (k === '') setFilters([])
    else setFilters((f) => (f.includes(k) ? f.filter((x) => x !== k) : [...f, k]))
  }

  const prevMonth = () => setYm((s) => (s.m === 1 ? { y: s.y - 1, m: 12 } : { y: s.y, m: s.m - 1 }))
  const nextMonth = () => setYm((s) => (s.m === 12 ? { y: s.y + 1, m: 1 } : { y: s.y, m: s.m + 1 }))

  const cells: (number | null)[] = []
  for (let i = 0; i < firstDow; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  return (
    <div className="page on">
      <PageHead
        eyebrow="OUR DAYS, TOGETHER"
        title="일정표"
        desc="부서별·개인별 일정을 색상으로 구분해 확인하세요."
        actions={
          <button className="btn pri" onClick={() => setAddOpen(true)}>
            + 개인 일정 등록
          </button>
        }
      />
      <section className="panel">
        <ErrorBanner error={evQ.error} table="events" />
        <ErrorBanner error={taskQ.error} table="work_tasks" />
        <ErrorBanner error={leaveQ.error} table="leave_records" />
        <div className="panel-h" style={{ alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button className="btn sec" style={{ padding: '4px 10px' }} onClick={prevMonth}>
              ‹
            </button>
            <h2 style={{ minWidth: 120, textAlign: 'center' }}>
              {ym.y}년 {ym.m}월
            </h2>
            <button className="btn sec" style={{ padding: '4px 10px' }} onClick={nextMonth}>
              ›
            </button>
          </div>
          {/* 범례 */}
          <div className="cal-legend" id="cal-legend-row" style={{ marginTop: 0 }}>
            <button
              className={`leg${filters.length === 0 ? ' on' : ''}`}
              data-k=""
              onClick={() => toggleFilter('')}
            >
              전체
            </button>
            {legendAreas.map((k) => {
              const a = AREA_COLOR[k]
              if (!a) return null
              const active = filters.includes(k)
              return (
                <button
                  key={k}
                  className={`leg${active ? ' on' : ''}`}
                  data-k={k}
                  onClick={() => toggleFilter(k)}
                  style={{ opacity: filters.length && !active ? 0.4 : 1 }}
                >
                  <i style={{ background: a.c }} />
                  {a.t}
                </button>
              )
            })}
          </div>
        </div>

        <div className="cal" id="cal-grid" style={{ marginTop: 14 }}>
          {WD.map((d) => (
            <div className="wd" key={d}>
              {d}
            </div>
          ))}
          {cells.map((d, i) => {
            if (d === null) return <div className="d out" key={`o${i}`} />
            const evs = (byDay[d] ?? []).filter((e) => !filters.length || (e.area && filters.includes(e.area)))
            const isToday = isThisMonth && d === todayDate
            return (
              <div className={`d${isToday ? ' today' : ''}`} key={d}>
                <span className="n">
                  {d}
                  {isToday && <span style={{ fontSize: 8, color: 'var(--brand)' }}> 오늘</span>}
                </span>
                {evs.map((e) => (
                  <span
                    key={e.id}
                    className="ev"
                    style={{ background: e.area ? AREA_COLOR[e.area]?.c ?? 'var(--brand)' : 'var(--brand)' }}
                  >
                    {e.title}
                  </span>
                ))}
              </div>
            )
          })}
        </div>
      </section>

      {addOpen && (
        <PersonalEventModal
          employeeId={me?.id ?? null}
          defaultMonth={ym}
          onClose={() => setAddOpen(false)}
          onCreated={() => {
            setAddOpen(false)
            evQ.reload()
          }}
        />
      )}
    </div>
  )
}

/** 개인 일정 등록 — events 테이블에 area:'personal' 로 insert */
function PersonalEventModal({
  employeeId,
  defaultMonth,
  onClose,
  onCreated,
}: {
  employeeId: string | null
  defaultMonth: { y: number; m: number }
  onClose: () => void
  onCreated: () => void
}) {
  // 기본 날짜: 현재 보고 있는 달의 1일(또는 오늘이 그 달이면 오늘)
  const today = new Date()
  const isCur = defaultMonth.y === today.getFullYear() && defaultMonth.m === today.getMonth() + 1
  const defaultDate = isCur
    ? `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    : `${defaultMonth.y}-${String(defaultMonth.m).padStart(2, '0')}-01`

  const [title, setTitle] = useState('')
  const [date, setDate] = useState(defaultDate)
  const [memo, setMemo] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function submit() {
    if (!title.trim()) {
      setErr('제목을 입력하세요.')
      return
    }
    if (!date) {
      setErr('날짜를 선택하세요.')
      return
    }
    setBusy(true)
    setErr(null)
    // 메모가 있으면 제목 뒤에 덧붙여 저장 (events 에는 memo 컬럼이 없으므로 제목에 합침)
    const fullTitle = memo.trim() ? `${title.trim()} · ${memo.trim()}` : title.trim()
    const { error } = await supabase.from('events').insert({
      date,
      area: 'personal',
      title: fullTitle,
      employee_id: employeeId,
    })
    setBusy(false)
    if (error) {
      setErr(error.message)
      return
    }
    onCreated()
  }

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="mh">
          <div>
            <div className="eyebrow">개인 일정 등록</div>
            <h3>내 일정</h3>
          </div>
          <button className="x" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="mb">
          <div className="mfield">
            <label>제목</label>
            <input
              className="ctl"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="예: 오후 반차 / 병원 방문"
              autoFocus
            />
          </div>
          <div className="mfield">
            <label>날짜</label>
            <input className="ctl" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="mfield">
            <label>메모</label>
            <input
              className="ctl"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="선택 입력"
            />
          </div>
          {err && (
            <div className="login-alert err" style={{ margin: 0 }}>
              {err}
            </div>
          )}
        </div>
        <div className="mf">
          <button className="btn sec" onClick={onClose} disabled={busy}>
            취소
          </button>
          <button className="btn pri" onClick={submit} disabled={busy || !title.trim()}>
            {busy ? '등록 중…' : '등록'}
          </button>
        </div>
      </div>
    </div>
  )
}
