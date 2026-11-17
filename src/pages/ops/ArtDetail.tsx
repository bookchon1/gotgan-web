import { useMemo, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Icon } from '../../components/Icon'
import { ErrorBanner, CenterNote } from '../../components/States'
import { supabase } from '../../lib/supabase'
import { useQuery } from '../../lib/useQuery'
import { eok, won, dateOnly } from '../../lib/format'
import type {
  ArtProject,
  ArtStatus,
  ArtBudget,
  BudgetChange,
  BudgetReceipt,
  ProjectStep,
  StepComment,
  Advisor,
  ArtStakeholder,
  AcctTx,
} from '../../types/db'
import {
  contractAmount,
  receivedAmount,
  usedByItem,
  budgetRows,
  pctColor,
  stepProgress,
} from './artDetail'
import { Step20Editor } from './Step20Editor'
import { BudgetTxPopup } from './BudgetTxPopup'
import { AdvisorFeeModal } from './AdvisorFeeModal'
import { BID_METHODS, PROJ_TYPES, ART_STATUSES } from './ArtList'

// 원가계산서 예산 항목 (시안 기준)
const BUDGET_ITEMS = ['재료비', '노무비', '경비', '외주가공비', '이윤', '보존처리계획', '훈증', '자문회비']

export default function ArtDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const detailsRefs = useRef<HTMLDetailsElement[]>([])
  const [budItem, setBudItem] = useState<string | null>(null)
  const [advOpen, setAdvOpen] = useState(false)
  const [advEdit, setAdvEdit] = useState<null | Advisor | 'new'>(null)
  const [advForm, setAdvForm] = useState({ name: '', org: '', phone: '', default_fee: 0 })
  const [addChange, setAddChange] = useState(false)
  const [changeForm, setChangeForm] = useState({ date: '', type: '증액', memo: '', after: 0 })
  const [addReceipt, setAddReceipt] = useState(false)
  const [receiptForm, setReceiptForm] = useState({ kind: '기성', date: '', amount: 0 })
  const [addBudget, setAddBudget] = useState(false)
  const [budgetForm, setBudgetForm] = useState({ item: '재료비', alloc: 0 })
  const [budBusy, setBudBusy] = useState(false)
  const [stkEdit, setStkEdit] = useState<null | ArtStakeholder | 'new'>(null)
  const [stkForm, setStkForm] = useState({ kind: '발주담당', name: '', org: '', phone: '', email: '' })
  const [stkBusy, setStkBusy] = useState(false)
  // 사업개요 인라인 수정 모드 (헤더 + 사업개요 전체)
  const [editing, setEditing] = useState(false)
  const [editBusy, setEditBusy] = useState(false)
  const [ef, setEf] = useState({
    name: '', status: '예정' as ArtStatus, contract_base: 0, kind: '발주', client: '', proj_type: '서화',
    bid_method: '협상에의한계약', contract_date: '', start_date: '', due_date: '', done_date: '',
  })
  const setE = (k: keyof typeof ef, v: string | number) => setEf((o) => ({ ...o, [k]: v }))

  const projQ = useQuery<ArtProject[]>(
    async () => await supabase.from('art_projects').select('*').eq('id', id!),
    [id],
  )
  const budgetQ = useQuery<ArtBudget[]>(
    async () => await supabase.from('art_budget').select('*').eq('project_id', id!),
    [id],
  )
  const changesQ = useQuery<BudgetChange[]>(
    async () => await supabase.from('budget_changes').select('*').eq('project_id', id!),
    [id],
  )
  const receiptsQ = useQuery<BudgetReceipt[]>(
    async () => await supabase.from('budget_receipts').select('*').eq('project_id', id!),
    [id],
  )
  const stepsQ = useQuery<ProjectStep[]>(
    async () =>
      await supabase.from('project_steps').select('*').eq('project_id', id!).order('seq', { ascending: true }),
    [id],
  )
  const advQ = useQuery<Advisor[]>(
    async () => await supabase.from('advisors').select('*').eq('project_id', id!).order('sort', { ascending: true }),
    [id],
  )
  const stkQ = useQuery<ArtStakeholder[]>(
    async () => await supabase.from('art_stakeholders').select('*').eq('project_id', id!).order('sort', { ascending: true }),
    [id],
  )
  const txQ = useQuery<AcctTx[]>(
    async () => await supabase.from('acct_tx').select('*').eq('project_id', id!),
    [id],
  )
  const stepIds = useMemo(() => (stepsQ.data ?? []).map((s) => s.id), [stepsQ.data])
  const cmtQ = useQuery<StepComment[]>(
    async () =>
      stepIds.length
        ? await supabase.from('step_comments').select('*').in('step_id', stepIds)
        : { data: [], error: null },
    [stepIds.join(',')],
  )

  const p = projQ.data?.[0]
  const budget = budgetQ.data ?? []
  const changes = changesQ.data ?? []
  const receipts = receiptsQ.data ?? []
  const steps = stepsQ.data ?? []
  const advisors = advQ.data ?? []
  const stakeholders = stkQ.data ?? []
  const tx = txQ.data ?? []
  const comments = cmtQ.data ?? []

  // 공정 변경 시 재조회 (+ 진행률 반영 위해 사업도)
  const reloadSteps = () => {
    stepsQ.reload()
    cmtQ.reload()
  }
  const reloadAdvisors = () => {
    advQ.reload()
    txQ.reload()
  }

  async function saveChange() {
    if (!changeForm.date || !changeForm.after) return
    setBudBusy(true)
    const { error } = await supabase.from('budget_changes').insert({
      project_id: id!,
      date: changeForm.date,
      type: changeForm.type,
      memo: changeForm.memo || null,
      after_amount: changeForm.after,
    })
    setBudBusy(false)
    if (error) {
      alert('설계변경 저장 실패: ' + error.message)
      return
    }
    setAddChange(false)
    setChangeForm({ date: '', type: '증액', memo: '', after: 0 })
    changesQ.reload()
  }
  async function saveReceipt() {
    if (!receiptForm.date || !receiptForm.amount) return
    setBudBusy(true)
    // 대금 수령 + 매출 전표 자동 생성(RPC)
    const { error } = await supabase.rpc('art_add_receipt', {
      p_project_id: id!,
      p_kind: receiptForm.kind,
      p_date: receiptForm.date,
      p_amount: receiptForm.amount,
      p_make_tx: true,
    })
    setBudBusy(false)
    if (error) {
      alert('대금 수령 저장 실패: ' + error.message)
      return
    }
    setAddReceipt(false)
    setReceiptForm({ kind: '기성', date: '', amount: 0 })
    receiptsQ.reload()
  }
  async function saveStk() {
    if (!stkForm.name.trim()) return
    setStkBusy(true)
    const payload = {
      kind: stkForm.kind,
      name: stkForm.name.trim(),
      org: stkForm.org.trim() || null,
      phone: stkForm.phone.trim() || null,
      email: stkForm.email.trim() || null,
    }
    const { error } =
      stkEdit && stkEdit !== 'new'
        ? await supabase.from('art_stakeholders').update(payload).eq('id', stkEdit.id)
        : await supabase.from('art_stakeholders').insert({ ...payload, project_id: id!, sort: stakeholders.length })
    setStkBusy(false)
    if (error) {
      alert('관계자 저장 실패: ' + error.message)
      return
    }
    setStkEdit(null)
    setStkForm({ kind: '발주담당', name: '', org: '', phone: '', email: '' })
    stkQ.reload()
  }
  function openStk(s: ArtStakeholder | 'new') {
    setStkForm(
      s === 'new'
        ? { kind: '발주담당', name: '', org: '', phone: '', email: '' }
        : { kind: s.kind, name: s.name, org: s.org ?? '', phone: s.phone ?? '', email: s.email ?? '' },
    )
    setStkEdit(s)
  }
  async function removeStk(s: ArtStakeholder) {
    if (!window.confirm(`관계자 "${s.name}" 을(를) 삭제할까요?`)) return
    const { error } = await supabase.from('art_stakeholders').delete().eq('id', s.id)
    if (error) {
      alert('삭제 실패: ' + error.message)
      return
    }
    stkQ.reload()
  }

  // 예산 항목 등록/수정 (art_budget upsert — project_id+item 유니크)
  async function saveBudget() {
    if (!budgetForm.item || budgetForm.alloc <= 0) return
    setBudBusy(true)
    const { error } = await supabase
      .from('art_budget')
      .upsert(
        { project_id: id!, item: budgetForm.item, alloc: budgetForm.alloc },
        { onConflict: 'project_id,item' },
      )
    setBudBusy(false)
    if (error) {
      alert('예산 항목 저장 실패: ' + error.message)
      return
    }
    setAddBudget(false)
    setBudgetForm({ item: BUDGET_ITEMS[0], alloc: 0 })
    budgetQ.reload()
  }

  // 자문위원 등록/수정/삭제
  async function saveAdvisor() {
    if (!advForm.name.trim()) return
    setStkBusy(true)
    const payload = {
      name: advForm.name.trim(),
      org: advForm.org.trim() || null,
      phone: advForm.phone.trim() || null,
      default_fee: advForm.default_fee,
    }
    const { error } =
      advEdit && advEdit !== 'new'
        ? await supabase.from('advisors').update(payload).eq('id', advEdit.id)
        : await supabase.from('advisors').insert({ ...payload, project_id: id!, sort: advisors.length })
    setStkBusy(false)
    if (error) {
      alert('자문위원 저장 실패: ' + error.message)
      return
    }
    setAdvEdit(null)
    setAdvForm({ name: '', org: '', phone: '', default_fee: 0 })
    reloadAdvisors()
  }
  async function removeAdvisor(a: Advisor) {
    if (!window.confirm(`자문위원 "${a.name}" 을(를) 삭제할까요?`)) return
    const { error } = await supabase.from('advisors').delete().eq('id', a.id)
    if (error) {
      alert('삭제 실패: ' + error.message)
      return
    }
    reloadAdvisors()
  }

  // 기본 20단계 보존처리 공정 템플릿
  const STEP20 = [
    '착수 준비', '현장 조사', '사전 조사·기록', '과학적 분석', '촬영·실측',
    '해체·수습', '이물질 제거', '세척·클리닝', '안정화 처리', '탈염·탈산',
    '접합', '결손부 복원', '보강', '메움·충전', '색맞춤',
    '표면 마감', '재조립·설치', '최종 기록·촬영', '보고서 작성', '납품·인수',
  ]
  // 기본 공정 생성: 이미 있는 seq는 건너뛰고 비어있는 단계만 채움(삭제 후 재생성 가능)
  async function seedSteps() {
    const have = new Set((steps ?? []).map((s) => s.seq))
    const rows = STEP20
      .map((title, i) => ({ project_id: id!, seq: i + 1, title, status: 'before' }))
      .filter((r) => !have.has(r.seq))
    if (rows.length === 0) {
      alert('이미 20단계 공정이 모두 등록되어 있습니다.')
      return
    }
    setBudBusy(true)
    const { error } = await supabase.from('project_steps').insert(rows)
    setBudBusy(false)
    if (error) {
      alert('공정 생성 실패: ' + error.message)
      return
    }
    reloadSteps()
  }

  function startEdit() {
    if (!p) return
    setEf({
      name: p.name ?? '', status: p.status, contract_base: Number(p.contract_base) || 0,
      kind: p.kind ?? '발주', client: p.client ?? '', proj_type: p.proj_type ?? '서화',
      bid_method: p.bid_method ?? '협상에의한계약',
      contract_date: p.contract_date ?? '', start_date: p.start_date ?? '',
      due_date: p.due_date ?? '', done_date: p.done_date ?? ''
    })
    setEditing(true)
  }
  async function saveEdit() {
    if (!ef.name.trim()) {
      alert('사업명을 입력하세요.')
      return
    }
    setEditBusy(true)
    const { error } = await supabase
      .from('art_projects')
      .update({
        name: ef.name.trim(),
        status: ef.status,
        contract_base: ef.contract_base,
        kind: ef.kind,
        client: ef.client.trim() || null,
        proj_type: ef.proj_type || null,
        bid_method: ef.bid_method || null,
        contract_date: ef.contract_date || null,
        start_date: ef.start_date || null,
        due_date: ef.due_date || null,
        done_date: ef.done_date || null,
        year: (ef.due_date ? +ef.due_date.slice(0, 4) : null) || p?.year || new Date().getFullYear(),
      })
      .eq('id', id!)
    setEditBusy(false)
    if (error) {
      alert('사업 수정 저장 실패: ' + error.message)
      return
    }
    setEditing(false)
    projQ.reload()
  }

  async function removeProject() {
    if (
      !window.confirm(
        `사업 "${p?.name}" 을(를) 삭제할까요?\n예산·수금·세부진행 등 하위 데이터가 함께 삭제되며 되돌릴 수 없습니다.`,
      )
    )
      return
    const { error } = await supabase.from('art_projects').delete().eq('id', id!)
    if (error) {
      alert('삭제 실패: ' + error.message)
      return
    }
    navigate('/ops/art')
  }

  const contract = contractAmount(p?.contract_base ?? 0, changes)
  const received = receivedAmount(receipts)
  const balance = contract - received

  const used = useMemo(() => usedByItem(tx, id!), [tx, id])
  const { rows: bRows, totalAlloc, totalUsed } = budgetRows(budget, used, tx, id!)
  const prog = stepProgress(steps)

  // 아코디언 하나만 열기
  const onToggle = (idx: number) => {
    detailsRefs.current.forEach((d, i) => {
      if (d && i !== idx && d.open) d.open = false
    })
  }

  if (projQ.loading)
    return (
      <div className="page on">
        <CenterNote>불러오는 중…</CenterNote>
      </div>
    )
  if (projQ.error)
    return (
      <div className="page on">
        <ErrorBanner error={projQ.error} table="art_projects" />
      </div>
    )
  if (!p)
    return (
      <div className="page on">
        <section className="panel">
          <CenterNote>사업을 찾을 수 없습니다.</CenterNote>
        </section>
      </div>
    )

  return (
    <div className="page on" id="p-ops-art-detail">
      {/* 상단 버튼 바 — 초록 헤더 위, 다른 화면 버튼과 동일한 스타일 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '2px 0 10px' }}>
        <button className="btn txt" style={{ padding: 0 }} onClick={() => navigate('/ops/art')}>
          ‹ 사업 목록
        </button>
        <div style={{ display: 'flex', gap: 8 }}>
          {editing ? (
            <>
              <button className="btn sec" onClick={() => setEditing(false)} disabled={editBusy}>
                취소
              </button>
              <button className="btn pri" onClick={saveEdit} disabled={editBusy || !ef.name.trim()}>
                {editBusy ? '저장 중…' : '저장'}
              </button>
            </>
          ) : (
            <>
              <button className="btn sec" onClick={startEdit}>
                사업 수정
              </button>
              <button className="btn sec" style={{ color: 'var(--danger)' }} onClick={removeProject}>
                삭제
              </button>
            </>
          )}
        </div>
      </div>

      {/* 초록 헤더 — 사업명·상태 / 계약금·진행률 */}
      <div className="proj-head">
        <div className="ph-top">
          <div className="pt">
            {editing ? (
              <>
                <input className="hr-in ph-name" value={ef.name} onChange={(e) => setE('name', e.target.value)} placeholder="사업명" />
                <select className="hr-in" style={{ width: 110 }} value={ef.status} onChange={(e) => setE('status', e.target.value)}>
                  {ART_STATUSES.map((st) => (
                    <option key={st} value={st}>{st}</option>
                  ))}
                </select>
              </>
            ) : (
              <>
                <h2>{p.name}</h2>
                <span className="pst">{p.status}</span>
              </>
            )}
          </div>
          <div className="ph-stats">
            <div className="ph-stat">
              <span className="l">{editing ? '계약금(기본)' : '계약금'}</span>
              {editing ? (
                <input
                  className="hr-in tnum"
                  style={{ width: 150, textAlign: 'right' }}
                  value={ef.contract_base ? won(ef.contract_base) : ''}
                  onChange={(e) => setE('contract_base', parseInt(e.target.value.replace(/[^0-9]/g, ''), 10) || 0)}
                  placeholder="예: 220,000,000"
                />
              ) : (
                <b className="gold">{eok(contract)}</b>
              )}
            </div>
            <div className="ph-stat">
              <span className="l">진행률</span>
              <b>{prog.pct}%</b>
            </div>
          </div>
        </div>
        <div className="ph-bar">
          <div className={`fill${prog.pct === 100 ? ' full' : ''}`} style={{ width: `${prog.pct}%` }} />
        </div>
      </div>

      {/* 섹션 1 — 사업개요 */}
      <details
        className="sec"
        open
        ref={(el) => el && (detailsRefs.current[0] = el)}
        onToggle={(e) => (e.currentTarget as HTMLDetailsElement).open && onToggle(0)}
      >
        <summary>
          <span className="sn">1</span>
          사업개요
          <span className="sc">{p.client} · {p.proj_type}</span>
          <Icon name="chevron" className="icon chev" />
        </summary>
        <div className="sbody">
          {editing ? (
            <div className="field-grid g4">
              <EField l="구분">
                <select className="hr-in" value={ef.kind} onChange={(e) => setE('kind', e.target.value)}>
                  <option value="발주">발주</option>
                  <option value="입찰">입찰</option>
                </select>
              </EField>
              <EField l="발주기관">
                <input className="hr-in" value={ef.client} onChange={(e) => setE('client', e.target.value)} />
              </EField>
              <EField l="사업유형">
                <select className="hr-in" value={ef.proj_type} onChange={(e) => setE('proj_type', e.target.value)}>
                  {ef.proj_type && !PROJ_TYPES.includes(ef.proj_type) && <option value={ef.proj_type}>{ef.proj_type}</option>}
                  {PROJ_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </EField>
              <EField l="계약방법">
                <select className="hr-in" value={ef.bid_method} onChange={(e) => setE('bid_method', e.target.value)}>
                  {ef.bid_method && !BID_METHODS.includes(ef.bid_method) && <option value={ef.bid_method}>{ef.bid_method}</option>}
                  {BID_METHODS.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </EField>
              <EField l="계약일">
                <input className="hr-in" type="date" min="1900-01-01" max="9999-12-31" value={ef.contract_date} onChange={(e) => setE('contract_date', e.target.value)} />
              </EField>
              <EField l="착공일">
                <input className="hr-in" type="date" min="1900-01-01" max="9999-12-31" value={ef.start_date} onChange={(e) => setE('start_date', e.target.value)} />
              </EField>
              <EField l="준공 예정">
                <input className="hr-in" type="date" min="1900-01-01" max="9999-12-31" value={ef.due_date} onChange={(e) => setE('due_date', e.target.value)} />
              </EField>
              <EField l="준공일">
                <input className="hr-in" type="date" min="1900-01-01" max="9999-12-31" value={ef.done_date} onChange={(e) => setE('done_date', e.target.value)} />
              </EField>
            </div>
          ) : (
            <div className="field-grid g4">
              <Field l="구분" v={p.kind ?? '—'} />
              <Field l="발주기관" v={p.client ?? '—'} />
              <Field l="사업유형" v={<span className="badge gold">{p.proj_type}</span>} />
              <Field l="계약방법" v={p.bid_method ?? '—'} />
              <Field l="계약일" v={dateOnly(p.contract_date) || '—'} />
              <Field l="착공일" v={dateOnly(p.start_date) || '—'} />
              <Field l="준공 예정" v={dateOnly(p.due_date) || '—'} />
              <Field
                l="준공일"
                v={p.done_date ? dateOnly(p.done_date) : <span className="chip c-prog"><i />진행중</span>}
              />
            </div>
          )}

          {/* 관계자 */}
          <div className="bud-h" style={{ marginTop: 18, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div className="t">
              관계자 <span style={{ color: 'var(--muted)', fontWeight: 400 }}>· {stakeholders.length}명</span>
            </div>
            <button className="btn txt" style={{ padding: 0, fontSize: 11.5, color: 'var(--brand-ink)' }} onClick={() => openStk('new')}>
              + 관계자
            </button>
          </div>
          <table className="rowtbl">
            <thead>
              <tr>
                <th>구분</th>
                <th>이름</th>
                <th>소속</th>
                <th>연락처</th>
                <th>이메일</th>
                <th style={{ width: 90 }}></th>
              </tr>
            </thead>
            <tbody>
              {stakeholders.map((s) => (
                <tr key={s.id}>
                  <td>{s.kind}</td>
                  <td>
                    <b>{s.name}</b>
                  </td>
                  <td className="t-sub">{s.org || '—'}</td>
                  <td className="tnum">{s.phone || '—'}</td>
                  <td className="t-sub">{s.email || '—'}</td>
                  <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                    <button className="btn txt" style={{ padding: '2px 6px', fontSize: 11 }} onClick={() => openStk(s)}>
                      수정
                    </button>
                    <button className="btn txt" style={{ padding: '2px 6px', fontSize: 11, color: 'var(--danger)' }} onClick={() => removeStk(s)}>
                      삭제
                    </button>
                  </td>
                </tr>
              ))}
              {stakeholders.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ color: 'var(--muted)', textAlign: 'center', padding: 16 }}>
                    등록된 관계자가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {/* 자문위원 */}
          <div className="bud-h" style={{ marginTop: 18, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div className="t">
              자문위원 <span style={{ color: 'var(--muted)', fontWeight: 400 }}>· {advisors.length}명</span>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                className="btn sec"
                style={{ padding: '5px 11px', fontSize: 11.5 }}
                onClick={() => { setAdvForm({ name: '', org: '', phone: '', default_fee: 0 }); setAdvEdit('new') }}
              >
                + 자문위원
              </button>
              {advisors.length > 0 && (
                <button className="btn pri" style={{ padding: '5px 12px', fontSize: 11.5 }} onClick={() => setAdvOpen(true)}>
                  자문비 지출결의서
                </button>
              )}
            </div>
          </div>
          <table className="rowtbl">
            <thead>
              <tr>
                <th>이름</th>
                <th>소속</th>
                <th>연락처</th>
                <th style={{ textAlign: 'right' }}>자문비</th>
                <th style={{ textAlign: 'right' }}>관리</th>
              </tr>
            </thead>
            <tbody>
              {advisors.map((a) => (
                <tr key={a.id}>
                  <td>
                    <b>{a.name}</b>
                  </td>
                  <td className="t-sub">{a.org}</td>
                  <td className="tnum">{a.phone}</td>
                  <td className="tnum" style={{ textAlign: 'right' }}>{a.default_fee ? won(a.default_fee) : '—'}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button
                      className="btn txt"
                      style={{ padding: '2px 6px', fontSize: 11 }}
                      onClick={() => { setAdvForm({ name: a.name, org: a.org ?? '', phone: a.phone ?? '', default_fee: a.default_fee ?? 0 }); setAdvEdit(a) }}
                    >
                      수정
                    </button>
                    <button
                      className="btn txt"
                      style={{ padding: '2px 6px', fontSize: 11, color: 'var(--danger)' }}
                      onClick={() => removeAdvisor(a)}
                    >
                      삭제
                    </button>
                  </td>
                </tr>
              ))}
              {advisors.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ color: 'var(--muted)', textAlign: 'center', padding: 16 }}>
                    등록된 자문위원이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </details>

      {/* 섹션 2 — 예산 현황 */}
      <details
        className="sec"
        ref={(el) => el && (detailsRefs.current[1] = el)}
        onToggle={(e) => (e.currentTarget as HTMLDetailsElement).open && onToggle(1)}
      >
        <summary>
          <span className="sn">2</span>
          예산현황
          <span className="sc">미수금 {eok(balance)}</span>
          <Icon name="chevron" className="icon chev" />
        </summary>
        <div className="sbody">
          {/* 요약 타일 */}
          <div className="budsum">
            <div className="bt">
              <div className="k">계약금</div>
              <div className="v tnum">{eok(contract)}</div>
            </div>
            <div className="bt accent">
              <div className="k">수금</div>
              <div className="v tnum">{eok(received)}</div>
            </div>
            <div className="bt warn">
              <div className="k">미수금</div>
              <div className="v tnum">{eok(balance)}</div>
            </div>
            <div className="bt">
              <div className="k">집행율</div>
              <div className="v tnum">{totalAlloc > 0 ? Math.round((totalUsed / totalAlloc) * 100) : 0}%</div>
            </div>
          </div>

          {/* 대금 수령 */}
          <div className="bud-h" style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="t">대금 수령</div>
            <button className="btn txt" style={{ padding: 0, fontSize: 11.5, color: 'var(--brand-ink)' }} onClick={() => setAddReceipt((v) => !v)}>
              {addReceipt ? '취소' : '+ 대금수령 추가'}
            </button>
          </div>
          <table className="rowtbl">
            <thead>
              <tr>
                <th>구분</th>
                <th>날짜</th>
                <th style={{ textAlign: 'right' }}>금액</th>
              </tr>
            </thead>
            <tbody>
              {receipts.map((r) => (
                <tr key={r.id}>
                  <td>
                    <span className="badge">{r.kind}</span>
                  </td>
                  <td className="tnum">{dateOnly(r.date)}</td>
                  <td className="tnum" style={{ textAlign: 'right', fontWeight: 700, color: 'var(--ok)' }}>
                    {won(r.amount)}
                  </td>
                </tr>
              ))}
              {addReceipt && (
                <tr>
                  <td>
                    <select className="hr-in" value={receiptForm.kind} onChange={(e) => setReceiptForm({ ...receiptForm, kind: e.target.value })}>
                      <option>선금</option>
                      <option>기성</option>
                      <option>잔금</option>
                    </select>
                  </td>
                  <td>
                    <input className="hr-in" type="date" min="1900-01-01" max="9999-12-31" value={receiptForm.date} onChange={(e) => setReceiptForm({ ...receiptForm, date: e.target.value })} />
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <input
                      className="hr-in tnum"
                      style={{ maxWidth: 110 }}
                      placeholder="금액"
                      value={receiptForm.amount ? won(receiptForm.amount) : ''}
                      onChange={(e) => setReceiptForm({ ...receiptForm, amount: parseInt(e.target.value.replace(/[^0-9]/g, ''), 10) || 0 })}
                    />
                    <button className="btn pri" style={{ padding: '3px 9px', fontSize: 11, marginLeft: 5 }} onClick={saveReceipt} disabled={budBusy}>
                      저장
                    </button>
                  </td>
                </tr>
              )}
              {receipts.length === 0 && !addReceipt && (
                <tr>
                  <td colSpan={3} style={{ color: 'var(--muted)', textAlign: 'center', padding: 12 }}>
                    수령 내역이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {/* 설계변경 */}
          <div className="bud-h" style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="t">설계변경</div>
            <button className="btn txt" style={{ padding: 0, fontSize: 11.5, color: 'var(--brand-ink)' }} onClick={() => setAddChange((v) => !v)}>
              {addChange ? '취소' : '+ 설계변경 추가'}
            </button>
          </div>
          <table className="rowtbl">
            <thead>
              <tr>
                <th>일자</th>
                <th>구분</th>
                <th>사유</th>
                <th style={{ textAlign: 'right' }}>변경 후 계약금</th>
              </tr>
            </thead>
            <tbody>
              {changes.map((c) => (
                <tr key={c.id}>
                  <td className="tnum">{dateOnly(c.date)}</td>
                  <td>
                    <span className="badge" style={{ color: c.type === '감액' ? 'var(--danger)' : 'var(--brand-ink)' }}>
                      {c.type}
                    </span>
                  </td>
                  <td>{c.memo}</td>
                  <td className="tnum" style={{ textAlign: 'right', fontWeight: 700 }}>
                    {won(c.after_amount)}
                  </td>
                </tr>
              ))}
              {addChange && (
                <tr>
                  <td>
                    <input className="hr-in" type="date" min="1900-01-01" max="9999-12-31" value={changeForm.date} onChange={(e) => setChangeForm({ ...changeForm, date: e.target.value })} />
                  </td>
                  <td>
                    <select className="hr-in" value={changeForm.type} onChange={(e) => setChangeForm({ ...changeForm, type: e.target.value })}>
                      <option>증액</option>
                      <option>감액</option>
                    </select>
                  </td>
                  <td>
                    <input className="hr-in" placeholder="사유" value={changeForm.memo} onChange={(e) => setChangeForm({ ...changeForm, memo: e.target.value })} />
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <input
                      className="hr-in tnum"
                      style={{ maxWidth: 110 }}
                      placeholder="변경 후"
                      value={changeForm.after ? won(changeForm.after) : ''}
                      onChange={(e) => setChangeForm({ ...changeForm, after: parseInt(e.target.value.replace(/[^0-9]/g, ''), 10) || 0 })}
                    />
                    <button className="btn pri" style={{ padding: '3px 9px', fontSize: 11, marginLeft: 5 }} onClick={saveChange} disabled={budBusy}>
                      저장
                    </button>
                  </td>
                </tr>
              )}
              {changes.length === 0 && !addChange && (
                <tr>
                  <td colSpan={4} style={{ color: 'var(--muted)', textAlign: 'center', padding: 12 }}>
                    설계변경 내역이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {/* 9대 예산 카드 */}
          <div className="bud-h" style={{ marginTop: 16, display: 'flex', alignItems: 'center' }}>
            <div className="t">예산 집행 현황</div>
            <button
              className="btn sec"
              style={{ padding: '4px 11px', fontSize: 11.5, marginLeft: 'auto' }}
              onClick={() => { setBudgetForm({ item: BUDGET_ITEMS[0], alloc: 0 }); setAddBudget(true) }}
            >
              + 예산 항목
            </button>
          </div>
          <div className="bcards">
            {bRows.map((b) => (
              <div className="bcard" key={b.item}>
                <div className="bt">
                  {b.item}
                  <span className="pct" style={{ color: pctColor(b.pct) }}>
                    {b.pct}%
                  </span>
                </div>
                <div className="track">
                  <div className="fill" style={{ width: `${Math.min(b.pct, 100)}%`, background: pctColor(b.pct) }} />
                </div>
                <div className="nums">
                  <div className="r">
                    <span className="k">예산액</span>
                    <b className="tnum">{eok(b.alloc)}</b>
                  </div>
                  <div className="r">
                    <span className="k">집행액</span>
                    <b className="tnum" style={{ color: b.used ? 'var(--expense)' : 'var(--muted)' }}>
                      {b.used ? eok(b.used) : '—'}
                    </b>
                  </div>
                  <div className="r left">
                    <span className="k">잔여예산</span>
                    <b className="tnum" style={{ color: b.rem < 0 ? 'var(--danger)' : 'var(--brand-ink)' }}>
                      {eok(b.rem)}
                    </b>
                  </div>
                </div>
                {b.txCount > 0 && (
                  <div className="detail">
                    <button className="db" onClick={() => setBudItem(b.item)}>
                      내역 보기 ({b.txCount}) ›
                    </button>
                  </div>
                )}
              </div>
            ))}
            {/* 합계 카드 */}
            {bRows.length > 0 && (
              <div className="bcard total">
                <div className="bt">
                  합계
                  <span className="pct">{totalAlloc > 0 ? Math.round((totalUsed / totalAlloc) * 100) : 0}%</span>
                </div>
                <div className="track">
                  <div
                    className="fill"
                    style={{
                      width: `${Math.min(totalAlloc > 0 ? Math.round((totalUsed / totalAlloc) * 100) : 0, 100)}%`,
                      background: 'var(--brand)',
                    }}
                  />
                </div>
                <div className="nums">
                  <div className="r">
                    <span className="k">예산액</span>
                    <b className="tnum">{eok(totalAlloc)}</b>
                  </div>
                  <div className="r">
                    <span className="k">집행액</span>
                    <b className="tnum" style={{ color: 'var(--expense)' }}>
                      {eok(totalUsed)}
                    </b>
                  </div>
                  <div className="r left">
                    <span className="k">잔여예산</span>
                    <b className="tnum" style={{ color: 'var(--brand-ink)' }}>
                      {eok(totalAlloc - totalUsed)}
                    </b>
                  </div>
                </div>
              </div>
            )}
            {bRows.length === 0 && <CenterNote>등록된 예산 항목이 없습니다.</CenterNote>}
          </div>
        </div>
      </details>

      {/* 섹션 3 — 세부 진행 현황 */}
      <details
        className="sec"
        ref={(el) => el && (detailsRefs.current[2] = el)}
        onToggle={(e) => (e.currentTarget as HTMLDetailsElement).open && onToggle(2)}
      >
        <summary>
          <span className="sn">3</span>
          진행현황
          <span className="sc">
            총 {prog.total}공정 · 완료 {prog.nDone} · 진행 {prog.nProg}
          </span>
          <Icon name="chevron" className="icon chev" />
        </summary>
        <div className="sbody">
          {/* 기본 공정 생성 — 항상 노출(삭제 후 다시 생성 가능) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            {steps.length === 0 && <CenterNote>등록된 공정이 없습니다.</CenterNote>}
            <button
              className="btn sec"
              style={{ padding: '5px 12px', fontSize: 12, marginLeft: steps.length === 0 ? 0 : 'auto' }}
              onClick={seedSteps}
              disabled={budBusy}
              title="기본 20단계 공정을 추가합니다"
            >
              기본 공정 20단계 생성
            </button>
          </div>
          <Step20Editor projectId={id!} steps={steps} comments={comments} onChanged={reloadSteps} />
        </div>
      </details>

      {/* 모달 */}
      {budItem && (
        <BudgetTxPopup
          item={budItem}
          projectId={id!}
          tx={tx}
          budget={budget}
          onClose={() => setBudItem(null)}
        />
      )}
      {addBudget && (
        <div className="modal-bg" onClick={() => setAddBudget(false)}>
          <div className="modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <div className="mh">
              <div>
                <div className="eyebrow">예산 항목 등록</div>
                <h3>원가계산 예산</h3>
              </div>
              <button className="x" onClick={() => setAddBudget(false)}>✕</button>
            </div>
            <div className="mb">
              <div className="mfield">
                <label>예산 항목</label>
                <select className="ctl" value={budgetForm.item} onChange={(e) => setBudgetForm({ ...budgetForm, item: e.target.value })}>
                  {BUDGET_ITEMS.map((it) => (
                    <option key={it} value={it}>{it}</option>
                  ))}
                </select>
              </div>
              <div className="mfield">
                <label>예산액</label>
                <input
                  className="ctl tnum"
                  type="text"
                  inputMode="numeric"
                  value={budgetForm.alloc ? budgetForm.alloc.toLocaleString('ko-KR') : ''}
                  onChange={(e) => setBudgetForm({ ...budgetForm, alloc: Number(e.target.value.replace(/[^0-9]/g, '')) || 0 })}
                  placeholder="예: 50,000,000"
                />
              </div>
              <div className="hint" style={{ fontSize: 11, color: 'var(--muted)' }}>
                같은 항목을 다시 등록하면 예산액이 갱신됩니다.
              </div>
            </div>
            <div className="mf">
              <button className="btn sec" onClick={() => setAddBudget(false)} disabled={budBusy}>취소</button>
              <button className="btn pri" onClick={saveBudget} disabled={budBusy || budgetForm.alloc <= 0}>
                {budBusy ? '저장 중…' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}
      {stkEdit && (
        <div className="modal-bg" onClick={() => setStkEdit(null)}>
          <div className="modal" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
            <div className="mh">
              <div>
                <div className="eyebrow">관계자 {stkEdit === 'new' ? '등록' : '수정'}</div>
                <h3>관계자</h3>
              </div>
              <button className="x" onClick={() => setStkEdit(null)}>✕</button>
            </div>
            <div className="mb">
              <div style={{ display: 'flex', gap: 10 }}>
                <div className="mfield" style={{ width: 130 }}>
                  <label>구분</label>
                  <select className="ctl" value={stkForm.kind} onChange={(e) => setStkForm({ ...stkForm, kind: e.target.value })}>
                    {['발주담당', '소장자', '재무과', '기타'].map((k) => (
                      <option key={k}>{k}</option>
                    ))}
                    {stkForm.kind && !['발주담당', '소장자', '재무과', '기타'].includes(stkForm.kind) && <option>{stkForm.kind}</option>}
                  </select>
                </div>
                <div className="mfield" style={{ flex: 1 }}>
                  <label>이름</label>
                  <input className="ctl" value={stkForm.name} onChange={(e) => setStkForm({ ...stkForm, name: e.target.value })} autoFocus />
                </div>
              </div>
              <div className="mfield">
                <label>소속</label>
                <input className="ctl" value={stkForm.org} onChange={(e) => setStkForm({ ...stkForm, org: e.target.value })} />
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <div className="mfield" style={{ flex: 1 }}>
                  <label>연락처</label>
                  <input className="ctl" value={stkForm.phone} onChange={(e) => setStkForm({ ...stkForm, phone: e.target.value })} placeholder="010-0000-0000" />
                </div>
                <div className="mfield" style={{ flex: 1 }}>
                  <label>이메일</label>
                  <input className="ctl" type="email" value={stkForm.email} onChange={(e) => setStkForm({ ...stkForm, email: e.target.value })} placeholder="name@example.com" />
                </div>
              </div>
            </div>
            <div className="mf">
              <button className="btn sec" onClick={() => setStkEdit(null)} disabled={stkBusy}>취소</button>
              <button className="btn pri" onClick={saveStk} disabled={stkBusy || !stkForm.name.trim()}>
                {stkBusy ? '저장 중…' : stkEdit === 'new' ? '등록' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}
      {advEdit && (
        <div className="modal-bg" onClick={() => setAdvEdit(null)}>
          <div className="modal" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
            <div className="mh">
              <div>
                <div className="eyebrow">자문위원 {advEdit === 'new' ? '등록' : '수정'}</div>
                <h3>자문위원</h3>
              </div>
              <button className="x" onClick={() => setAdvEdit(null)}>✕</button>
            </div>
            <div className="mb">
              <div style={{ display: 'flex', gap: 10 }}>
                <div className="mfield" style={{ flex: 1 }}>
                  <label>이름</label>
                  <input className="ctl" value={advForm.name} onChange={(e) => setAdvForm({ ...advForm, name: e.target.value })} placeholder="예: 홍길동 교수" autoFocus />
                </div>
                <div className="mfield" style={{ flex: 1 }}>
                  <label>소속</label>
                  <input className="ctl" value={advForm.org} onChange={(e) => setAdvForm({ ...advForm, org: e.target.value })} placeholder="예: ○○대학교" />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <div className="mfield" style={{ flex: 1 }}>
                  <label>연락처</label>
                  <input className="ctl" value={advForm.phone} onChange={(e) => setAdvForm({ ...advForm, phone: e.target.value })} placeholder="010-0000-0000" />
                </div>
                <div className="mfield" style={{ flex: 1 }}>
                  <label>기본 자문비</label>
                  <input className="ctl tnum" type="text" inputMode="numeric" value={advForm.default_fee ? advForm.default_fee.toLocaleString('ko-KR') : ''} onChange={(e) => setAdvForm({ ...advForm, default_fee: Number(e.target.value.replace(/[^0-9]/g, '')) || 0 })} placeholder="예: 300,000" />
                </div>
              </div>
            </div>
            <div className="mf">
              <button className="btn sec" onClick={() => setAdvEdit(null)} disabled={stkBusy}>취소</button>
              <button className="btn pri" onClick={saveAdvisor} disabled={stkBusy || !advForm.name.trim()}>
                {stkBusy ? '저장 중…' : advEdit === 'new' ? '등록' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}
      {advOpen && (
        <AdvisorFeeModal
          projectId={p.id}
          projectName={p.name}
          advisors={advisors}
          onClose={() => setAdvOpen(false)}
          onSubmitted={() => {
            setAdvOpen(false)
            reloadAdvisors()
          }}
        />
      )}
    </div>
  )
}

function EField({ l, children }: { l: string; children: React.ReactNode }) {
  return (
    <div className="field">
      <div className="fl">{l}</div>
      {children}
    </div>
  )
}

function Field({ l, v }: { l: string; v: React.ReactNode }) {
  return (
    <div className="field">
      <div className="fl">{l}</div>
      <div className="fv">{v}</div>
    </div>
  )
}
