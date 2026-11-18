import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useQuery } from '../../lib/useQuery'
import { dateOnly } from '../../lib/format'
import type { ArtProject, ProjectStep } from '../../types/db'

/* 업무 일정 (사업관리 상단) — 사업별 세부공정(project_steps) 일정표.
   주간 / 월간 / 분기 뷰, 사업별 색상 구분, 공정 클릭 시 상세 팝업. */

type Plan = 'week' | 'month' | 'quarter'

interface WorkItem {
  name: string // 사업명 — 공정명
  biz: string
  projectId: string
  stepTitle: string
  short: string // 사업 약칭
  start: string // YYYY-MM-DD
  end: string
  status: '완료' | '진행중' | '대기' | '보류'
  memo: string
  color: string
}

const STEP_STATUS: Record<string, '완료' | '진행중' | '대기' | '보류'> = {
  done: '완료',
  prog: '진행중',
  before: '대기',
  na: '보류',
}
const STWORK: Record<string, string> = {
  완료: 'c-done',
  진행중: 'c-prog',
  대기: 'c-wait',
  보류: 'set-hold',
}

// 사업별 색상 팔레트 (프로젝트 등록 순서대로 배정)
const PROJ_PALETTE = [
  '#3C6E9C', '#A9781F', '#2E7D5B', '#9C4F6E', '#6E5BA6',
  '#B5651D', '#4F8A8B', '#8B5E3C', '#7A8B3C', '#C0567A',
]

const WD = ['월', '화', '수', '목', '금', '토', '일']

