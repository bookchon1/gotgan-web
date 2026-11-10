import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHead } from '../../components/PageHead'
import { ErrorBanner, LoadingRow, EmptyRow } from '../../components/States'
import { supabase } from '../../lib/supabase'
import { useQuery } from '../../lib/useQuery'
import { won } from '../../lib/format'
import ArtSchedule from './ArtSchedule'
import type { ArtProject, BudgetReceipt, ArtStatus } from '../../types/db'

const ART_STATUSES: ArtStatus[] = ['공고/입찰', '예정', '진행', '완료', '탈락/보류']

// 진행상태 정렬 우선순위 (시안: 진행 먼저, 완료·보류 뒤로)
const ST_ORDER: Record<string, number> = {
  진행: 0,
  '공고/입찰': 1,
  예정: 2,
  완료: 3,
  '탈락/보류': 4,
}

const CUR_YEAR = 2026

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

export default function ArtList() {
  const navigate = useNavigate()
  const [showDone, setShowDone] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  // 수정 대상 사업 (null=닫힘)
  const [editP, setEditP] = useState<ArtProject | null>(null)
  const [rowBusy, setRowBusy] = useState(false)

  const projects = useQuery<ArtProject[]>(
    async () =>
      await supabase
        .from('art_projects')
        .select(
          'id,name,client,biz_code,proj_type,kind,status,progress,now_text,est_amount,owner_id,contract_base,due_date,done_date,year',
        ),
    [],
  )
  const receipts = useQuery<Pick<BudgetReceipt, 'project_id' | 'amount'>[]>(
    async () => await supabase.from('budget_receipts').select('project_id,amount'),
    [],
  )

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
        .filter((p) => showDone || isCurrent(p))
        .sort((a, b) => {
          const oa = ST_ORDER[a.status] ?? 2
          const ob = ST_ORDER[b.status] ?? 2
          if (oa !== ob) return oa - ob
          // 같은 상태면 준공 임박(마감 가까운) 순
          const ad = (a.due_date || '9999').slice(0, 10)
          const bd = (b.due_date || '9999').slice(0, 10)
          return ad < bd ? -1 : ad > bd ? 1 : 0
        }),
    [all, showDone],
  )
  const hiddenDone = all.filter((p) => !isCurrent(p)).length

  let tCon = 0,
    tRec = 0
  for (const p of list) {
    tCon += Number(p.contract_base) || 0
    tRec += receivedMap[p.id] || 0
  }

  async function removeProject(p: ArtProject) {
    if (
      !window.confirm(
        `사업 "${p.name}" 을(를) 삭제할까요?\n예산·수금·세부진행 등 하위 데이터가 함께 삭제되며 되돌릴 수 없습니다.`,
      )
    )
      return
    setRowBusy(true)
    const { error } = await supabase.from('art_projects').delete().eq('id', p.id)
    setRowBusy(false)
    if (error) {
      alert('삭제 실패: ' + error.message)
      return
    }
    projects.reload()
  }

  return (
    <div className="page on">
      <PageHead
        eyebrow="미술 · 사업"
        title="사업관리"
        desc="진행 중이거나 당해연도 사업을 확인하세요. 행을 클릭하면 상세로 이동합니다."
        actions={
          <>
            {(hiddenDone > 0 || showDone) && (
              <button
                className={`btn ${showDone ? 'pri' : 'sec'}`}
                onClick={() => setShowDone((v) => !v)}
              >
                {showDone ? '진행 사업만 보기' : `완료 사업 보기 (${hiddenDone})`}
              </button>
            )}
            <button className="btn txt add-txt" onClick={() => setAddOpen(true)}>
              + 사업 등록
            </button>
          </>
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
                <th style={{ textAlign: 'right' }}>관리</th>
              </tr>
            </thead>
            <tbody>
              {projects.loading && <LoadingRow cols={9} />}
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
                              style={{ width: `${p.progress}%` }}
                            />
                          </div>
                          <span>{p.progress}%</span>
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
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button
                          className="btn txt"
                          style={{ padding: '2px 6px', fontSize: 11.5 }}
                          onClick={(e) => {
                            e.stopPropagation()
                            setEditP(p)
                          }}
                          disabled={rowBusy}
                        >
                          수정
                        </button>
                        <button
                          className="btn txt"
                          style={{ padding: '2px 6px', fontSize: 11.5, color: 'var(--danger)' }}
                          onClick={(e) => {
                            e.stopPropagation()
                            removeProject(p)
                          }}
                          disabled={rowBusy}
                        >
                          삭제
                        </button>
                      </td>
                    </tr>
                  )
                })}
              {!projects.loading && list.length === 0 && !projects.error && (
                <EmptyRow cols={9} text="표시할 사업이 없습니다." />
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
                  <td colSpan={2} />
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

      {(addOpen || editP) && (
        <ArtProjectModal
          project={editP}
          onClose={() => {
            setAddOpen(false)
            setEditP(null)
          }}
          onSaved={() => {
            setAddOpen(false)
            setEditP(null)
            projects.reload()
          }}
        />
      )}
    </div>
  )
}

