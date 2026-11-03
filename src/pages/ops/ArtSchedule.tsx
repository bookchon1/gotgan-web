import { useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useQuery } from '../../lib/useQuery'
import { dateOnly } from '../../lib/format'
import type { ArtProject, ProjectStep, WorkTask } from '../../types/db'

/* 업무 일정 (사업관리 상단) — 공정(project_steps) + 미술 업무(work_tasks)를 모아
   주간 / 월간 / 분기 뷰로. 시안 "업무 일정" 패널의 실데이터 버전. */

type Plan = 'week' | 'month' | 'quarter'

interface WorkItem {
  name: string
  biz: string
  start: string // YYYY-MM-DD
  end: string
  status: '완료' | '진행중' | '대기' | '보류'
  color: string
}

const STEP_STATUS: Record<string, '완료' | '진행중' | '대기' | '보류'> = {
  done: '완료',
  prog: '진행중',
  before: '대기',
  na: '보류',
}
const TASK_STATUS: Record<string, '완료' | '진행중' | '대기' | '보류'> = {
  done: '완료',
  prog: '진행중',
  plan: '대기',
}
const STWORK: Record<string, string> = {
  완료: 'c-done',
  진행중: 'c-prog',
  대기: 'c-wait',
  보류: 'set-hold',
}
const STEP_COLOR = 'var(--ar-art)'
const TASK_COLOR = '#3C6E9C'

const WD = ['월', '화', '수', '목', '금', '토', '일']

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function mondayOf(base: Date): Date {
  const d = new Date(base)
  const wd = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - wd)
  d.setHours(0, 0, 0, 0)
  return d
}
/** 기간이 day를 포함하는가 */
function covers(w: WorkItem, dYmd: string): boolean {
  return w.start <= dYmd && dYmd <= w.end
}