/** 사업 약칭: 지정값 우선, 없으면 「」 안의 이름 → 연도·일반 접미어를 뺀 앞 두 단어 */
function shortOf(name: string, short?: string | null): string {
  if (short && short.trim()) return short.trim()
  const br = name.match(/[「『“"<《](.+?)[」』”">》]/)
  if (br) return br[1].trim()
  const toks = name
    .replace(/^\s*\d{4}\s*년?\s*/, '')
    .split(/\s+/)
    .filter((t) => t && !/^(보존처리|공사|용역|제작|수리|복원|사업)$/.test(t))
  return toks.slice(0, 2).join(' ') || name
}

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
  const [year, setYear] = useState(now.getFullYear()) // 월간·분기 보기 연도
  const navigate = useNavigate()

  const projQ = useQuery<Pick<ArtProject, 'id' | 'name' | 'short_name'>[]>(
    // short_name 컬럼이 아직 없어도 조회가 실패하지 않도록 * 로 조회
    async () => await supabase.from('art_projects').select('*').order('created_at', { ascending: true }),
    [],
  )
  const stepQ = useQuery<ProjectStep[]>(
    async () => await supabase.from('project_steps').select('*').not('from_date', 'is', null),
    [],
  )

  const projName = useMemo(
    () => Object.fromEntries((projQ.data ?? []).map((p) => [p.id, p.name])),
    [projQ.data],
  )
  const projShort = useMemo(
    () => Object.fromEntries((projQ.data ?? []).map((p) => [p.id, shortOf(p.name, p.short_name)])),
    [projQ.data],
  )
  // 사업별 색상 (등록 순서대로 팔레트 배정)
  const projColor = useMemo(() => {
    const m: Record<string, string> = {}
    ;(projQ.data ?? []).forEach((p, i) => { m[p.id] = PROJ_PALETTE[i % PROJ_PALETTE.length] })
    return m
  }, [projQ.data])

  // 세부공정 일정 목록 (사업별 색상)
  const works: WorkItem[] = useMemo(() => {
    const out: WorkItem[] = []
    for (const s of stepQ.data ?? []) {
      const start = dateOnly(s.from_date)
      if (!start) continue
      const biz = projName[s.project_id] ?? ''
      out.push({
        name: `${biz ? biz + ' — ' : ''}${s.title}`,
        biz,
        projectId: s.project_id,
        stepTitle: s.title,
        short: projShort[s.project_id] ?? '',
        start,
        end: dateOnly(s.to_date) || start,
        status: STEP_STATUS[s.status] ?? '대기',
        memo: (s as { memo?: string }).memo ?? '',
        color: projColor[s.project_id] ?? '#3C6E9C',
      })
    }
    return out
  }, [stepQ.data, projName, projColor, projShort])

  const loading = projQ.loading || stepQ.loading
  // 공정 클릭 시 상세 팝업
  const [stepPopup, setStepPopup] = useState<WorkItem | null>(null)

  return (
    <section className="panel" style={{ marginBottom: 14 }}>
      <div className="panel-h">
        <div>
          <h2>업무 일정</h2>
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>사업별 세부공정 일정</span>
        </div>
        <div className="r" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
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
          <WeekView works={works} todayYmd={todayYmd} baseMon={mondayOf(now)} onPick={setStepPopup} />
        ) : plan === 'month' ? (
          <MonthView
            works={works}
            year={year}
            month={monthView}
            todayYmd={todayYmd}
            onStep={(d) => {
              // 연도 경계를 넘으면 연도도 함께 이동 (12월 → 다음 해 1월)
              const idx = year * 12 + (monthView - 1) + d
              setYear(Math.floor(idx / 12))
              setMonthView((idx % 12) + 1)
            }}
            onPick={setStepPopup}
          />
        ) : (
          <QuarterView works={works} year={year} onYear={(d) => setYear((y) => y + d)} quarter={quarterView} onSet={setQuarterView} onPick={setStepPopup} />
        )}
      </div>

      {stepPopup && (
        <div className="modal-bg" onClick={() => setStepPopup(null)}>
          <div className="modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <div className="mh">
              <div>
                <div className="eyebrow" style={{ color: stepPopup.color }}>● {stepPopup.biz || '공정'}</div>
                <h3>{stepPopup.stepTitle}</h3>
              </div>
              <button className="x" onClick={() => setStepPopup(null)}>✕</button>
            </div>
            <div className="mb">
              <div className="field-grid">
                <div className="field"><div className="fl">사업</div><div className="fv">{stepPopup.biz || '—'}</div></div>
                <div className="field"><div className="fl">공정</div><div className="fv">{stepPopup.stepTitle}</div></div>
                <div className="field"><div className="fl">상태</div><div className="fv"><span className={`chip ${STWORK[stepPopup.status]}`}><i />{stepPopup.status}</span></div></div>
                <div className="field"><div className="fl">기간</div><div className="fv">{stepPopup.start}{stepPopup.end !== stepPopup.start ? ` ~ ${stepPopup.end}` : ''}</div></div>
                {stepPopup.memo && <div className="field" style={{ gridColumn: '1 / -1' }}><div className="fl">메모</div><div className="fv">{stepPopup.memo}</div></div>}
              </div>
            </div>
            <div className="mf">
              <button className="btn sec" onClick={() => setStepPopup(null)}>닫기</button>
              <button className="btn pri" onClick={() => navigate(`/ops/art/${stepPopup.projectId}`)}>사업 상세로</button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

/* ── 주간 ── */
function WeekView({ works, todayYmd, baseMon, onPick }: { works: WorkItem[]; todayYmd: string; baseMon: Date; onPick: (w: WorkItem) => void }) {
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
              const short = `${w.short ? w.short + ' ' : ''}${w.stepTitle}`
              return (
                <span
                  className="wk-ev"
                  key={j}
                  style={{ background: w.color, cursor: 'pointer' }}
                  title={w.name}
                  onClick={() => onPick(w)}
                >
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
  onPick,
}: {
  works: WorkItem[]
  year: number
  month: number
  todayYmd: string
  onStep: (d: number) => void
  onPick: (w: WorkItem) => void
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
        <span>공정 {uniq.size}건</span>
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
                  {w.short ? `${w.short} ` : ''}{w.stepTitle}
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
                <div className="eyebrow">세부공정</div>
                <h3>
                  {year}-{String(month).padStart(2, '0')}-{String(dayModal.day).padStart(2, '0')} · 공정{' '}
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
                  <button
                    key={j}
                    onClick={() => { setDayModal(null); onPick(w) }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 9,
                      border: '1px solid var(--line-2)',
                      borderRadius: 9,
                      padding: '8px 10px',
                      background: 'transparent',
                      cursor: 'pointer',
                      textAlign: 'left',
                      width: '100%',
                    }}
                  >
                    <span
                      style={{ width: 9, height: 9, borderRadius: 3, flex: 'none', background: w.color }}
                    />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 700 }}>{w.stepTitle}</div>
                      {w.biz && (
                        <div style={{ fontSize: 11, color: 'var(--muted)' }}>사업: {w.biz}</div>
                      )}
                    </div>
                    <span className={`chip ${STWORK[w.status]}`} style={{ flex: 'none' }}>
                      <i />
                      {w.status}
                    </span>
                  </button>
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
  year,
  onYear,
  quarter,
  onSet,
  onPick,
}: {
  works: WorkItem[]
  year: number
  onYear: (d: number) => void
  quarter: number
  onSet: (q: number) => void
  onPick: (w: WorkItem) => void
}) {
  const months = [
    [1, 2, 3],
    [4, 5, 6],
    [7, 8, 9],
    [10, 11, 12],
  ][quarter - 1]

  // 해당 연도·월과 기간이 겹치는 공정 (연도까지 비교)
  const monthWorks = (mm: number) => {
    const first = `${year}-${String(mm).padStart(2, '0')}-01`
    const last = `${year}-${String(mm).padStart(2, '0')}-${String(new Date(year, mm, 0).getDate()).padStart(2, '0')}`
    return works.filter((w) => w.start <= last && w.end >= first)
  }
  const any = months.some((mm) => monthWorks(mm).length > 0)

  return (
    <>
      <div className="qtabs">
        <span className="qyear">
          <button onClick={() => onYear(-1)} aria-label="이전 해">‹</button>
          <b>{year}년</b>
          <button onClick={() => onYear(1)} aria-label="다음 해">›</button>
        </span>
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
          <strong>이 분기에 등록된 공정이 없습니다.</strong>
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
                          <tr key={j} style={{ cursor: 'pointer' }} onClick={() => onPick(w)}>
                            <td style={{ width: '55%' }}>
                              <div className="t-title" style={{ fontSize: 12.5 }}>
                                <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: w.color, marginRight: 6 }} />
                                {w.short ? `${w.short} · ` : ''}{w.stepTitle}
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
