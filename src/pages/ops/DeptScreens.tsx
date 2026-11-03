import { useMemo } from 'react'
import { PageHead } from '../../components/PageHead'
import { ErrorBanner, LoadingRow, EmptyRow } from '../../components/States'
import { supabase } from '../../lib/supabase'
import { useQuery } from '../../lib/useQuery'
import { mmdd } from '../../lib/format'
import type { WorkTask, Employee } from '../../types/db'

const ST_CHIP: Record<string, [string, string]> = {
  plan: ['c-plan', '예정'],
  prog: ['c-prog', '진행중'],
  done: ['c-done', '완료'],
}

/** 부서별 현황 공통 화면 — 해당 영역의 업무를 목록으로. (현장/홍보/체험/교육 공용) */
function DeptStatus({
  area,
  eyebrow,
  title,
  desc,
  detailHeader,
}: {
  area: string
  eyebrow: string
  title: string
  desc: string
  detailHeader?: string
}) {
  const taskQ = useQuery<WorkTask[]>(
    async () => await supabase.from('work_tasks').select('*').eq('area', area).order('due_date', { ascending: true }),
    [area],
  )
  const empQ = useQuery<Pick<Employee, 'id' | 'name'>[]>(
    async () => await supabase.from('employees').select('id,name'),
    [],
  )
  const empName = useMemo(() => Object.fromEntries((empQ.data ?? []).map((e) => [e.id, e.name])), [empQ.data])
  const tasks = taskQ.data ?? []

  return (
    <div className="page on">
      <PageHead eyebrow={eyebrow} title={title} desc={desc} />
      <section className="panel">
        <ErrorBanner error={taskQ.error} table="work_tasks" />
        <div className="panel-h">
          <div>
            <h2>
              {detailHeader ?? title} <span className="count">{taskQ.loading ? '…' : tasks.length}</span>
            </h2>
          </div>
        </div>
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>내용</th>
                <th>담당자</th>
                <th>시작</th>
                <th>마감</th>
                <th>상태</th>
              </tr>
            </thead>
            <tbody>
              {taskQ.loading && <LoadingRow cols={5} />}
              {!taskQ.loading &&
                tasks.map((t) => {
                  const sc = ST_CHIP[t.status] ?? ST_CHIP.plan
                  return (
                    <tr key={t.id}>
                      <td>
                        <div className="t-title">{t.title}</div>
                        {t.src && <div className="t-sub" style={{ color: 'var(--brand-ink)' }}>{t.src}</div>}
                      </td>
                      <td>
                        <span className="owner">
                          <span className="av-s">{(t.owner_id ? empName[t.owner_id] ?? '—' : '—').slice(0, 1)}</span>
                          {t.owner_id ? empName[t.owner_id] ?? '—' : '—'}
                        </span>
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
                <EmptyRow cols={5} text="등록된 내용이 없습니다. 업무현황에서 추가할 수 있습니다." />
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

export function ArtField() {
  return (
    <DeptStatus
      area="art"
      eyebrow="미술 · 현장"
      title="현장관리"
      desc="현장 작업·일용직 근무·일일 기록을 관리합니다."
      detailHeader="현장 작업"
    />
  )
}
export function Promotion() {
  return (
    <DeptStatus area="promotion" eyebrow="홍보" title="홍보현황" desc="채널별 홍보 활동과 게시 일정을 관리합니다." detailHeader="홍보 활동" />
  )
}
export function Experience() {
  return (
    <DeptStatus area="experience" eyebrow="체험" title="체험현황" desc="체험 프로그램 운영과 일정을 관리합니다." detailHeader="체험 프로그램" />
  )
}
export function EduProgress() {
  return (
    <DeptStatus area="education" eyebrow="교육 · 진도" title="수업진도" desc="수업 진행과 커리큘럼을 관리합니다." detailHeader="수업 진행" />
  )
}
export function EduMaterials() {
  return (
    <DeptStatus area="education" eyebrow="교육 · 자료" title="수업자료" desc="수업 자료를 관리합니다." detailHeader="수업 자료" />
  )
}

/** 납부현황 — 간단한 안내(수강료 납부는 회계 전표로 관리) */
export function EduPayments() {
  return (
    <div className="page on">
      <PageHead eyebrow="교육 · 납부" title="납부현황" desc="수강료 납부 현황을 관리합니다." />
      <section className="panel">
        <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
          수강료 납부는 <b>회계관리 → 전표내역</b>(수수료수입)에서 확인·관리됩니다.
          <br />
          개별 수강생 납부 관리가 필요하면 전용 테이블을 추가할 수 있습니다.
        </div>
      </section>
    </div>
  )
}
