import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHead } from '../components/PageHead'
import { Icon } from '../components/Icon'
import { supabase } from '../lib/supabase'
import { useQuery } from '../lib/useQuery'
import { useAuth } from '../lib/auth'
import { AREAS } from '../data/areas'
import { dateOnly } from '../lib/format'
import type { WorkTask, Employee, GotganDocument, Approval, ApprovalLine } from '../types/db'

/* 영역 메타 (색상·라벨·세부) */
const AREA_META: Record<string, { label: string; color: string }> = Object.fromEntries(
  AREAS.map((a) => [a.id, { label: a.label, color: a.color }]),
)
function areaOf(key: string | null): { label: string; color: string } {
  return (key && AREA_META[key]) || { label: '공통', color: 'var(--muted)' }
}

const ST_CHIP: Record<string, [string, string]> = {
  plan: ['c-plan', '예정'],
  prog: ['c-prog', '진행중'],
  done: ['c-done', '완료'],
}
const SCOPE_BADGE: Record<string, string> = { 전사: 'badge green', 선택: 'badge blue', 개인: 'badge' }

/* ── 날짜 유틸 (브라우저 로컬 = 사용자 시간대) ── */
const WD = ['일', '월', '화', '수', '목', '금', '토']
function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
/** 이번 주 월요일 */
function mondayOf(base: Date): Date {
  const d = new Date(base)
  const wd = (d.getDay() + 6) % 7 // 월=0 … 일=6
  d.setDate(d.getDate() - wd)
  d.setHours(0, 0, 0, 0)
  return d
}
/** 오늘 기준 D-day 표기 */
function dueLabel(due: string | null, todayYmd: string): { text: string; soon: boolean } {
  const s = dateOnly(due)
  if (!s) return { text: '—', soon: false }
  const diff = Math.round((+new Date(s) - +new Date(todayYmd)) / 86_400_000)
  if (diff === 0) return { text: '오늘', soon: true }
  if (diff < 0) return { text: s.slice(5), soon: false }
  if (diff <= 3) return { text: s.slice(5), soon: true }
  return { text: s.slice(5), soon: false }
}

