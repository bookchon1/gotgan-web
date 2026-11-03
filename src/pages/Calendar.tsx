import { useMemo, useState } from 'react'
import { PageHead } from '../components/PageHead'
import { ErrorBanner } from '../components/States'
import { supabase } from '../lib/supabase'
import { useQuery } from '../lib/useQuery'
import { dateOnly } from '../lib/format'
import type { GotganEvent } from '../types/db'

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
}

export default function Calendar() {
  const today = new Date()
  const [ym, setYm] = useState({ y: today.getFullYear(), m: today.getMonth() + 1 })
  const [filters, setFilters] = useState<string[]>([])

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

  // 날짜별 이벤트 맵
  const byDay = useMemo(() => {
    const m: Record<number, GotganEvent[]> = {}
    for (const e of events) {
      const d = parseInt(dateOnly(e.date).slice(8, 10), 10)
      ;(m[d] ??= []).push(e)
    }
    return m
  }, [events])

  const firstDow = new Date(ym.y, ym.m - 1, 1).getDay()
  const daysInMonth = new Date(ym.y, ym.m, 0).getDate()
  const isThisMonth = ym.y === today.getFullYear() && ym.m === today.getMonth() + 1
  const todayDate = today.getDate()

  // 이번 달에 등장하는 영역들 (범례)
  const areasPresent = useMemo(() => {
    const s = new Set<string>()
    for (const e of events) if (e.area) s.add(e.area)
    return [...s]
  }, [events])

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
            {areasPresent.map((k) => {
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
    </div>
  )
}
