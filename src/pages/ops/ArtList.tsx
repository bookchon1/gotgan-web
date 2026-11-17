import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHead } from '../../components/PageHead'
import { ErrorBanner, LoadingRow, EmptyRow } from '../../components/States'
import { supabase } from '../../lib/supabase'
import { useQuery } from '../../lib/useQuery'
import { won } from '../../lib/format'
import ArtSchedule from './ArtSchedule'
import type { ArtProject, BudgetReceipt, ArtStatus, ProjectStep } from '../../types/db'
import { stepProgress } from './artDetail'

export const ART_STATUSES: ArtStatus[] = ['공고/입찰', '예정', '진행', '완료', '탈락/보류']

// 진행상태 정렬 우선순위 (시안: 진행 먼저, 완료·보류 뒤로)
const ST_ORDER: Record<string, number> = {
  진행: 0,
  '공고/입찰': 1,
  예정: 2,
  완료: 3,
  '탈락/보류': 4,
}

const CUR_YEAR = new Date().getFullYear()

// 상태 → chip 클래스 (시안 stChip)
const ST_CHIP: Record<string, string> = {
  진행: 'c-prog',
  완료: 'c-done',
  예정: 'c-plan',
  '공고/입찰': 'c-wait',
  '탈락/보류': 'set-hold',
}
function StChip({ st }: { st: ArtStatus }) {
  return (
    <span className={`chip ${ST_CHIP[st] || 'c-plan'}`}>
      <i />
      {st}
    </span>
  )
}

// 억 단위, 0은 — (시안 bizEok)
function bizEok(n: number): string {
  if (!n) return '—'
  return (n / 100_000_000).toFixed(1).replace(/\.0$/, '') + '억'
}

// D-day 배지 (시안 ddayBadge) — 기준일은 오늘
function DdayBadge({ p }: { p: ArtProject }) {
  if (p.done_date || p.status === '완료')
    return <span className="badge green" style={{ fontSize: 10 }}>준공완료</span>
  if (p.status === '탈락/보류')
    return <span className="badge" style={{ fontSize: 10, color: 'var(--muted)' }}>—</span>
  if (!p.due_date)
    return <span className="badge" style={{ fontSize: 10, color: 'var(--muted)' }}>기한 미정</span>
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diff = Math.round((+new Date(p.due_date) - +today) / 86_400_000)
  let txt: string, color: string
  if (diff === 0) {
    txt = 'D-DAY'
    color = 'var(--danger)'
  } else if (diff > 0) {
    txt = 'D-' + diff
    color = diff <= 30 ? 'var(--warn)' : 'var(--brand)'
  } else {
    txt = 'D+' + -diff
    color = 'var(--danger)'
  }
  return (
    <span
      className="badge"
      style={{
        fontSize: 10,
        fontWeight: 800,
        background: 'transparent',
        border: `1px solid ${color}`,
        color,
      }}
    >
      {txt}
    </span>
  )
}

// 당해연도 노출 대상 (시안 bizIsCurrent): 완료가 아니면 노출, 완료는 올해 준공만
function isCurrent(p: ArtProject): boolean {
  if (p.status !== '완료') return true
  const dy = (p.done_date || p.due_date || '').slice(0, 4)
  return dy === String(CUR_YEAR)
}

/** 년도 필터 기준: 준공(준공일·없으면 준공 예정일) 또는 착공(착공일·없으면 계약일) 년도 */
function basisYear(p: ArtProject, basis: 'done' | 'start'): number | null {
  const d = basis === 'done' ? p.done_date || p.due_date : p.start_date || p.contract_date
  const y = d ? parseInt(d.slice(0, 4), 10) : NaN
  if (Number.isFinite(y)) return y
  return basis === 'done' && p.year ? Number(p.year) : null
}

