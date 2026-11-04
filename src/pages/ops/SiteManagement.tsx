import { useEffect, useMemo, useState } from 'react'
import { PageHead } from '../../components/PageHead'
import { ErrorBanner, LoadingRow, EmptyRow } from '../../components/States'
import { supabase } from '../../lib/supabase'
import { useQuery } from '../../lib/useQuery'
import { useAuth } from '../../lib/auth'
import { eok, won, mmdd, dateOnly } from '../../lib/format'
import type { SiteWorker, SiteCrewMember, SiteLog, ArtProject, Employee } from '../../types/db'

type Tab = 'daily' | 'settle' | 'workers'

const TODAY = new Date().toISOString().slice(0, 10)

// 정산 진행사항 → 칩 클래스/라벨 (시안 set-mij / set-wait / set-done)
const SETTLE_CHIP: Record<SiteLog['settle_status'], [string, string]> = {
  미정산: ['set-mij', '미정산'],
  회계처리대기: ['set-wait', '회계처리 대기'],
  정산완료: ['set-done', '정산완료'],
}

/** crew 배열 → "박작업 18만·최보조 13만" 텍스트 */
function crewText(crew: SiteCrewMember[]): string {
  return crew.map((c) => `${c.name} ${eok(c.wage)}`).join('·')
}

/** 미술 · 현장관리 — 일일기록 / 기간 정산 / 작업자·일당 */
export default function SiteManagement() {
  const { me } = useAuth()
  const [tab, setTab] = useState<Tab>('daily')
  const [draftOpen, setDraftOpen] = useState(false)
  const [draftFrom, setDraftFrom] = useState<SiteLog | null>(null) // "복사하여 작성" 원본

  // 공통 데이터: 사업 목록, 작업자 명부, 일일기록
  const projQ = useQuery<Pick<ArtProject, 'id' | 'name'>[]>(
    async () => await supabase.from('art_projects').select('id,name').order('name', { ascending: true }),
    [],
  )
  const workerQ = useQuery<SiteWorker[]>(
    async () =>
      await supabase.from('site_workers').select('id,name,daily_wage,active,memo').order('name', { ascending: true }),
    [],
  )
  const logQ = useQuery<SiteLog[]>(
    async () =>
      await supabase
        .from('site_logs')
        .select(
          'id,project_id,project_name,log_date,work_text,crew,meal_cost,labor_cost,settle_status,locked,approval_id,created_by,created_at',
        )
        .order('log_date', { ascending: false }),
    [],
  )

  const projects = projQ.data ?? []
  const workers = workerQ.data ?? []
  const logs = logQ.data ?? []

  const topBtn =
    tab === 'daily' ? (
      <button className="btn txt add-txt" onClick={() => { setDraftFrom(null); setDraftOpen(true) }}>
        + 일일 기록 작성
      </button>
    ) : undefined

  return (
    <div className="page on">
      <PageHead eyebrow="ART · 현장관리" title="현장관리" desc="현장 일일기록을 쓰고 기간별로 정산해 지출결의서를 상신합니다." actions={topBtn} />

      <div className="subtabs" role="tablist">
        {([
          ['daily', '일일기록'],
          ['settle', '기간 정산'],
          ['workers', '작업자·일당'],
        ] as [Tab, string][]).map(([k, t]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
            {t}
          </button>
        ))}
      </div>

      <ErrorBanner error={logQ.error ?? workerQ.error} table="site_logs" />

      {tab === 'daily' && (
        <DailyTab
          logs={logs}
          loading={logQ.loading}
          projects={projects}
          onCopy={(log) => { setDraftFrom(log); setDraftOpen(true) }}
        />
      )}
      {tab === 'settle' && (
        <SettleTab logs={logs} loading={logQ.loading} projects={projects} me={me?.id ?? null} onSubmitted={() => logQ.reload()} />
      )}
      {tab === 'workers' && <WorkersTab workers={workers} loading={workerQ.loading} onChanged={() => workerQ.reload()} />}

      {draftOpen && (
        <DailyDraftModal
          projects={projects}
          workers={workers.filter((w) => w.active)}
          copyFrom={draftFrom}
          me={me?.id ?? null}
          onClose={() => setDraftOpen(false)}
          onSaved={() => {
            setDraftOpen(false)
            logQ.reload()
          }}
        />
      )}
    </div>
  )
}