export default function Dashboard() {
  const { me, isAdmin } = useAuth()
  const nav = useNavigate()
  const name = me?.name ?? '구성원'
  const myId = me?.id ?? null

  const now = new Date()
  const todayYmd = ymd(now)
  const mon = mondayOf(now)

  // 업무: 관리자=전체, 일반=본인 것
  const taskQ = useQuery<WorkTask[]>(
    async () => {
      let q = supabase.from('work_tasks').select('*')
      if (!isAdmin && myId) q = q.eq('owner_id', myId)
      return await q
    },
    [isAdmin, myId],
  )
  const empQ = useQuery<Pick<Employee, 'id' | 'name'>[]>(
    async () => await supabase.from('employees').select('id,name'),
    [],
  )
  const docQ = useQuery<GotganDocument[]>(
    async () => await supabase.from('documents').select('*').order('created_at', { ascending: false }).limit(5),
    [],
  )
  // 내 결재 대기 계산용
  const apQ = useQuery<Approval[]>(
    async () => await supabase.from('approvals').select('*'),
    [],
  )
  const lineQ = useQuery<ApprovalLine[]>(
    async () => await supabase.from('approval_lines').select('*'),
    [],
  )

  const empName = useMemo(
    () => Object.fromEntries((empQ.data ?? []).map((e) => [e.id, e.name])),
    [empQ.data],
  )
  const tasks = taskQ.data ?? []

  // KPI (내 것 기준 — 시안과 동일한 "내 업무/진행중/완료")
  const myTasks = useMemo(() => (myId ? tasks.filter((t) => t.owner_id === myId) : tasks), [tasks, myId])
  const kpi = {
    mine: myTasks.length,
    prog: myTasks.filter((t) => t.status === 'prog').length,
    done: myTasks.filter((t) => t.status === 'done').length,
  }

  // 내 결재 대기 건수 (Approvals 화면과 동일 로직)
  const pendingCount = useMemo(() => {
    if (!myId) return 0
    const lines = lineQ.data ?? []
    return (apQ.data ?? []).filter((a) => {
      if (a.status === '반려' || a.status === '회계접수') return false
      const sorted = lines.filter((l) => l.approval_id === a.id).sort((x, y) => x.seq - y.seq)
      const myIdx = sorted.findIndex((l) => l.approver_id === myId && l.decided === '대기')
      if (myIdx < 0) return false
      return sorted.slice(0, myIdx).every((l) => l.decided === '승인')
    }).length
  }, [apQ.data, lineQ.data, myId])

  // 업무현황 테이블: 마감 가까운 순, 완료는 뒤로. 상위 6건.
  const tableTasks = useMemo(() => {
    const rank = (t: WorkTask) => (t.status === 'done' ? 1 : 0)
    return [...tasks]
      .sort((a, b) => {
        if (rank(a) !== rank(b)) return rank(a) - rank(b)
        const ad = dateOnly(a.due_date) || '9999'
        const bd = dateOnly(b.due_date) || '9999'
        return ad < bd ? -1 : ad > bd ? 1 : 0
      })
      .slice(0, 6)
  }, [tasks])

  // 마감 임박: 미완료 + 마감 3일 이내(오늘 포함)
  const soonCount = useMemo(
    () =>
      tasks.filter((t) => {
        if (t.status === 'done') return false
        const s = dateOnly(t.due_date)
        if (!s) return false
        const diff = Math.round((+new Date(s) - +new Date(todayYmd)) / 86_400_000)
        return diff >= 0 && diff <= 3
      }).length,
    [tasks, todayYmd],
  )

  const docs = docQ.data ?? []

  return (
    <div className="page on" id="p-dashboard">
      <PageHead
        eyebrow="YOUR DAILY WORKSPACE"
        title={
          <>
            <span>{name}</span>님, 안녕하세요.<span className="hello-dot" />
          </>
        }
        desc="오늘의 업무와 필요한 기록을 한곳에서 확인하세요."
      />

      {/* TODAY — 주간 스트립 */}
      <section className="today-panel" style={{ margin: '14px 0 16px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <span className="kick">TODAY</span>
            <div className="today-date" style={{ marginTop: 2 }}>
              {now.getMonth() + 1}월 <b className="tnum">{now.getDate()}</b> {WD[now.getDay()]}요일
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 7 }}>
            <button
              className="btn txt"
              style={{ padding: 0, fontWeight: 700, color: 'var(--brand-ink)' }}
              onClick={() => nav('/calendar')}
            >
              <Icon name="calendar" size={15} className="icon" /> 일정표 보기 ›
            </button>
            <span className="today-foot" style={{ margin: 0 }}>
              <Icon name="clock" size={15} className="icon" /> 마감 임박{' '}
              <b className="tnum">{taskQ.loading ? '…' : soonCount}건</b>
            </span>
          </div>
        </div>
        <div className="week" style={{ marginTop: 12 }}>
          {Array.from({ length: 7 }).map((_, i) => {
            const d = new Date(mon)
            d.setDate(mon.getDate() + i)
            const cur = ymd(d) === todayYmd
            return (
              <div key={i} className={cur ? 'cur' : undefined}>
                <small>{WD[d.getDay()]}</small>
                <strong>{d.getDate()}</strong>
                <i />
              </div>
            )
          })}
        </div>
      </section>

      {/* 업무 중심 KPI */}
      <div className="stats">
        <div className="stat">
          <div>
            <div className="lbl">내 업무</div>
            <div className="val tnum">
              {taskQ.loading ? '…' : kpi.mine}
              <small>건</small>
            </div>
            <div className="sub">등록된 업무</div>
          </div>
          <span className="si sage">
            <Icon name="tasks" size={21} />
          </span>
        </div>
        <div className="stat">
          <div>
            <div className="lbl">진행 중</div>
            <div className="val tnum">
              {taskQ.loading ? '…' : kpi.prog}
              <small>건</small>
            </div>
            <div className="sub">지금 이어가는 일</div>
          </div>
          <span className="si blue">
            <Icon name="clock" size={21} />
          </span>
        </div>
        <div className="stat">
          <div>
            <div className="lbl">완료한 업무</div>
            <div className="val tnum">
              {taskQ.loading ? '…' : kpi.done}
              <small>건</small>
            </div>
            <div className="sub">차곡차곡 쌓인 성과</div>
          </div>
          <span className="si sand">
            <Icon name="approval" size={21} />
          </span>
        </div>
        <div className="stat dark">
          <div>
            <div className="lbl">결재 대기</div>
            <div className="val tnum">
              {apQ.loading || lineQ.loading ? '…' : pendingCount}
              <small>건</small>
            </div>
            <div className="sub">내 차례</div>
          </div>
          <span className="si">
            <Icon name="approval" size={21} />
          </span>
        </div>
      </div>

      <div className="cols" style={{ gridTemplateColumns: '1fr' }}>
        <div className="col">
          {/* 전체 업무현황 */}
          <section className="panel">
            <div className="panel-h">
              <div>
                <h2>
                  {isAdmin ? '전체 업무현황' : '내 업무현황'}{' '}
                  <span className="count">{taskQ.loading ? '…' : tasks.length}</span>
                </h2>
                <p>마감이 가까운 업무부터 확인하세요.</p>
              </div>
              <button className="btn txt r" onClick={() => nav('/tasks/art')}>
                전체 보기 ›
              </button>
            </div>
            <div className="tbl-wrap">
              <table>
                <thead>
                  <tr>
                    <th>업무</th>
                    <th>담당자</th>
                    <th>마감</th>
                    <th>상태</th>
                  </tr>
                </thead>
                <tbody>
                  {tableTasks.map((t) => {
                    const sc = ST_CHIP[t.status] ?? ST_CHIP.plan
                    const ar = areaOf(t.area)
                    const dl = dueLabel(t.due_date, todayYmd)
                    const owner = t.owner_id ? empName[t.owner_id] ?? '—' : '—'
                    return (
                      <tr key={t.id}>
                        <td>
                          <div className="t-title">{t.title}</div>
                          <div className="t-sub">
                            <span
                              className="dot"
                              style={{ background: ar.color, display: 'inline-block' }}
                            />{' '}
                            {ar.label}
                            {t.dept && t.dept !== ar.label ? ` · ${t.dept}` : ''}
                          </div>
                        </td>
                        <td>
                          <span className="owner">
                            <span className="av-s">{owner.slice(0, 1)}</span>
                            {owner}
                          </span>
                        </td>
                        <td className="tnum" style={dl.soon ? { color: 'var(--expense)', fontWeight: 700 } : undefined}>
                          {dl.text}
                        </td>
                        <td>
                          <span className={`chip ${sc[0]}`}>
                            <i />
                            {sc[1]}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                  {!taskQ.loading && tableTasks.length === 0 && (
                    <tr>
                      <td colSpan={4} style={{ textAlign: 'center', color: 'var(--muted)', padding: '28px 0' }}>
                        등록된 업무가 없습니다.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* 최근 문서 */}
          <section className="panel">
            <div className="panel-h">
              <div>
                <h2>최근 문서</h2>
                <p>필요한 기록을 빠르게 찾아보세요.</p>
              </div>
              <button className="btn txt r" onClick={() => nav('/documents')}>
                보관함 열기 ›
              </button>
            </div>
            <div className="tbl-wrap">
              <table>
                <tbody>
                  {docs.map((d) => (
                    <tr key={d.id} style={{ cursor: 'pointer' }} onClick={() => nav('/documents')}>
                      <td>
                        <span className="owner">
                          <span className="av-s" style={{ borderRadius: 7 }}>
                            📄
                          </span>
                          <div>
                            <div className="t-title">{d.title}</div>
                          </div>
                        </span>
                      </td>
                      <td>
                        <span className={SCOPE_BADGE[d.share_scope]}>{d.share_scope} 공유</span>
                      </td>
                      <td className="muted tnum" style={{ color: 'var(--muted)' }}>
                        {dateOnly(d.created_at).slice(5)}
                      </td>
                    </tr>
                  ))}
                  {!docQ.loading && docs.length === 0 && (
                    <tr>
                      <td style={{ textAlign: 'center', color: 'var(--muted)', padding: '28px 0' }}>
                        문서가 없습니다.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