export default function ArtList() {
  const navigate = useNavigate()
  const [stFilter, setStFilter] = useState<'all' | 'prog' | 'done'>('all')
  const [yearFilter, setYearFilter] = useState('all') // 'all' | '2026' ...
  const [yearBasis, setYearBasis] = useState<'done' | 'start'>('done') // 준공 기준 / 착공 기준
  const [addOpen, setAddOpen] = useState(false)

  const projects = useQuery<ArtProject[]>(
    async () =>
      await supabase
        .from('art_projects')
        .select(
          'id,name,client,biz_code,proj_type,kind,status,progress,now_text,est_amount,owner_id,contract_base,contract_date,start_date,due_date,done_date,year',
        ),
    [],
  )
  const receipts = useQuery<Pick<BudgetReceipt, 'project_id' | 'amount'>[]>(
    async () => await supabase.from('budget_receipts').select('project_id,amount'),
    [],
  )

  // 진행률: 사업 상세 '진행현황' 공정으로 계산 (공정이 없으면 저장값 사용)
  const stepsQ = useQuery<Pick<ProjectStep, 'project_id' | 'status'>[]>(
    async () => await supabase.from('project_steps').select('project_id,status'),
    [],
  )
  const progressMap = useMemo(() => {
    const by: Record<string, Pick<ProjectStep, 'project_id' | 'status'>[]> = {}
    for (const st of stepsQ.data ?? []) (by[st.project_id] ??= []).push(st)
    const m: Record<string, number> = {}
    for (const [pid, arr] of Object.entries(by)) m[pid] = stepProgress(arr as ProjectStep[]).pct
    return m
  }, [stepsQ.data])
  const pctOf = (p: ArtProject) => progressMap[p.id] ?? p.progress ?? 0

  // project_id → 수금 합계
  const receivedMap = useMemo(() => {
    const m: Record<string, number> = {}
    for (const r of receipts.data ?? []) m[r.project_id] = (m[r.project_id] || 0) + (Number(r.amount) || 0)
    return m
  }, [receipts.data])

  const all = projects.data ?? []
  const list = useMemo(
    () =>
      all
        .filter((p) => (stFilter === 'all' ? true : stFilter === 'done' ? p.status === '완료' : p.status !== '완료'))
        .filter((p) => yearFilter === 'all' || basisYear(p, yearBasis) === Number(yearFilter))
        .sort((a, b) => {
          const oa = ST_ORDER[a.status] ?? 2
          const ob = ST_ORDER[b.status] ?? 2
          if (oa !== ob) return oa - ob
          // 같은 상태면 준공 임박(마감 가까운) 순
          const ad = (a.due_date || '9999').slice(0, 10)
          const bd = (b.due_date || '9999').slice(0, 10)
          return ad < bd ? -1 : ad > bd ? 1 : 0
        }),
    [all, stFilter, yearFilter, yearBasis],
  )
  // 년도 선택지: 선택한 기준(준공/착공)의 년도들 + 올해
  const yearOptions = useMemo(() => {
    const set = new Set<number>([CUR_YEAR])
    for (const p of all) {
      const y = basisYear(p, yearBasis)
      if (y) set.add(y)
    }
    return [...set].sort((a, b) => b - a)
  }, [all, yearBasis])

  let tCon = 0,
    tRec = 0
  for (const p of list) {
    tCon += Number(p.contract_base) || 0
    tRec += receivedMap[p.id] || 0
  }

  return (
    <div className="page on">
      <PageHead
        eyebrow="미술 · 사업"
        title="사업관리"
        desc="전체·진행·완료와 준공·착공 년도로 사업을 찾아보세요. 행을 클릭하면 상세로 이동합니다."
        actions={
          <button className="btn txt add-txt" onClick={() => setAddOpen(true)}>
            + 사업 등록
          </button>
        }
      />

      {/* 업무 일정 (주간·월간·분기) — 공정·미술업무 자동 집계 */}
      <ArtSchedule />

      <section className="panel">
        <div className="panel-h">
          <div>
            <h2>
              사업 목록 <span className="count">{projects.loading ? '…' : list.length}</span>
            </h2>
          </div>
          <div className="r" style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
            <div className="seg-text">
              {([['all', '전체'], ['prog', '진행'], ['done', '완료']] as const).map(([k, l]) => (
                <button key={k} className={stFilter === k ? 'on' : ''} onClick={() => setStFilter(k)}>
                  {l}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <select
                className="sel"
                style={{ width: 80 }}
                value={yearBasis}
                onChange={(e) => setYearBasis(e.target.value as 'done' | 'start')}
                aria-label="준공·착공"
              >
                <option value="done">준공</option>
                <option value="start">착공</option>
              </select>
              <select
                className="sel"
                style={{ width: 104 }}
                value={yearFilter}
                onChange={(e) => setYearFilter(e.target.value)}
                aria-label="년도"
              >
                <option value="all">전체</option>
                {yearOptions.map((y) => (
                  <option key={y} value={String(y)}>
                    {y}년도
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <ErrorBanner error={projects.error} table="art_projects" />

        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>사업명 / 발주기관</th>
                <th>유형</th>
                <th>진행상태</th>
                <th>진행률</th>
                <th style={{ textAlign: 'right' }}>계약금</th>
                <th style={{ textAlign: 'right' }}>수금</th>
                <th style={{ textAlign: 'right' }}>잔금</th>
                <th style={{ textAlign: 'center' }}>D-day</th>
              </tr>
            </thead>
            <tbody>
              {projects.loading && <LoadingRow cols={8} />}
              {!projects.loading &&
                list.map((p) => {
                  const recv = receivedMap[p.id] || 0
                  const bal = (p.contract_base || 0) - recv
                  const pastDone = p.status === '완료' && !isCurrent(p)
                  return (
                    <tr
                      key={p.id}
                      onClick={() => navigate(`/ops/art/${p.id}`)}
                      style={{ cursor: 'pointer', opacity: pastDone ? 0.72 : 1 }}
                    >
                      <td>
                        <div className="t-title">
                          {p.name}
                          {pastDone && (
                            <span className="badge" style={{ fontSize: 9, color: 'var(--muted)' }}>
                              지난 완료
                            </span>
                          )}
                        </div>
                        <div className="t-sub">{p.client}</div>
                      </td>
                      <td>
                        <span className="badge gold">{p.proj_type}</span>
                      </td>
                      <td>
                        <StChip st={p.status} />
                      </td>
                      <td>
                        <div className="pbar">
                          <div className="track">
                            <div
                              className={`fill${p.progress === 100 ? ' full' : ''}`}
                              style={{ width: `${pctOf(p)}%` }}
                            />
                          </div>
                          <span>{pctOf(p)}%</span>
                        </div>
                      </td>
                      <td className="tnum" style={{ textAlign: 'right' }}>
                        {bizEok(p.contract_base)}
                      </td>
                      <td className="tnum" style={{ textAlign: 'right', color: 'var(--ok)' }}>
                        {bizEok(recv)}
                      </td>
                      <td
                        className="tnum"
                        style={{
                          textAlign: 'right',
                          fontWeight: 700,
                          color: bal > 0 ? 'var(--danger)' : 'var(--muted)',
                        }}
                      >
                        {bizEok(bal)}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <DdayBadge p={p} />
                      </td>
                    </tr>
                  )
                })}
              {!projects.loading && list.length === 0 && !projects.error && (
                <EmptyRow cols={8} text="표시할 사업이 없습니다." />
              )}
            </tbody>
            {list.length > 0 && (
              <tfoot>
                <tr
                  style={{
                    borderTop: '2px solid var(--line)',
                    fontWeight: 800,
                    background: 'var(--brand-soft)',
                  }}
                >
                  <td colSpan={4}>합계 ({list.length}건)</td>
                  <td className="tnum" style={{ textAlign: 'right' }}>
                    {bizEok(tCon)}
                  </td>
                  <td className="tnum" style={{ textAlign: 'right', color: 'var(--ok)' }}>
                    {bizEok(tRec)}
                  </td>
                  <td className="tnum" style={{ textAlign: 'right', color: 'var(--danger)' }}>
                    {bizEok(tCon - tRec)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        <div className="table-foot">
          <span>수금 = 대금 수령 합계 · 잔금 = 계약금 − 수금 (예산현황 연동) · D-day = 준공 예정일 기준</span>
          <span>행을 클릭하면 사업 상세로 이동합니다.</span>
        </div>
      </section>

      {addOpen && (
        <ArtProjectModal
          project={null}
          onClose={() => setAddOpen(false)}
          onSaved={() => {
            setAddOpen(false)
            projects.reload()
          }}
        />
      )}
    </div>
  )
}

// 시안 '② 입찰·계약'의 계약방법 옵션
export const BID_METHODS = ['협상에의한계약', '수의계약', '일반경쟁', '제한경쟁']
// 시안 '사업 유형' 옵션
export const PROJ_TYPES = ['서화', '조형', '건축', '기타']

/** 미술 사업 등록·수정 — art_projects insert/update (시안 사업개요 + 입찰·계약 + 관계자) */
export function ArtProjectModal({
  project,
  onClose,
  onSaved,
}: {
  project: ArtProject | null
  onClose: () => void
  onSaved: () => void
}) {
  const editing = !!project
  const [name, setName] = useState(project?.name ?? '')
  const [client, setClient] = useState(project?.client ?? '')
  const [projType, setProjType] = useState(project?.proj_type ?? '서화')
  const [kind, setKind] = useState<'입찰' | '발주'>(project?.kind ?? '발주')
  const bizCode = project?.biz_code ?? '법인' // 미술은 법인 소속 고정
  const [status, setStatus] = useState<ArtStatus>(project?.status ?? '예정')
  const [contractBase, setContractBase] = useState(Number(project?.contract_base) || 0)
  // 입찰·계약
  const [bidMethod, setBidMethod] = useState(project?.bid_method ?? '협상에의한계약')
  const [contractDate, setContractDate] = useState(project?.contract_date ?? '')
  const [startDate, setStartDate] = useState(project?.start_date ?? '')
  const [dueDate, setDueDate] = useState(project?.due_date ?? '')
  const [doneDate, setDoneDate] = useState(project?.done_date ?? '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function submit() {
    if (!name.trim()) {
      setErr('사업명을 입력하세요.')
      return
    }
    setBusy(true)
    setErr(null)
    const payload = {
      name: name.trim(),
      client: client.trim() || null,
      biz_code: bizCode,
      proj_type: projType || null,
      kind,
      status,
      contract_base: contractBase,
      bid_method: bidMethod || null,
      contract_date: contractDate || null,
      start_date: startDate || null,
      due_date: dueDate || null,
      done_date: doneDate || null,
      year: (dueDate ? +dueDate.slice(0, 4) : null) || project?.year || CUR_YEAR,
    }

    if (editing) {
      const { error } = await supabase.from('art_projects').update(payload).eq('id', project!.id)
      setBusy(false)
      if (error) {
        setErr(error.message)
        return
      }
      onSaved()
      return
    }

    // 신규 사업 생성
    const { error } = await supabase
      .from('art_projects')
      .insert({ ...payload, progress: 0, est_amount: 0 })
    if (error) {
      setBusy(false)
      setErr(error.message)
      return
    }
    setBusy(false)
    onSaved()
  }

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
        <div className="mh">
          <div>
            <div className="eyebrow">ART · 사업 {editing ? '수정' : '등록'}</div>
            <h3>{editing ? name || '사업 수정' : '새 미술 사업'}</h3>
          </div>
          <button className="x" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="mb">
          {/* ① 사업개요 */}
          <p className="sec-mini" style={{ margin: '0 0 8px', fontWeight: 700, color: 'var(--brand-ink)' }}>
            ① 사업개요
          </p>
          <div className="mfield">
            <label>사업명</label>
            <input
              className="ctl"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 삼국유사 목판 보존처리"
              autoFocus
            />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div className="mfield" style={{ flex: 1 }}>
              <label>발주기관</label>
              <input
                className="ctl"
                value={client}
                onChange={(e) => setClient(e.target.value)}
                placeholder="예: 국립경주박물관"
              />
            </div>
            <div className="mfield" style={{ width: 140 }}>
              <label>사업 유형</label>
              <select className="ctl" value={projType} onChange={(e) => setProjType(e.target.value)}>
                {/* 기존값이 옵션에 없으면(과거 자유입력) 그대로 유지 */}
                {projType && !PROJ_TYPES.includes(projType) && <option value={projType}>{projType}</option>}
                {PROJ_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div className="mfield" style={{ flex: 1 }}>
              <label>진행상태</label>
              <select className="ctl" value={status} onChange={(e) => setStatus(e.target.value as ArtStatus)}>
                {ART_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* ② 입찰·계약 */}
          <p className="sec-mini" style={{ margin: '16px 0 8px', fontWeight: 700, color: 'var(--brand-ink)' }}>
            ② 입찰·계약
          </p>
          <div style={{ display: 'flex', gap: 10 }}>
            <div className="mfield" style={{ flex: 1 }}>
              <label>계약방법</label>
              <select className="ctl" value={bidMethod} onChange={(e) => setBidMethod(e.target.value)}>
                {bidMethod && !BID_METHODS.includes(bidMethod) && <option value={bidMethod}>{bidMethod}</option>}
                {BID_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div className="mfield" style={{ width: 130 }}>
              <label>구분</label>
              <select className="ctl" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
                <option value="발주">발주</option>
                <option value="입찰">입찰</option>
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div className="mfield" style={{ flex: 1 }}>
              <label>계약일</label>
              <input className="ctl" type="date" min="1900-01-01" max="9999-12-31" value={contractDate} onChange={(e) => setContractDate(e.target.value)} />
            </div>
            <div className="mfield" style={{ flex: 1 }}>
              <label>착공일</label>
              <input className="ctl" type="date" min="1900-01-01" max="9999-12-31" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div className="mfield" style={{ flex: 1 }}>
              <label>준공 기한(예정)</label>
              <input className="ctl" type="date" min="1900-01-01" max="9999-12-31" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <div className="mfield" style={{ flex: 1 }}>
              <label>준공일</label>
              <input className="ctl" type="date" min="1900-01-01" max="9999-12-31" value={doneDate} onChange={(e) => {
                  setDoneDate(e.target.value)
                  if (e.target.value) setStatus('완료')
                  else if (status === '완료') setStatus('진행')
                }} />
            </div>
          </div>
          <div className="mfield">
            <label>계약금 🔒</label>
            <input
              className="ctl tnum"
              type="text"
              value={contractBase ? won(contractBase) : ''}
              onChange={(e) => setContractBase(parseInt(e.target.value.replace(/[^0-9]/g, ''), 10) || 0)}
              placeholder="예: 220,000,000"
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
          <button className="btn pri" onClick={submit} disabled={busy || !name.trim()}>
            {busy ? '저장 중…' : editing ? '저장' : '등록'}
          </button>
        </div>
      </div>
    </div>
  )
}
