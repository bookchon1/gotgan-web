import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Icon } from '../../components/Icon'
import { ErrorBanner, CenterNote } from '../../components/States'
import { supabase } from '../../lib/supabase'
import { useQuery } from '../../lib/useQuery'
import { man as eok, won, dateOnly } from '../../lib/format'
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
import { BoqModal, BUDGET_9 } from './BoqModal'
import { ContactSearch, hitToRow } from './ContactSearch'

// 원가계산서 예산 항목 (시안 기준)
const BUDGET_ITEMS = BUDGET_9

type StkRow = { id?: string; kind: string; name: string; org: string; phone: string; email: string }
type AdvRow = { id?: string; name: string; org: string; phone: string; email: string; default_fee: number }
const STK_KINDS = ['발주처', '재무과', '학예사', '소장처', '기타']

export default function ArtDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const detailsRefs = useRef<HTMLDetailsElement[]>([])
  const [budItem, setBudItem] = useState<string | null>(null)
  const [advOpen, setAdvOpen] = useState(false)
  const [addChange, setAddChange] = useState(false)
  const [changeForm, setChangeForm] = useState({ date: '', type: '증액', memo: '', after: 0 })
  const [addReceipt, setAddReceipt] = useState(false)
  const [receiptForm, setReceiptForm] = useState({ kind: '기성', date: '', amount: 0 })
  const [addBudget, setAddBudget] = useState(false)
  const [budgetForm, setBudgetForm] = useState({ item: '재료비', alloc: 0 })
  const [budBusy, setBudBusy] = useState(false)
  // 사업 수정 모드에서 함께 편집하는 관계자·자문위원 초안
  const [stkRows, setStkRows] = useState<StkRow[]>([])
  const [advRows, setAdvRows] = useState<AdvRow[]>([])
  // 사업개요 인라인 수정 모드 (헤더 + 사업개요 전체)
  const [boqOpen, setBoqOpen] = useState(false) // 내역서 불러오기(예산 자동입력)
  const [editing, setEditing] = useState(false)
  const [editBusy, setEditBusy] = useState(false)
  const [ef, setEf] = useState({
    name: '', short_name: '', status: '예정' as ArtStatus, contract_base: 0, kind: '발주', client: '', proj_type: '서화',
    bid_method: '협상에의한계약', contract_date: '', start_date: '', due_date: '', done_date: '',
  })
  // 준공일을 입력하면 진행상태가 자동으로 '완료', 지우면 '완료'였던 상태는 '진행'으로
  const setE = (k: keyof typeof ef, v: string | number) =>
    setEf((o) => {
      const n = { ...o, [k]: v }
      if (k === 'done_date') {
        if (v) n.status = '완료'
        else if (o.status === '완료') n.status = '진행'
      }
      return n
    })

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
      type: changeForm.after < contract ? '감액' : '증액',
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
  // 대금 수령 수정·삭제 (행 클릭 → 인라인 편집)
  const [editRid, setEditRid] = useState<string | null>(null)
  const [rEdit, setREdit] = useState({ kind: '기성', date: '', amount: 0 })
  const [rDelConfirm, setRDelConfirm] = useState(false)
  async function updateReceipt() {
    if (!editRid || !rEdit.date || !rEdit.amount) return
    setBudBusy(true)
    const { error } = await supabase.rpc('art_update_receipt', {
      p_receipt_id: editRid,
      p_kind: rEdit.kind,
      p_date: rEdit.date,
      p_amount: rEdit.amount,
    })
    setBudBusy(false)
    if (error) {
      alert('대금 수령 수정 실패: ' + error.message + (/art_update_receipt/.test(error.message) ? '\n(SQL 23 실행이 필요합니다)' : ''))
      return
    }
    setEditRid(null)
    receiptsQ.reload()
  }
  async function deleteReceipt() {
    if (!editRid) return
    if (!rDelConfirm) {
      setRDelConfirm(true)
      return
    }
    setBudBusy(true)
    const { error } = await supabase.rpc('art_delete_receipt', { p_receipt_id: editRid })
    setBudBusy(false)
    if (error) {
      alert('대금 수령 삭제 실패: ' + error.message)
      return
    }
    setEditRid(null)
    setRDelConfirm(false)
    receiptsQ.reload()
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

  // 기본 20단계 공정 (미술실 진행 업무 개요)
  const STEP20 = [
    '계약착공', '착공이운', '인문학조사', '기초조사', '과학적 조사',
    '환경조사', 'TEST', '설계', '1차 자문', '소위원회',
    '준비', '과정 1', '2차 자문', '과정 2', '전후이행',
    '3차 자문', '준공 이운', '준공', '보완보수', 'E수보',
  ]
  // 예전에 자동 생성되던 기본 공정 이름 (이 이름 그대로인 공정만 새 이름으로 교체)
  const OLD_STEP20 = [
    '착수 준비', '현장 조사', '사전 조사·기록', '과학적 분석', '촬영·실측',
    '해체·수습', '이물질 제거', '세척·클리닝', '안정화 처리', '탈염·탈산',
    '접합', '결손부 복원', '보강', '메움·충전', '색맞춤',
    '표면 마감', '재조립·설치', '최종 기록·촬영', '보고서 작성', '납품·인수',
  ]
  // 기본생성: 비어있는 단계는 새로 만들고, 예전 기본 이름 그대로인 단계는 새 이름으로 교체.
  // 직접 이름을 고친 공정은 건드리지 않음 (삭제 후 다시 생성 가능)
  async function seedSteps() {
    const bySeq = new Map((steps ?? []).map((s) => [s.seq, s]))
    const rows = STEP20
      .map((title, i) => ({ project_id: id!, seq: i + 1, title, status: 'before' }))
      .filter((r) => !bySeq.has(r.seq))
    const renames = STEP20
      .map((title, i) => ({ s: bySeq.get(i + 1), title, old: OLD_STEP20[i] }))
      .filter((x) => x.s && x.s.title === x.old && x.old !== x.title)
    if (rows.length === 0 && renames.length === 0) {
      alert('이미 20단계 공정이 모두 등록되어 있습니다.')
      return
    }
    setBudBusy(true)
    let errMsg: string | null = null
    if (rows.length) {
      const { error } = await supabase.from('project_steps').insert(rows)
      if (error) errMsg = error.message
    }
    for (const r of renames) {
      const { error } = await supabase.from('project_steps').update({ title: r.title }).eq('id', r.s!.id)
      if (error) errMsg = error.message
    }
    setBudBusy(false)
    if (errMsg) alert('공정 생성 실패: ' + errMsg)
    reloadSteps()
  }

  function startEdit() {
    if (!p) return
    setEf({
      name: p.name ?? '', short_name: p.short_name ?? '', status: p.status, contract_base: Number(p.contract_base) || 0,
      kind: p.kind ?? '발주', client: p.client ?? '', proj_type: p.proj_type ?? '서화',
      bid_method: p.bid_method ?? '협상에의한계약',
      contract_date: p.contract_date ?? '', start_date: p.start_date ?? '',
      due_date: p.due_date ?? '', done_date: p.done_date ?? ''
    })
    setStkRows(stakeholders.map((x) => ({ id: x.id, kind: x.kind, name: x.name, org: x.org ?? '', phone: x.phone ?? '', email: x.email ?? '' })))
    setAdvRows(advisors.map((x) => ({ id: x.id, name: x.name, org: x.org ?? '', phone: x.phone ?? '', email: x.email ?? '', default_fee: Number(x.default_fee) || 0 })))
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
        // 약칭 컬럼은 SQL 21 실행 후 사용 — 바뀐 경우에만 전송해 미적용 상태에서도 저장이 막히지 않게 함
        ...(ef.short_name.trim() !== (p?.short_name ?? '') ? { short_name: ef.short_name.trim() || null } : {}),
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
    if (error) {
      setEditBusy(false)
      alert('사업 수정 저장 실패: ' + error.message)
      return
    }

    // 관계자·자문위원 일괄 반영: 삭제 → 수정 → 추가. 권한(RLS) 때문에 0건 처리되는 경우도 실패로 알림
    const errs: string[] = []
    const chk = (label: string, r: { data: unknown[] | null; error: { message: string } | null }) => {
      if (r.error) errs.push(`${label}: ${r.error.message}`)
      else if (!r.data || r.data.length === 0) errs.push(`${label}: 저장되지 않았습니다 (권한 또는 대상 없음)`)
    }
    const stkValid = stkRows.filter((r) => r.name.trim())
    const stkKeep = new Set(stkValid.filter((r) => r.id).map((r) => r.id))
    for (const o of stakeholders) {
      if (!stkKeep.has(o.id)) chk('관계자 삭제', await supabase.from('art_stakeholders').delete().eq('id', o.id).select('id'))
    }
    for (const [i, r] of stkValid.entries()) {
      const payload = { kind: r.kind, name: r.name.trim(), org: r.org.trim() || null, phone: r.phone.trim() || null, email: r.email.trim() || null, sort: i }
      chk(
        `관계자 저장(${r.name.trim()})`,
        r.id
          ? await supabase.from('art_stakeholders').update(payload).eq('id', r.id).select('id')
          : await supabase.from('art_stakeholders').insert({ ...payload, project_id: id! }).select('id'),
      )
    }
    const advValid = advRows.filter((r) => r.name.trim())
    const advKeep = new Set(advValid.filter((r) => r.id).map((r) => r.id))
    for (const o of advisors) {
      if (!advKeep.has(o.id)) chk('자문위원 삭제', await supabase.from('advisors').delete().eq('id', o.id).select('id'))
    }
    for (const [i, r] of advValid.entries()) {
      const payload = { name: r.name.trim(), org: r.org.trim() || null, phone: r.phone.trim() || null, email: r.email.trim() || null, default_fee: r.default_fee, sort: i }
      chk(
        `자문위원 저장(${r.name.trim()})`,
        r.id
          ? await supabase.from('advisors').update(payload).eq('id', r.id).select('id')
          : await supabase.from('advisors').insert({ ...payload, project_id: id! }).select('id'),
      )
    }

    // 업체정보(partners)에 자동 등록 — 같은 업체·담당자는 갱신. 실패해도 저장은 유지(경고만)
    let ptnWarn = ''
    for (const r of stkValid) {
      const { error: e } = await supabase.rpc('partner_upsert_contact', { p_org: r.org, p_person: r.name, p_kind: r.kind, p_phone: r.phone, p_email: r.email })
      if (e && !ptnWarn) ptnWarn = e.message
    }
    for (const r of advValid) {
      const { error: e } = await supabase.rpc('partner_upsert_contact', { p_org: r.org, p_person: r.name, p_kind: '자문위원', p_phone: r.phone, p_email: r.email })
      if (e && !ptnWarn) ptnWarn = e.message
    }

    setEditBusy(false)
    projQ.reload()
    stkQ.reload()
    reloadAdvisors()
    if (errs.length) {
      alert('일부 저장 실패:\n' + [...new Set(errs)].join('\n'))
      return
    }
    setEditing(false)
    if (ptnWarn) alert('저장은 완료됐지만 업체정보 등록에 실패했습니다.\n(SQL 20 실행이 필요할 수 있습니다)\n' + ptnWarn)
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
  // 설계변경 내역: 당초 계약금 보존 + 변경 전/증감액 계산
  const base0 = Number(p?.contract_base) || 0
  const chgRows = (() => {
    let prev = base0
    return [...changes]
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
      .map((c) => {
        const after = Number(c.after_amount) || 0
        const row = { c, before: prev, delta: after - prev }
        prev = after
        return row
      })
  })()
  const fmtDelta = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '') + won(Math.abs(n))

  const used = useMemo(() => usedByItem(tx, id!), [tx, id])
  const { rows: bRows } = budgetRows(budget, used, tx, id!)
  // 지출이 실제로 나가지 않는 이윤·일반관리비는 카드와 집행율에서 제외 (세부내역 팝업에는 그대로 보임)
  const vRows = bRows.filter((b) => !['이윤', '일반관리비'].includes(b.item))
  const totalAlloc = vRows.reduce((s, b) => s + b.alloc, 0)
  const totalUsed = vRows.reduce((s, b) => s + b.used, 0)
  const prog = stepProgress(steps)
  // 진행률을 사업 레코드에도 저장 (사업목록·대시보드 등 다른 화면과 일치)
  useEffect(() => {
    if (!p || stepsQ.loading || steps.length === 0) return
    if (Number(p.progress) !== prog.pct) {
      supabase.from('art_projects').update({ progress: prog.pct }).eq('id', p.id).then(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prog.pct, p?.id, p?.progress, steps.length])

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
      <div className="proj-bar">
        <button className="btn txt" onClick={() => navigate('/ops/art')}>
          ‹ 사업 목록
        </button>
        <div className="proj-actions">
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
                수정
              </button>
              <button className="btn sec del" onClick={removeProject}>
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
                <input className="hr-in" style={{ width: 150 }} value={ef.short_name} onChange={(e) => setE('short_name', e.target.value)} placeholder="약칭 (일정표 표시)" title="업무일정 등 좁은 화면에 표시되는 짧은 사업 이름 (예: 한양도성)" />
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

          {/* 관계자 — 사업 수정 모드에서 함께 편집 */}
          <div className="bud-h" style={{ marginTop: 18, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div className="t">
              관계자 <span style={{ color: 'var(--muted)', fontWeight: 400 }}>· {(editing ? stkRows : stakeholders).length}명</span>
            </div>
            {editing && (
              <button
                className="btn txt"
                style={{ padding: 0, fontSize: 11.5, color: 'var(--brand-ink)' }}
                onClick={() => setStkRows((r) => [...r, { kind: '발주처', name: '', org: '', phone: '', email: '' }])}
              >
                + 관계자
              </button>
            )}
          </div>
          <table className="rowtbl">
            <thead>
              <tr>
                <th>구분</th>
                <th>이름</th>
                <th>소속</th>
                <th>연락처</th>
                <th>이메일</th>
                {editing && <th style={{ width: 36 }}></th>}
              </tr>
            </thead>
            <tbody>
              {editing
                ? stkRows.map((r, i) => {
                    const up = (k: keyof StkRow, v: string) => setStkRows((rows) => rows.map((x, j) => (j === i ? { ...x, [k]: v } : x)))
                    return (
                      <tr key={r.id ?? `n${i}`}>
                        <td>
                          <select className="hr-in" value={r.kind} onChange={(e) => up('kind', e.target.value)}>
                            {r.kind && !STK_KINDS.includes(r.kind) && <option>{r.kind}</option>}
                            {STK_KINDS.map((k) => (
                              <option key={k}>{k}</option>
                            ))}
                          </select>
                        </td>
                        <td><ContactSearch value={r.name} onChange={(v) => up('name', v)} placeholder="이름 (검색)" onPick={(h) => setStkRows((rows) => rows.map((x, j) => (j === i ? { ...x, ...hitToRow(h), name: hitToRow(h).name || x.name } : x)))} /></td>
                        <td><ContactSearch value={r.org} onChange={(v) => up('org', v)} placeholder="소속 (검색)" onPick={(h) => setStkRows((rows) => rows.map((x, j) => (j === i ? { ...x, ...hitToRow(h), name: hitToRow(h).name || x.name } : x)))} /></td>
                        <td><input className="hr-in" value={r.phone} onChange={(e) => up('phone', e.target.value)} placeholder="010-0000-0000" /></td>
                        <td><input className="hr-in" type="email" value={r.email} onChange={(e) => up('email', e.target.value)} placeholder="name@example.com" /></td>
                        <td style={{ textAlign: 'center' }}>
                          <button className="btn txt" title="삭제" style={{ padding: '2px 6px', color: 'var(--danger)' }} onClick={() => setStkRows((rows) => rows.filter((_, j) => j !== i))}>✕</button>
                        </td>
                      </tr>
                    )
                  })
                : stakeholders.map((s) => (
                    <tr key={s.id}>
                      <td>{s.kind}</td>
                      <td><b>{s.name}</b></td>
                      <td className="t-sub">{s.org || '—'}</td>
                      <td className="tnum">{s.phone || '—'}</td>
                      <td className="t-sub">{s.email || '—'}</td>
                    </tr>
                  ))}
              {(editing ? stkRows : stakeholders).length === 0 && (
                <tr>
                  <td colSpan={editing ? 6 : 5} style={{ color: 'var(--muted)', textAlign: 'center', padding: 16 }}>
                    등록된 관계자가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {/* 자문위원 — 사업 수정 모드에서 함께 편집 */}
          <div className="bud-h" style={{ marginTop: 18, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div className="t">
              자문위원 <span style={{ color: 'var(--muted)', fontWeight: 400 }}>· {(editing ? advRows : advisors).length}명</span>
            </div>
            {editing ? (
              <button
                className="btn txt"
                style={{ padding: 0, fontSize: 11.5, color: 'var(--brand-ink)' }}
                onClick={() => setAdvRows((r) => [...r, { name: '', org: '', phone: '', email: '', default_fee: 300000 }])}
              >
                + 자문위원
              </button>
            ) : (
              advisors.length > 0 && (
                <button className="btn pri" style={{ padding: '5px 12px', fontSize: 11.5 }} onClick={() => setAdvOpen(true)}>
                  지출결의서 상신
                </button>
              )
            )}
          </div>
          <table className="rowtbl">
            <thead>
              <tr>
                <th>이름</th>
                <th>소속</th>
                <th>연락처</th>
                <th>이메일</th>
                <th style={{ textAlign: 'right' }}>기본 자문비</th>
                {editing && <th style={{ width: 36 }}></th>}
              </tr>
            </thead>
            <tbody>
              {editing
                ? advRows.map((r, i) => {
                    const up = (k: keyof AdvRow, v: string | number) => setAdvRows((rows) => rows.map((x, j) => (j === i ? { ...x, [k]: v } : x)))
                    return (
                      <tr key={r.id ?? `n${i}`}>
                        <td><ContactSearch value={r.name} onChange={(v) => up('name', v)} placeholder="이름 (검색)" onPick={(h) => setAdvRows((rows) => rows.map((x, j) => (j === i ? { ...x, ...hitToRow(h), name: hitToRow(h).name || x.name } : x)))} /></td>
                        <td><ContactSearch value={r.org} onChange={(v) => up('org', v)} placeholder="소속 (검색)" onPick={(h) => setAdvRows((rows) => rows.map((x, j) => (j === i ? { ...x, ...hitToRow(h), name: hitToRow(h).name || x.name } : x)))} /></td>
                        <td><input className="hr-in" value={r.phone} onChange={(e) => up('phone', e.target.value)} placeholder="010-0000-0000" /></td>
                        <td><input className="hr-in" type="email" value={r.email} onChange={(e) => up('email', e.target.value)} placeholder="name@example.com" /></td>
                        <td>
                          <input
                            className="hr-in tnum"
                            style={{ textAlign: 'right' }}
                            inputMode="numeric"
                            value={r.default_fee ? won(r.default_fee) : ''}
                            onChange={(e) => up('default_fee', Number(e.target.value.replace(/[^0-9]/g, '')) || 0)}
                            placeholder="300,000"
                          />
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <button className="btn txt" title="삭제" style={{ padding: '2px 6px', color: 'var(--danger)' }} onClick={() => setAdvRows((rows) => rows.filter((_, j) => j !== i))}>✕</button>
                        </td>
                      </tr>
                    )
                  })
                : advisors.map((a) => (
                    <tr key={a.id}>
                      <td><b>{a.name}</b></td>
                      <td className="t-sub">{a.org}</td>
                      <td className="tnum">{a.phone || '—'}</td>
                      <td className="t-sub">{a.email || '—'}</td>
                      <td className="tnum" style={{ textAlign: 'right' }}>{a.default_fee ? won(a.default_fee) : '—'}</td>
                    </tr>
                  ))}
              {(editing ? advRows : advisors).length === 0 && (
                <tr>
                  <td colSpan={editing ? 6 : 5} style={{ color: 'var(--muted)', textAlign: 'center', padding: 16 }}>
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
              {[...receipts].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)).map((r, _i, arr) =>
                editRid === r.id ? (
                  <tr key={r.id} className="rc-edit">
                    <td>
                      <select className="hr-in" value={rEdit.kind} onChange={(e) => setREdit({ ...rEdit, kind: e.target.value })}>
                        <option>선금</option>
                        <option>기성</option>
                        <option>준공</option>
                      </select>
                    </td>
                    <td>
                      <input className="hr-in" type="date" min="1900-01-01" max="9999-12-31" value={rEdit.date} onChange={(e) => setREdit({ ...rEdit, date: e.target.value })} />
                    </td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <input
                        className="hr-in tnum"
                        style={{ maxWidth: 110 }}
                        value={rEdit.amount ? won(rEdit.amount) : ''}
                        onChange={(e) => setREdit({ ...rEdit, amount: parseInt(e.target.value.replace(/[^0-9]/g, ''), 10) || 0 })}
                      />
                      <div style={{ display: 'inline-flex', gap: 4, marginLeft: 6, verticalAlign: 'middle' }}>
                        <button className="btn txt" style={{ padding: '3px 7px', fontSize: 11, color: rDelConfirm ? 'var(--danger)' : 'var(--muted)', fontWeight: rDelConfirm ? 800 : 400 }} onClick={deleteReceipt} disabled={budBusy}>
                          {rDelConfirm ? '정말 삭제' : '삭제'}
                        </button>
                        <button className="btn sec" style={{ padding: '3px 9px', fontSize: 11 }} onClick={() => { setEditRid(null); setRDelConfirm(false) }} disabled={budBusy}>
                          취소
                        </button>
                        <button className="btn pri" style={{ padding: '3px 9px', fontSize: 11 }} onClick={updateReceipt} disabled={budBusy || !rEdit.date || !rEdit.amount}>
                          저장
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr
                    key={r.id}
                    style={{ cursor: 'pointer' }}
                    title="클릭하여 수정·삭제"
                    onClick={() => {
                      setEditRid(r.id)
                      setRDelConfirm(false)
                      setREdit({ kind: r.kind, date: dateOnly(r.date) || '', amount: Number(r.amount) || 0 })
                    }}
                  >
                    <td>
                      <span className="badge">
                        {r.kind}
                        {r.kind === '기성' && arr.filter((x) => x.kind === '기성').length > 1
                          ? ` ${arr.filter((x) => x.kind === '기성').indexOf(r) + 1}차`
                          : ''}
                      </span>
                    </td>
                    <td className="tnum">{dateOnly(r.date)}</td>
                    <td className="tnum" style={{ textAlign: 'right', fontWeight: 700, color: 'var(--ok)' }}>
                      {won(r.amount)}
                    </td>
                  </tr>
                ),
              )}
              {addReceipt && (
                <tr>
                  <td>
                    <select className="hr-in" value={receiptForm.kind} onChange={(e) => setReceiptForm({ ...receiptForm, kind: e.target.value })}>
                      <option>선금</option>
                      <option>기성</option>
                      <option>준공</option>
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
          {/* 당초 → 현재 요약 */}
          {changes.length > 0 && (
            <div className="chg-sum">
              <div><span className="k">당초 계약금</span><b className="tnum">{won(base0)}</b></div>
              <div className="arr">→</div>
              <div><span className="k">현재 계약금</span><b className="tnum">{won(contract)}</b></div>
              <div>
                <span className="k">총 증감액</span>
                <b className="tnum" style={{ color: contract - base0 < 0 ? 'var(--danger)' : 'var(--ok)' }}>
                  {fmtDelta(contract - base0)}
                </b>
              </div>
            </div>
          )}
          <table className="rowtbl">
            <thead>
              <tr>
                <th>일자</th>
                <th>구분</th>
                <th>사유</th>
                <th style={{ textAlign: 'right' }}>변경 전</th>
                <th style={{ textAlign: 'right' }}>증감액</th>
                <th style={{ textAlign: 'right' }}>변경 후 계약금</th>
              </tr>
            </thead>
            <tbody>
              {/* 당초 계약 — 설계변경이 있어도 그대로 보존 */}
              <tr>
                <td className="tnum">{dateOnly(p.contract_date) || '—'}</td>
                <td><span className="badge">당초계약</span></td>
                <td className="t-sub">최초 계약</td>
                <td className="tnum" style={{ textAlign: 'right', color: 'var(--muted)' }}>—</td>
                <td className="tnum" style={{ textAlign: 'right', color: 'var(--muted)' }}>—</td>
                <td className="tnum" style={{ textAlign: 'right', fontWeight: 700 }}>{won(base0)}</td>
              </tr>
              {chgRows.map(({ c, before, delta }) => (
                <tr key={c.id}>
                  <td className="tnum">{dateOnly(c.date)}</td>
                  <td>
                    <span className="badge" style={{ color: delta < 0 ? 'var(--danger)' : 'var(--brand-ink)' }}>
                      {delta < 0 ? '감액' : '증액'}
                    </span>
                  </td>
                  <td>{c.memo}</td>
                  <td className="tnum" style={{ textAlign: 'right', color: 'var(--muted)' }}>{won(before)}</td>
                  <td className="tnum" style={{ textAlign: 'right', fontWeight: 700, color: delta < 0 ? 'var(--danger)' : 'var(--ok)' }}>
                    {fmtDelta(delta)}
                  </td>
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
                  <td className="t-sub">자동</td>
                  <td>
                    <input className="hr-in" placeholder="사유" value={changeForm.memo} onChange={(e) => setChangeForm({ ...changeForm, memo: e.target.value })} />
                  </td>
                  <td className="tnum" style={{ textAlign: 'right', color: 'var(--muted)' }}>{won(contract)}</td>
                  <td className="tnum" style={{ textAlign: 'right', fontWeight: 700, color: changeForm.after && changeForm.after < contract ? 'var(--danger)' : 'var(--ok)' }}>
                    {changeForm.after ? fmtDelta(changeForm.after - contract) : '—'}
                  </td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <input
                      className="hr-in tnum"
                      style={{ maxWidth: 110 }}
                      placeholder="변경 후 금액"
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
                  <td colSpan={6} style={{ color: 'var(--muted)', textAlign: 'center', padding: 12 }}>
                    설계변경 내역이 없습니다. (변경 시 당초 계약금은 그대로 보존됩니다)
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {/* 9대 예산 카드 */}
          <div className="bud-h" style={{ marginTop: 16, display: 'flex', alignItems: 'center' }}>
            <div className="t">예산 집행 현황</div>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 2 }}>
              <button className="btn pri" style={{ padding: '4px 9px', fontSize: 11.5 }} onClick={() => setBoqOpen(true)}>
                세부내역
              </button>
            </div>
          </div>
          <div className="bcards">
            {vRows.map((b) => (
              <div className="bcard click" key={b.item} onClick={() => setBudItem(b.item)} title="클릭하면 집행한 지출결의서 목록을 봅니다">
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
                <div className="detail">
                  <span className="db">
                    지출결의서 {b.txCount > 0 ? `${b.txCount}건 ` : ''}보기 ›
                  </span>
                </div>
              </div>
            ))}
            {vRows.length === 0 && <CenterNote>등록된 예산 항목이 없습니다.</CenterNote>}
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
            <b style={{ color: 'var(--brand-ink)' }}>{prog.pct}%</b> · 완료 {prog.nDone} · 진행 {prog.nProg} · 예정 {prog.nBefore}
          </span>
          <Icon name="chevron" className="icon chev" />
        </summary>
        <div className="sbody">
          <ErrorBanner error={stepsQ.error} table="project_steps" />
          <ErrorBanner error={cmtQ.error} table="step_comments" />
          <Step20Editor projectId={id!} steps={steps} comments={comments} onChanged={reloadSteps} onSeed={seedSteps} seedBusy={budBusy} />
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
      {boqOpen && (
        <BoqModal
          projectId={p.id}
          projectName={p.name}
          budget={budget}
          onClose={() => setBoqOpen(false)}
          onApplied={() => budgetQ.reload()}
          onAddItem={() => { setBudgetForm({ item: BUDGET_ITEMS[0], alloc: 0 }); setAddBudget(true) }}
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