// ============================ Tab A — 일일기록 ============================
function DailyTab({
  logs,
  loading,
  projects,
  onCopy,
}: {
  logs: SiteLog[]
  loading: boolean
  projects: Pick<ArtProject, 'id' | 'name'>[]
  onCopy: (log: SiteLog) => void
}) {
  const [proj, setProj] = useState('all')
  const [q, setQ] = useState('')

  const list = useMemo(
    () =>
      logs.filter(
        (l) =>
          (proj === 'all' || l.project_id === proj) &&
          (!q.trim() || dateOnly(l.log_date).includes(q.trim())),
      ),
    [logs, proj, q],
  )

  return (
    <section className="panel">
      <div className="toolbar">
        <select className="sel" value={proj} onChange={(e) => setProj(e.target.value)}>
          <option value="all">전체 사업</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <label className="search" style={{ marginLeft: 'auto' }}>
          <svg className="icon" width="15" height="15" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4-4" />
          </svg>
          <input placeholder="작성일 검색" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
      </div>
      <div className="tbl-wrap">
        <table>
          <thead>
            <tr>
              <th>작성일 / 사업</th>
              <th>현장 업무</th>
              <th>작업자 / 일당</th>
              <th style={{ textAlign: 'right' }}>식대</th>
              <th style={{ textAlign: 'right' }}>인건비</th>
              <th>정산 진행사항</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {loading && <LoadingRow cols={7} />}
            {!loading &&
              list.map((l) => {
                const sc = SETTLE_CHIP[l.settle_status] ?? SETTLE_CHIP.미정산
                return (
                  <tr key={l.id} style={l.locked ? { opacity: 0.55 } : undefined}>
                    <td>
                      <div className="t-title tnum">{mmdd(l.log_date)}</div>
                      {l.project_name && <div className="t-sub">{l.project_name}</div>}
                    </td>
                    <td>{l.work_text}</td>
                    <td>
                      <div className="crew">
                        {l.crew.map((c, i) => (
                          <span key={i}>
                            {c.name} · <b>{eok(c.wage)}</b>
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="tnum" style={{ textAlign: 'right' }}>
                      {eok(l.meal_cost)}
                    </td>
                    <td className="tnum" style={{ textAlign: 'right' }}>
                      {eok(l.labor_cost)}
                    </td>
                    <td>
                      <span className={`chip ${sc[0]}`}>
                        <i />
                        {sc[1]}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {l.locked ? (
                        <span className="badge" title="결의서와 연결된 기록은 원본 보존을 위해 잠깁니다">
                          🔒 잠금
                        </span>
                      ) : (
                        <button className="btn txt" style={{ padding: '4px 6px' }} onClick={() => onCopy(l)}>
                          복사하여 작성
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            {!loading && list.length === 0 && (
              <EmptyRow cols={7} text="일일 기록이 없습니다. '일일 기록 작성'으로 추가하세요." />
            )}
          </tbody>
        </table>
      </div>
      <div className="sec-mini" style={{ marginTop: 10 }}>
        결의서와 연결된 일일기록은 원본 보존을 위해 잠깁니다. '복사하여 작성'으로 전날 명단을 그대로 불러올 수 있습니다.
      </div>
    </section>
  )
}

// ============================ Tab B — 기간 정산 ============================
function SettleTab({
  logs,
  loading,
  projects,
  me,
  onSubmitted,
}: {
  logs: SiteLog[]
  loading: boolean
  projects: Pick<ArtProject, 'id' | 'name'>[]
  me: string | null
  onSubmitted: () => void
}) {
  const [proj, setProj] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  // 사업 목록이 로드되면 첫 사업 자동 선택
  useEffect(() => {
    if (!proj && projects.length) setProj(projects[0].id)
  }, [projects, proj])

  // 선택 사업 + 기간 내 미정산 기록
  const scope = useMemo(
    () =>
      logs
        .filter((l) => l.settle_status === '미정산' && l.project_id === proj)
        .filter((l) => {
          const d = dateOnly(l.log_date)
          if (from && d < from) return false
          if (to && d > to) return false
          return true
        })
        .sort((a, b) => (a.log_date < b.log_date ? -1 : 1)),
    [logs, proj, from, to],
  )

  const mealSum = scope.reduce((s, l) => s + (Number(l.meal_cost) || 0), 0)
  const laborSum = scope.reduce((s, l) => s + (Number(l.labor_cost) || 0), 0)
  const total = mealSum + laborSum

  // 작업자별 누계(일수): crew 를 가로질러 이름별 등장 일수 집계
  const tally = useMemo(() => {
    const m: Record<string, number> = {}
    for (const l of scope) for (const c of l.crew) m[c.name] = (m[c.name] ?? 0) + 1
    return Object.entries(m)
      .map(([name, days]) => `${name} ${days}일`)
      .join('·')
  }, [scope])

  const projName = projects.find((p) => p.id === proj)?.name ?? ''

  return (
    <section className="panel">
      <div className="toolbar">
        <select className="sel" value={proj} onChange={(e) => setProj(e.target.value)}>
          {projects.length === 0 && <option value="">사업 없음</option>}
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <span style={{ fontSize: 12.5, color: 'var(--muted)', marginLeft: 6 }}>정산 기간</span>
        <input className="sel" type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 150 }} />
        <span style={{ color: 'var(--muted)' }}>~</span>
        <input className="sel" type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 150 }} />
      </div>

      {note && (
        <div className="login-alert warn" style={{ margin: '0 0 12px' }}>
          {note}
        </div>
      )}

      <div className="tbl-wrap">
        <table>
          <thead>
            <tr>
              <th>일자</th>
              <th>업무</th>
              <th>작업자별 인건비</th>
              <th style={{ textAlign: 'right' }}>식대</th>
              <th style={{ textAlign: 'right' }}>인건비</th>
            </tr>
          </thead>
          <tbody>
            {loading && <LoadingRow cols={5} />}
            {!loading &&
              scope.map((l) => (
                <tr key={l.id}>
                  <td className="tnum">{mmdd(l.log_date)}</td>
                  <td>{l.work_text}</td>
                  <td className="t-sub">{crewText(l.crew)}</td>
                  <td className="tnum" style={{ textAlign: 'right' }}>
                    {eok(l.meal_cost)}
                  </td>
                  <td className="tnum" style={{ textAlign: 'right' }}>
                    {eok(l.labor_cost)}
                  </td>
                </tr>
              ))}
            {!loading && scope.length === 0 && (
              <EmptyRow cols={5} text="해당 사업·기간에 미정산 기록이 없습니다." />
            )}
          </tbody>
        </table>
      </div>

      <div className="ops-stats" style={{ marginTop: 14 }}>
        <div className="s">
          <small>작업자별 누계</small>
          <b style={{ fontSize: 13 }}>{tally || '—'}</b>
        </div>
        <div className="s">
          <small>식대 합계</small>
          <b className="tnum">{eok(mealSum)}</b>
        </div>
        <div className="s">
          <small>인건비 합계</small>
          <b className="tnum">{eok(laborSum)}</b>
        </div>
        <div className="s">
          <small>총 합계</small>
          <b className="tnum" style={{ color: 'var(--brand)' }}>
            {eok(total)}
          </b>
        </div>
      </div>

      <div style={{ textAlign: 'right' }}>
        <button
          className="btn pri"
          disabled={scope.length === 0}
          style={{ opacity: scope.length === 0 ? 0.45 : 1, cursor: scope.length === 0 ? 'not-allowed' : 'pointer' }}
          onClick={() => setConfirmOpen(true)}
        >
          지출결의서 상신 →
        </button>
      </div>

      <div className="sec-mini" style={{ marginTop: 10 }}>
        상신 시 일일기록은 잠기고 중복 청구를 막습니다. 대표(김도래) 승인 후 회계 접수 대기로 넘어갑니다.
      </div>

      {confirmOpen && (
        <SettleSubmitModal
          logs={scope}
          projectId={proj}
          projectName={projName}
          from={from}
          to={to}
          mealSum={mealSum}
          laborSum={laborSum}
          total={total}
          me={me}
          onClose={() => setConfirmOpen(false)}
          onSubmitted={(msg) => {
            setConfirmOpen(false)
            setNote(msg)
            onSubmitted()
          }}
        />
      )}
    </section>
  )
}

// ===== 기간 정산 → 지출결의서 상신 모달 =====
function SettleSubmitModal({
  logs,
  projectId,
  projectName,
  from,
  to,
  mealSum,
  laborSum,
  total,
  me,
  onClose,
  onSubmitted,
}: {
  logs: SiteLog[]
  projectId: string
  projectName: string
  from: string
  to: string
  mealSum: number
  laborSum: number
  total: number
  me: string | null
  onClose: () => void
  onSubmitted: (msg: string) => void
}) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const periodTxt = `${from || '…'}~${to || '…'}`

  async function submit() {
    if (logs.length === 0) {
      setErr('상신할 미정산 기록이 없습니다.')
      return
    }
    setBusy(true)
    setErr(null)
    const docNo = `제${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000)}호`

    // 1) 지출결의서 등록 (kind='지출결의서', dept_key='art')
    const { data: appr, error } = await supabase
      .from('approvals')
      .insert({
        doc_no: docNo,
        kind: '지출결의서',
        drafter_id: me,
        biz_code: '법인',
        dept_key: 'art',
        title: `${projectName} 현장 정산 (${periodTxt})`,
        amount: total,
        account: '노무비',
        memo: `현장 일일기록 ${logs.length}건 정산`,
        project_id: projectId || null,
        req_date: TODAY,
        status: '진행',
      })
      .select('id')
      .single()
    if (error || !appr) {
      setBusy(false)
      setErr(error?.message ?? '결의서 생성 실패')
      return
    }

    // 2) 결재선: 기안(본인 승인) → 승인(대표 김도래) → 회계접수
    const { data: boss } = await supabase.from('employees').select('id').eq('name', '김도래').maybeSingle()
    const bossId = (boss as Pick<Employee, 'id'> | null)?.id ?? null
    const now = new Date().toISOString()
    const lns: {
      approval_id: string
      seq: number
      approver_id: string | null
      role: '기안' | '승인' | '회계접수'
      decided: string
      decided_at: string | null
    }[] = [
      { approval_id: appr.id, seq: 1, approver_id: me, role: '기안', decided: '승인', decided_at: now },
      { approval_id: appr.id, seq: 2, approver_id: bossId, role: '승인', decided: '대기', decided_at: null },
      { approval_id: appr.id, seq: 3, approver_id: null, role: '회계접수', decided: '대기', decided_at: null },
    ]
    await supabase.from('approval_lines').insert(lns)

    // 3) 포함된 일일기록 잠금 + 상태 전환 + 결의서 연결
    const ids = logs.map((l) => l.id)
    await supabase
      .from('site_logs')
      .update({ settle_status: '회계처리대기', locked: true, approval_id: appr.id })
      .in('id', ids)

    setBusy(false)
    onSubmitted(`✓ ${docNo} · ${projectName} 현장 정산 지출결의서를 상신했습니다(${eok(total)}). 상신 완료 · 대표 승인 후 회계 접수 대기로 이동합니다.`)
  }

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <div className="mh">
          <div>
            <div className="eyebrow">현장 정산 · 지출결의</div>
            <h3>지출결의서 상신</h3>
          </div>
          <button className="x" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="mb">
          <div className="ops-stats" style={{ marginBottom: 12 }}>
            <div className="s">
              <small>사업</small>
              <b style={{ fontSize: 13 }}>{projectName || '—'}</b>
            </div>
            <div className="s">
              <small>정산 기간</small>
              <b style={{ fontSize: 13 }}>{periodTxt}</b>
            </div>
            <div className="s">
              <small>대상 기록</small>
              <b className="tnum">{logs.length}건</b>
            </div>
          </div>

          <div className="tbl-wrap">
            <table style={{ fontSize: 12 }}>
              <thead>
                <tr>
                  <th>일자</th>
                  <th>업무</th>
                  <th style={{ textAlign: 'right' }}>식대</th>
                  <th style={{ textAlign: 'right' }}>인건비</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id}>
                    <td className="tnum">{mmdd(l.log_date)}</td>
                    <td>{l.work_text}</td>
                    <td className="tnum" style={{ textAlign: 'right' }}>
                      {eok(l.meal_cost)}
                    </td>
                    <td className="tnum" style={{ textAlign: 'right' }}>
                      {eok(l.labor_cost)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: 'var(--brand-soft)', fontWeight: 800 }}>
                  <td colSpan={2}>총 합계 (식대 {eok(mealSum)} + 인건비 {eok(laborSum)})</td>
                  <td className="tnum" colSpan={2} style={{ textAlign: 'right', color: 'var(--brand)' }}>
                    {won(total)}원
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 11.5, marginTop: 10 }}>
            <span className="badge">기안 본인</span>
            <span style={{ color: 'var(--muted)' }}>›</span>
            <span className="badge gold">승인 김도래(대표)</span>
            <span style={{ color: 'var(--muted)' }}>›</span>
            <span className="badge green">회계접수 담당</span>
          </div>

          <div className="sec-mini" style={{ margin: '8px 0 0' }}>
            상신하면 포함된 일일기록 {logs.length}건이 <b>잠기고</b> 중복 청구가 차단됩니다. 계정과목은 <b>노무비</b>로 등록됩니다.
          </div>

          {err && (
            <div className="login-alert err" style={{ margin: '8px 0 0' }}>
              {err}
            </div>
          )}
        </div>
        <div className="mf">
          <button className="btn sec" onClick={onClose} disabled={busy}>
            취소
          </button>
          <button className="btn pri" onClick={submit} disabled={busy}>
            {busy ? '상신 중…' : '지출결의서 상신'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================ Tab C — 작업자·일당 ============================
function WorkersTab({
  workers,
  loading,
  onChanged,
}: {
  workers: SiteWorker[]
  loading: boolean
  onChanged: () => void
}) {
  const [q, setQ] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [editOf, setEditOf] = useState<SiteWorker | null>(null)

  const list = useMemo(() => (!q.trim() ? workers : workers.filter((w) => w.name.includes(q.trim()))), [workers, q])

  return (
    <section className="panel">
      <div className="toolbar">
        <label className="search">
          <svg className="icon" width="15" height="15" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4-4" />
          </svg>
          <input placeholder="작업자 이름 검색" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <button className="btn txt add-txt" style={{ marginLeft: 'auto' }} onClick={() => setAddOpen(true)}>
          작업자 등록
        </button>
      </div>
      <div className="tbl-wrap">
        <table>
          <thead>
            <tr>
              <th>작업자</th>
              <th style={{ textAlign: 'right' }}>일당</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {loading && <LoadingRow cols={3} />}
            {!loading &&
              list.map((w) => (
                <tr key={w.id} style={w.active ? undefined : { opacity: 0.55 }}>
                  <td>
                    <span className="t-title">{w.name}</span>
                    {!w.active && (
                      <span className="badge" style={{ marginLeft: 8 }}>
                        비활성
                      </span>
                    )}
                  </td>
                  <td className="tnum" style={{ textAlign: 'right' }}>
                    {won(w.daily_wage)}원
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="btn sec" style={{ padding: '5px 10px' }} onClick={() => setEditOf(w)}>
                      이름·일당 수정
                    </button>
                  </td>
                </tr>
              ))}
            {!loading && list.length === 0 && <EmptyRow cols={3} text="등록된 작업자가 없습니다." />}
          </tbody>
        </table>
      </div>
      <div className="sec-mini" style={{ marginTop: 10 }}>
        일당 변경은 새로 작성·저장하는 기록부터 적용됩니다. 정산된 기록의 이름·금액은 보존됩니다.
      </div>

      {addOpen && <WorkerModal onClose={() => setAddOpen(false)} onSaved={() => { setAddOpen(false); onChanged() }} />}
      {editOf && (
        <WorkerModal worker={editOf} onClose={() => setEditOf(null)} onSaved={() => { setEditOf(null); onChanged() }} />
      )}
    </section>
  )
}

// 작업자 등록/수정 모달
function WorkerModal({
  worker,
  onClose,
  onSaved,
}: {
  worker?: SiteWorker
  onClose: () => void
  onSaved: () => void
}) {
  const editing = !!worker
  const [name, setName] = useState(worker?.name ?? '')
  const [wage, setWage] = useState(worker?.daily_wage ?? 150000)
  const [active, setActive] = useState(worker?.active ?? true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function save() {
    if (!name.trim()) {
      setErr('이름을 입력하세요.')
      return
    }
    setBusy(true)
    setErr(null)
    const payload = { name: name.trim(), daily_wage: Number(wage) || 0, active }
    const { error } = editing
      ? await supabase.from('site_workers').update(payload).eq('id', worker!.id)
      : await supabase.from('site_workers').insert(payload)
    setBusy(false)
    if (error) {
      setErr(error.message)
      return
    }
    onSaved()
  }

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
        <div className="mh">
          <div>
            <div className="eyebrow">현장 · 작업자</div>
            <h3>{editing ? '이름·일당 수정' : '작업자 등록'}</h3>
          </div>
          <button className="x" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="mb">
          <div className="mfield">
            <label>이름</label>
            <input className="ctl" value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 박작업" autoFocus />
          </div>
          <div className="mfield">
            <label>일당 (원)</label>
            <input
              className="ctl"
              type="number"
              min={0}
              step={10000}
              value={wage || ''}
              onChange={(e) => setWage(parseInt(e.target.value, 10) || 0)}
              placeholder="0"
            />
          </div>
          {editing && (
            <label className="mfield" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
              <span>활성 (해제 시 일일기록 작성 명단에서 숨김)</span>
            </label>
          )}
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
          <button className="btn pri" onClick={save} disabled={busy}>
            {busy ? '저장 중…' : editing ? '저장' : '등록'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================ 일일 기록 작성 모달 ============================
function DailyDraftModal({
  projects,
  workers,
  copyFrom,
  me,
  onClose,
  onSaved,
}: {
  projects: Pick<ArtProject, 'id' | 'name'>[]
  workers: SiteWorker[]
  copyFrom: SiteLog | null
  me: string | null
  onClose: () => void
  onSaved: () => void
}) {
  const [date, setDate] = useState(TODAY) // 복사 시에도 오늘 날짜
  const [projectId, setProjectId] = useState(copyFrom?.project_id ?? '')
  const [workText, setWorkText] = useState(copyFrom?.work_text ?? '')
  const [meal, setMeal] = useState(copyFrom?.meal_cost ?? 0)
  // 선택된 작업자 id 집합 (복사 원본의 crew 중 아직 활성인 작업자만 미리 선택)
  const [picked, setPicked] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {}
    if (copyFrom) {
      const activeIds = new Set(workers.map((w) => w.id))
      for (const c of copyFrom.crew) if (c.worker_id && activeIds.has(c.worker_id)) init[c.worker_id] = true
    }
    return init
  })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // crew 스냅샷 = 선택된 활성 작업자 (현재 일당으로 스냅샷)
  const crew: SiteCrewMember[] = useMemo(
    () => workers.filter((w) => picked[w.id]).map((w) => ({ worker_id: w.id, name: w.name, wage: w.daily_wage })),
    [workers, picked],
  )
  const laborCost = crew.reduce((s, c) => s + c.wage, 0)
  const totalCost = laborCost + (Number(meal) || 0)

  function toggle(id: string) {
    setPicked((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  async function save() {
    if (!workText.trim()) {
      setErr('현장 업무 내용을 입력하세요.')
      return
    }
    if (crew.length === 0) {
      setErr('작업자를 1명 이상 선택하세요.')
      return
    }
    setBusy(true)
    setErr(null)
    const projName = projects.find((p) => p.id === projectId)?.name ?? null
    const { error } = await supabase.from('site_logs').insert({
      project_id: projectId || null,
      project_name: projName,
      log_date: date,
      work_text: workText.trim(),
      crew,
      meal_cost: Number(meal) || 0,
      labor_cost: laborCost,
      settle_status: '미정산',
      locked: false,
      created_by: me,
    })
    setBusy(false)
    if (error) {
      setErr(error.message)
      return
    }
    onSaved()
  }

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <div className="mh">
          <div>
            <div className="eyebrow">현장 · 일일기록</div>
            <h3>{copyFrom ? '일일 기록 작성 (복사)' : '일일 기록 작성'}</h3>
          </div>
          <button className="x" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="mb">
          <div style={{ display: 'flex', gap: 10 }}>
            <div className="mfield" style={{ width: 160 }}>
              <label>작성일</label>
              <input className="ctl" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="mfield" style={{ flex: 1 }}>
              <label>사업</label>
              <select className="ctl" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                <option value="">사업 미연결</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mfield">
            <label>현장 업무</label>
            <input className="ctl" value={workText} onChange={(e) => setWorkText(e.target.value)} placeholder="예: 목재 표면 세척·균열 조사" />
          </div>

          <div className="mfield">
            <label>작업자 (선택 시 그날 일당이 스냅샷됩니다)</label>
            {workers.length === 0 ? (
              <div className="sec-mini" style={{ display: 'block', margin: 0, color: 'var(--muted)' }}>
                활성 작업자가 없습니다. '작업자·일당' 탭에서 먼저 등록하세요.
              </div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                {workers.map((w) => {
                  const on = !!picked[w.id]
                  return (
                    <button
                      key={w.id}
                      type="button"
                      className={on ? 'chip set-done' : 'chip'}
                      style={{ cursor: 'pointer', border: on ? undefined : '1px solid var(--line)' }}
                      onClick={() => toggle(w.id)}
                    >
                      <i />
                      {w.name} · {eok(w.daily_wage)}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          <div className="mfield">
            <label>식대 (원)</label>
            <input
              className="ctl"
              type="number"
              min={0}
              step={1000}
              value={meal || ''}
              onChange={(e) => setMeal(parseInt(e.target.value, 10) || 0)}
              placeholder="0"
            />
          </div>

          <div className="ops-stats" style={{ marginBottom: 0 }}>
            <div className="s">
              <small>작업자</small>
              <b className="tnum">{crew.length}명</b>
            </div>
            <div className="s">
              <small>인건비 합계</small>
              <b className="tnum">{won(laborCost)}원</b>
            </div>
            <div className="s">
              <small>식대 포함 합계</small>
              <b className="tnum" style={{ color: 'var(--brand)' }}>
                {won(totalCost)}원
              </b>
            </div>
          </div>

          {err && (
            <div className="login-alert err" style={{ margin: '8px 0 0' }}>
              {err}
            </div>
          )}
        </div>
        <div className="mf">
          <button className="btn sec" onClick={onClose} disabled={busy}>
            취소
          </button>
          <button className="btn pri" onClick={save} disabled={busy}>
            {busy ? '저장 중…' : '기록 저장'}
          </button>
        </div>
      </div>
    </div>
  )
}
