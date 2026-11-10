import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
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
  // 개인일정만: 원본 이벤트(수정·삭제용)
  ev?: GotganEvent
  // 업무일정만: 원본 업무(상세 팝업용)
  task?: WorkTask
  // 휴가만: 상세 표시용
  leave?: { emp: string; type: string; start: string; end: string }
}

export default function Calendar() {
  const { me } = useAuth()
  const today = new Date()
  const [ym, setYm] = useState({ y: today.getFullYear(), m: today.getMonth() + 1 })
  const [filters, setFilters] = useState<string[]>([])
  const [addOpen, setAddOpen] = useState(false)
  // 개인일정 수정 대상 (null=닫힘)
  const [editEv, setEditEv] = useState<GotganEvent | null>(null)
  // 일정 상세 팝업 대상 (업무·휴가 등 — 읽기전용)
  const [detail, setDetail] = useState<CalItem | null>(null)

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
      ;(m[d] ??= []).push({
        id: e.id,
        area: e.area,
        title: e.title,
        ev: e.area === 'personal' ? e : undefined,
      })
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
        ;(m[d] ??= []).push({ id: `tk-${tk.id}-${d}`, area: tk.area, title: tk.title, task: tk })
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
      const leaveInfo = { emp: nm, type: lv.leave_type || '휴가', start: s, end: e }
      for (let t = +from; t <= +to; t += 86_400_000) {
        const d = new Date(t).getDate()
        ;(m[d] ??= []).push({ id: `lv-${lv.id}-${d}`, area: 'leave', title, leave: leaveInfo })
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
          <button
            className="btn txt"
            style={{ marginLeft: 'auto', color: 'var(--brand-ink)', fontWeight: 700, whiteSpace: 'nowrap', padding: '4px 6px' }}
            onClick={() => setAddOpen(true)}
          >
            + 개인일정 등록
          </button>
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
                {evs.map((e) => {
                  const clickable = !!(e.ev || e.task || e.leave)
                  const onClick = e.ev
                    ? () => setEditEv(e.ev!)
                    : e.task || e.leave
                    ? () => setDetail(e)
                    : undefined
                  return (
                    <span
                      key={e.id}
                      className="ev"
                      style={{
                        background: e.area ? AREA_COLOR[e.area]?.c ?? 'var(--brand)' : 'var(--brand)',
                        cursor: clickable ? 'pointer' : 'default',
                      }}
                      title={e.ev ? '클릭하여 수정·삭제' : clickable ? '클릭하여 상세 보기' : undefined}
                      onClick={onClick}
                    >
                      {e.title}
                    </span>
                  )
                })}
              </div>
            )
          })}
        </div>
      </section>

      {(addOpen || editEv) && (
        <PersonalEventModal
          event={editEv}
          employeeId={me?.id ?? null}
          defaultMonth={ym}
          onClose={() => {
            setAddOpen(false)
            setEditEv(null)
          }}
          onSaved={() => {
            setAddOpen(false)
            setEditEv(null)
            evQ.reload()
          }}
        />
      )}

      {detail && (
        <EventDetailModal item={detail} empName={empName} onClose={() => setDetail(null)} />
      )}
    </div>
  )
}

const TASK_ST: Record<string, string> = { plan: '예정', prog: '진행', hold: '보류', done: '완료' }
const STATUS_CLS: Record<string, string> = { plan: 'c-plan', prog: 'c-prog', hold: 'set-hold', done: 'c-done' }