// 시안 '② 입찰·계약'의 낙찰 방법 옵션
const BID_METHODS = ['협상에의한계약', '수의계약', '일반경쟁', '제한경쟁']
// 시안 '사업 유형' 옵션
const PROJ_TYPES = ['서화', '조형', '건축', '기타']

/** 미술 사업 등록·수정 — art_projects insert/update (시안 사업개요 + 입찰·계약 + 관계자) */
function ArtProjectModal({
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
  const [bizCode, setBizCode] = useState(project?.biz_code ?? '법인')
  const [status, setStatus] = useState<ArtStatus>(project?.status ?? '예정')
  const [contractBase, setContractBase] = useState(Number(project?.contract_base) || 0)
  // 입찰·계약
  const [bidMethod, setBidMethod] = useState(project?.bid_method ?? '협상에의한계약')
  const [bidDate, setBidDate] = useState(project?.bid_date ?? '')
  const [contractDate, setContractDate] = useState(project?.contract_date ?? '')
  const [startDate, setStartDate] = useState(project?.start_date ?? '')
  const [dueDate, setDueDate] = useState(project?.due_date ?? '')
  // 관계자(발주담당) — 신규 등록 시에만 함께 입력. 수정은 상세에서.
  const [ownerName, setOwnerName] = useState('')
  const [ownerPhone, setOwnerPhone] = useState('')
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
      bid_date: bidDate || null,
      contract_date: contractDate || null,
      start_date: startDate || null,
      due_date: dueDate || null,
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

    // 신규: 사업 생성 후 발주담당(관계자) 1건 함께 등록
    const { data, error } = await supabase
      .from('art_projects')
      .insert({ ...payload, progress: 0, est_amount: 0 })
      .select('id')
      .single()
    if (error) {
      setBusy(false)
      setErr(error.message)
      return
    }
    if (data?.id && ownerName.trim()) {
      await supabase.from('art_stakeholders').insert({
        project_id: data.id,
        kind: '발주담당',
        name: ownerName.trim(),
        org: client.trim() || null,
        phone: ownerPhone.trim() || null,
        sort: 0,
      })
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
              <label>사업자</label>
              <select className="ctl" value={bizCode} onChange={(e) => setBizCode(e.target.value)}>
                <option value="법인">법인(미술)</option>
                <option value="개인">개인(도래헌)</option>
                <option value="더북촌">더북촌</option>
              </select>
            </div>
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
              <label>낙찰 방법</label>
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
              <label>입찰 일정</label>
              <input className="ctl" type="date" value={bidDate} onChange={(e) => setBidDate(e.target.value)} />
            </div>
            <div className="mfield" style={{ flex: 1 }}>
              <label>계약일</label>
              <input className="ctl" type="date" value={contractDate} onChange={(e) => setContractDate(e.target.value)} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div className="mfield" style={{ flex: 1 }}>
              <label>착공일</label>
              <input className="ctl" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="mfield" style={{ flex: 1 }}>
              <label>준공 기한(예정)</label>
              <input className="ctl" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
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

          {/* ③ 관계자 — 신규 등록 시에만 (수정은 상세에서) */}
          {!editing && (
            <>
              <p className="sec-mini" style={{ margin: '16px 0 8px', fontWeight: 700, color: 'var(--brand-ink)' }}>
                ③ 관계자 <span style={{ fontWeight: 600, color: 'var(--muted)' }}>(발주 담당 · 등록 후 상세에서 추가)</span>
              </p>
              <div style={{ display: 'flex', gap: 10 }}>
                <div className="mfield" style={{ flex: 1 }}>
                  <label>발주 담당</label>
                  <input className="ctl" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} placeholder="예: 김○○ 학예사" />
                </div>
                <div className="mfield" style={{ flex: 1 }}>
                  <label>연락처</label>
                  <input className="ctl" value={ownerPhone} onChange={(e) => setOwnerPhone(e.target.value)} placeholder="010-0000-0000" />
                </div>
              </div>
            </>
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
          <button className="btn pri" onClick={submit} disabled={busy || !name.trim()}>
            {busy ? '저장 중…' : editing ? '저장' : '등록'}
          </button>
        </div>
      </div>
    </div>
  )
}
