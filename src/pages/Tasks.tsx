import { useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { PageHead } from '../components/PageHead'
import { ErrorBanner, LoadingRow, EmptyRow } from '../components/States'
import { supabase } from '../lib/supabase'
import { useQuery } from '../lib/useQuery'
import { mmdd } from '../lib/format'
import { AREAS } from '../data/areas'
import type { WorkTask, Employee } from '../types/db'

const ST_CHIP: Record<string, [string, string]> = {
  plan: ['c-plan', '예정'],
  prog: ['c-prog', '진행중'],
  done: ['c-done', '완료'],
}

export default function Tasks() {
  const { area } = useParams()
  const a = AREAS.find((x) => x.id === area)
  const label = a ? `${a.label} 업무현황` : '업무현황'

  const taskQ = useQuery<WorkTask[]>(
    async () =>
      await supabase
        .from('work_tasks')
        .select('*')
        .eq('area', area!)
        .order('due_date', { ascending: true }),
    [area],
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

  const tasks = taskQ.data ?? []
  const nPlan = tasks.filter((t) => t.status === 'plan').length
  const nProg = tasks.filter((t) => t.status === 'prog').length
  const nDone = tasks.filter((t) => t.status === 'done').length

  return (
    <div className="page on">
      <PageHead eyebrow="업무관리" title={label} desc="부서별 업무를 한눈에 확인하세요." />

      {/* KPI 미니 탭 */}
      <div className="stats" style={{ marginBottom: 14 }}>
        <MiniStat lbl="전체" n={tasks.length} />
        <MiniStat lbl="예정" n={nPlan} />
        <MiniStat lbl="진행중" n={nProg} />
        <MiniStat lbl="완료" n={nDone} />
      </div>

      <section className="panel">
        <ErrorBanner error={taskQ.error} table="work_tasks" />
        <div className="panel-h">
          <div>
            <h2>
              {label} <span className="count">{taskQ.loading ? '…' : tasks.length}</span>
            </h2>
          </div>
        </div>
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th />
                <th>업무</th>
                <th>담당자</th>
                <th>등록</th>
                <th>시작</th>
                <th>마감</th>
                <th>상태</th>
              </tr>
            </thead>
            <tbody>
              {taskQ.loading && <LoadingRow cols={7} />}
              {!taskQ.loading &&
                tasks.map((t) => {
                  const chk = t.status === 'done'
                  const sc = ST_CHIP[t.status] ?? ST_CHIP.plan
                  return (
                    <tr key={t.id}>
                      <td>
                        <button className={`task-check${chk ? ' checked' : ''}`} title={chk ? '완료' : '완료 처리'}>
                          {chk && (
                            <svg className="icon" width="11" height="11" viewBox="0 0 24 24">
                              <path d="M5 12l4 4 10-10" />
                            </svg>
                          )}
                        </button>
                      </td>
                      <td>
                        <div className={`t-title${chk ? ' done-txt' : ''}`}>{t.title}</div>
                        {a && (
                          <span className={`area ${a.cls}`} style={{ fontSize: 10, padding: '2px 8px' }}>
                            {a.label}
                            {t.detail ? ` · ${t.detail}` : ''}
                          </span>
                        )}
                        {t.src && (
                          <div className="t-sub" style={{ color: 'var(--brand-ink)' }}>
                            {t.src}
                          </div>
                        )}
                      </td>
                      <td>
                        <span className="owner">
                          <span className="av-s">
                            {(t.owner_id ? empName[t.owner_id] ?? '—' : '—').slice(0, 1)}
                          </span>
                          {t.owner_id ? empName[t.owner_id] ?? '—' : '—'}
                        </span>
                      </td>
                      <td className="tnum" style={{ color: 'var(--muted)' }}>
                        {mmdd(t.reg_date)}
                      </td>
                      <td className="tnum">{mmdd(t.start_date)}</td>
                      <td className="tnum">{mmdd(t.due_date)}</td>
                      <td>
                        <span className={`chip ${sc[0]}`}>
                          <i />
                          {sc[1]}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              {!taskQ.loading && tasks.length === 0 && !taskQ.error && (
                <EmptyRow cols={7} text="등록된 업무가 없습니다." />
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

function MiniStat({ lbl, n }: { lbl: string; n: number }) {
  return (
    <div className="stat">
      <div>
        <div className="lbl">{lbl}</div>
        <div className="val tnum">
          {n}
          <small>건</small>
        </div>
      </div>
    </div>
  )
}