/** 일정 상세 팝업 — 업무일정/휴가 (읽기전용) */
function EventDetailModal({
  item,
  empName,
  onClose,
}: {
  item: CalItem
  empName: Record<string, string>
  onClose: () => void
}) {
  const tk = item.task
  const lv = item.leave
  const kind = tk ? '업무 일정' : lv ? '휴가' : '일정'
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
        <div className="mh">
          <div>
            <div className="eyebrow">{kind} · 상세</div>
            <h3>{item.title}</h3>
          </div>
          <button className="x" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="mb">
          {tk && (
            <div className="field-grid">
              <Field l="구분" v={<span className="badge gold">{AREA_COLOR[tk.area ?? '']?.t ?? tk.dept ?? '—'}</span>} />
              <Field l="담당자" v={tk.owner_id ? empName[tk.owner_id] ?? '—' : '—'} />
              <Field l="세부분류" v={tk.detail || '—'} />
              <Field
                l="상태"
                v={<span className={`chip ${STATUS_CLS[tk.status] ?? 'c-plan'}`}><i />{TASK_ST[tk.status] ?? tk.status}</span>}
              />
              <Field l="시작일" v={dateOnly(tk.start_date) || '—'} />
              <Field l="마감일" v={dateOnly(tk.due_date) || '—'} />
              <Field l="등록일" v={dateOnly(tk.reg_date) || '—'} />
              {tk.src && <Field l="출처" v={tk.src} />}
            </div>
          )}
          {lv && (
            <div className="field-grid">
              <Field l="대상자" v={lv.emp || '—'} />
              <Field l="휴가 종류" v={lv.type} />
              <Field l="시작일" v={dateOnly(lv.start) || '—'} />
              <Field l="종료일" v={dateOnly(lv.end) || '—'} />
            </div>
          )}
        </div>
        <div className="mf">
          <button className="btn pri" onClick={onClose}>
            닫기
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ l, v }: { l: string; v: ReactNode }) {
  return (
    <div className="field">
      <div className="fl">{l}</div>
      <div className="fv">{v}</div>
    </div>
  )
}

/** 개인일정 등록·수정·삭제 — events 테이블(area:'personal') */
function PersonalEventModal({
  event,
  employeeId,
  defaultMonth,
  onClose,
  onSaved,
}: {
  event: GotganEvent | null
  employeeId: string | null
  defaultMonth: { y: number; m: number }
  onClose: () => void
  onSaved: () => void
}) {
  const editing = !!event
  // 기본 날짜: 현재 보고 있는 달의 1일(또는 오늘이 그 달이면 오늘)
  const today = new Date()
  const isCur = defaultMonth.y === today.getFullYear() && defaultMonth.m === today.getMonth() + 1
  const defaultDate = isCur
    ? `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    : `${defaultMonth.y}-${String(defaultMonth.m).padStart(2, '0')}-01`

  const [title, setTitle] = useState(event?.title ?? '')
  const [date, setDate] = useState(event ? dateOnly(event.date) : defaultDate)
  // 수정 시에는 제목에 메모가 합쳐져 저장돼 있어 메모칸은 비우고 제목 그대로 편집
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
    const { error } = editing
      ? await supabase.from('events').update({ date, title: fullTitle }).eq('id', event!.id)
      : await supabase.from('events').insert({
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
    onSaved()
  }

  async function remove() {
    if (!event) return
    if (!window.confirm(`개인일정 "${event.title}" 을(를) 삭제할까요?`)) return
    setBusy(true)
    const { error } = await supabase.from('events').delete().eq('id', event.id)
    setBusy(false)
    if (error) {
      setErr(error.message)
      return
    }
    onSaved()
  }

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="mh">
          <div>
            <div className="eyebrow">개인일정 {editing ? '수정' : '등록'}</div>
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
          {!editing && (
            <div className="mfield">
              <label>메모</label>
              <input
                className="ctl"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder="선택 입력"
              />
            </div>
          )}
          {err && (
            <div className="login-alert err" style={{ margin: 0 }}>
              {err}
            </div>
          )}
        </div>
        <div className="mf" style={{ display: 'flex', alignItems: 'center' }}>
          {editing && (
            <button
              className="btn txt"
              style={{ color: 'var(--danger)', fontWeight: 700, marginRight: 'auto' }}
              onClick={remove}
              disabled={busy}
            >
              삭제
            </button>
          )}
          <button className="btn sec" onClick={onClose} disabled={busy}>
            취소
          </button>
          <button className="btn pri" onClick={submit} disabled={busy || !title.trim()}>
            {busy ? '저장 중…' : editing ? '저장' : '등록'}
          </button>
        </div>
      </div>
    </div>
  )
}