export default function ArtSchedule() {
  const [plan, setPlan] = useState<Plan>('week')
  const now = new Date()
  const todayYmd = ymd(now)
  const [monthView, setMonthView] = useState(now.getMonth() + 1)
  const curQ = Math.floor(now.getMonth() / 3) + 1
  const [quarterView, setQuarterView] = useState(curQ)
  const year = now.getFullYear()

  const projQ = useQuery<Pick<ArtProject, 'id' | 'name'>[]>(
    async () => await supabase.from('art_projects').select('id,name'),
    [],
  )
  const stepQ = useQuery<ProjectStep[]>(
    async () => await supabase.from('project_steps').select('*').not('from_date', 'is', null),
    [],
  )
  const taskQ = useQuery<WorkTask[]>(
    async () => await supabase.from('work_tasks').select('*').eq('area', 'art').not('start_date', 'is', null),
    [],
  )

  const projName = useMemo(
    () => Object.fromEntries((projQ.data ?? []).map((p) => [p.id, p.name])),
    [projQ.data],
  )

  // 통합 업무 목록
  const works: WorkItem[] = useMemo(() => {
    const out: WorkItem[] = []
    for (const s of stepQ.data ?? []) {
      const start = dateOnly(s.from_date)
      if (!start) continue
      const biz = projName[s.project_id] ?? ''
      out.push({
        name: `${biz ? biz + ' — ' : ''}${s.title}`,
        biz,
        start,
        end: dateOnly(s.to_date) || start,
        status: STEP_STATUS[s.status] ?? '대기',
        color: STEP_COLOR,
      })
    }
    for (const t of taskQ.data ?? []) {
      const start = dateOnly(t.start_date)
      if (!start) continue
      // src 가 "사업: 삼국유사…" 형태면 접두어 제거 (표기 시 다시 "사업:" 를 붙이므로 중복 방지)
      const biz = (t.src ?? '').replace(/^\s*사업\s*:\s*/, '')
      out.push({
        name: t.title,
        biz,
        start,
        end: dateOnly(t.due_date) || start,
        status: TASK_STATUS[t.status] ?? '대기',
        color: TASK_COLOR,
      })
    }
    return out
  }, [stepQ.data, taskQ.data, projName])

  const loading = projQ.loading || stepQ.loading || taskQ.loading

  return (
    <section className="panel" style={{ marginBottom: 14 }}>
      <div className="panel-h">
        <div>
          <h2>업무 일정</h2>
        </div>
        <div className="r" style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="seg-text">
            <button className={plan === 'week' ? 'on' : ''} onClick={() => setPlan('week')}>
              주간
            </button>
            <button className={plan === 'month' ? 'on' : ''} onClick={() => setPlan('month')}>
              월간
            </button>
            <button className={plan === 'quarter' ? 'on' : ''} onClick={() => setPlan('quarter')}>
              분기
            </button>
          </div>
        </div>
      </div>

      <div id="artplan-body">
        {loading ? (
          <div style={{ padding: 28, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
            일정 불러오는 중…
          </div>
        ) : plan === 'week' ? (
          <WeekView works={works} todayYmd={todayYmd} baseMon={mondayOf(now)} />
        ) : plan === 'month' ? (
          <MonthView
            works={works}
            year={year}
            month={monthView}
            todayYmd={todayYmd}
            onStep={(d) => setMonthView((m) => ((m - 1 + d + 12) % 12) + 1)}
          />
        ) : (
          <QuarterView works={works} quarter={quarterView} onSet={setQuarterView} />
        )}
      </div>
    </section>
  )
}

/* ── 주간 ── */
function WeekView({ works, todayYmd, baseMon }: { works: WorkItem[]; todayYmd: string; baseMon: Date }) {
  const days = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(baseMon)
    d.setDate(baseMon.getDate() + i)
    return d
  })
  return (
    <div className="wk-cal">
      {WD.map((h) => (
        <div className="hd" key={h}>
          {h}
        </div>
      ))}
      {days.map((d, i) => {
        const dy = ymd(d)
        const isToday = dy === todayYmd
        const dayWorks = works.filter((w) => covers(w, dy))
        const lbl = d.getDate() === 1 ? `${d.getMonth() + 1}/1` : String(d.getDate())
        return (
          <div className={`cell${isToday ? ' today' : ''}`} key={i}>
            <span className="dn">
              {lbl}
              {isToday ? ' 오늘' : ''}
            </span>
            {dayWorks.map((w, j) => {
              const short = w.name.includes('—') ? w.name.split('—').pop()!.trim() : w.name
              return (
                <span className="wk-ev" key={j} style={{ background: w.color }} title={w.name}>
                  {short}
                </span>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

/* ── 월간 ── */
function MonthView({
  works,
  year,
  month,
  todayYmd,
  onStep,
}: {
  works: WorkItem[]
  year: number
  month: number
  todayYmd: string
  onStep: (d: number) => void
}) {
  const first = new Date(year, month - 1, 1)
  const firstDow = (first.getDay() + 6) % 7
  const daysIn = new Date(year, month, 0).getDate()

  // 날짜별 업무
  const map: Record<number, WorkItem[]> = {}
  const uniq = new Set<string>()
  for (let day = 1; day <= daysIn; day++) {
    const dy = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const ws = works.filter((w) => covers(w, dy))
    if (ws.length) {
      map[day] = ws
      ws.forEach((w) => uniq.add(w.name))
    }
  }
  const MAXSHOW = 3
  const [dayModal, setDayModal] = useState<{ day: number; ws: WorkItem[] } | null>(null)

  return (
    <>
      <div className="mcal-nav">
        <button onClick={() => onStep(-1)} aria-label="이전 달">
          ‹
        </button>
        <b>
          {year}년 {month}월
        </b>
        <span>업무 {uniq.size}건</span>
        <button onClick={() => onStep(1)} aria-label="다음 달">
          ›
        </button>
      </div>
      <div className="mcal">
        {WD.map((d, i) => (
          <div className={`mwd${i === 6 ? ' sun' : ''}`} key={d}>
            {d}
          </div>
        ))}
        {Array.from({ length: firstDow }).map((_, i) => (
          <div className="mcell out" key={`o${i}`} />
        ))}
        {Array.from({ length: daysIn }).map((_, idx) => {
          const day = idx + 1
          const dy = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          const isToday = dy === todayYmd
          const ws = map[day] ?? []
          return (
            <div
              className={`mcell${isToday ? ' today' : ''}${ws.length >= 5 ? ' busy' : ''}`}
              key={day}
              onClick={() => ws.length && setDayModal({ day, ws })}
              style={{ cursor: ws.length ? 'pointer' : 'default' }}
            >
              <span className="md">
                {day}
                {isToday && <span className="tdy">오늘</span>}
                {ws.length >= 4 && <span className="mcnt">{ws.length}</span>}
              </span>
              {ws.slice(0, MAXSHOW).map((w, j) => (
                <span className="mev" key={j} style={{ background: w.color }} title={w.name}>
                  {w.name}
                </span>
              ))}
              {ws.length > MAXSHOW && <span className="mmore">+{ws.length - MAXSHOW} 더보기</span>}
            </div>
          )
        })}
      </div>

      {dayModal && (
        <div className="modal-bg" onClick={() => setDayModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <div className="mh">
              <div>
                <div className="eyebrow">업무 일정</div>
                <h3>
                  {year}-{String(month).padStart(2, '0')}-{String(dayModal.day).padStart(2, '0')} · 업무{' '}
                  {dayModal.ws.length}건
                </h3>
              </div>
              <button className="x" onClick={() => setDayModal(null)}>
                ✕
              </button>
            </div>
            <div className="mb">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {dayModal.ws.map((w, j) => (
                  <div
                    key={j}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 9,
                      border: '1px solid var(--line-2)',
                      borderRadius: 9,
                      padding: '8px 10px',
                    }}
                  >
                    <span
                      style={{ width: 9, height: 9, borderRadius: 3, flex: 'none', background: w.color }}
                    />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 700 }}>{w.name}</div>
                      {w.biz && (
                        <div style={{ fontSize: 11, color: 'var(--muted)' }}>사업: {w.biz}</div>
                      )}
                    </div>
                    <span className={`chip ${STWORK[w.status]}`} style={{ flex: 'none' }}>
                      <i />
                      {w.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

/* ── 분기 ── */
function QuarterView({
  works,
  quarter,
  onSet,
}: {
  works: WorkItem[]
  quarter: number
  onSet: (q: number) => void
}) {
  const months = [
    [1, 2, 3],
    [4, 5, 6],
    [7, 8, 9],
    [10, 11, 12],
  ][quarter - 1]

  const monthWorks = (mm: number) =>
    works.filter((w) => {
      const sm = +w.start.slice(5, 7)
      const em = +w.end.slice(5, 7)
      return mm >= sm && mm <= em
    })
  const any = months.some((mm) => monthWorks(mm).length > 0)

  return (
    <>
      <div className="qtabs">
        {[1, 2, 3, 4].map((i) => (
          <button className={i === quarter ? 'on' : ''} key={i} onClick={() => onSet(i)}>
            {i}분기
          </button>
        ))}
        <span className="qrange">
          {months[0]}~{months[2]}월
        </span>
      </div>
      {!any ? (
        <div className="empty" style={{ padding: 28 }}>
          <strong>이 분기에 등록된 업무가 없습니다.</strong>
        </div>
      ) : (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {months.map((mm) => {
            const mw = monthWorks(mm)
            return (
              <div key={mm}>
                <div className="qmonth">
                  {mm}월 <span>{mw.length}건</span>
                </div>
                {mw.length === 0 ? (
                  <div style={{ fontSize: 12, color: 'var(--muted)', padding: '4px 2px' }}>—</div>
                ) : (
                  <div className="tbl-wrap">
                    <table>
                      <tbody>
                        {mw.map((w, j) => (
                          <tr key={j}>
                            <td style={{ width: '55%' }}>
                              <div className="t-title" style={{ fontSize: 12.5 }}>
                                {w.name}
                              </div>
                              {w.biz && <div className="t-sub">사업: {w.biz}</div>}
                            </td>
                            <td className="tnum" style={{ fontSize: 11, color: 'var(--muted)' }}>
                              {w.start.slice(5)}
                              {w.end !== w.start ? `~${w.end.slice(5)}` : ''}
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <span className={`chip ${STWORK[w.status]}`}>
                                <i />
                                {w.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
