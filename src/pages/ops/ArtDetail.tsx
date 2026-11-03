import { useMemo, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Icon } from '../../components/Icon'
import { ErrorBanner, CenterNote } from '../../components/States'
import { supabase } from '../../lib/supabase'
import { useQuery } from '../../lib/useQuery'
import { eok, won, dateOnly } from '../../lib/format'
import type {
  ArtProject,
  ArtBudget,
  BudgetChange,
  BudgetReceipt,
  ProjectStep,
  StepComment,
  Advisor,
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
  const [budBusy, setBudBusy] = useState(false)

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
    await supabase.from('budget_changes').insert({
      project_id: id!,
      date: changeForm.date,
      type: changeForm.type,
      memo: changeForm.memo || null,
      after_amount: changeForm.after,
    })
    setBudBusy(false)
    setAddChange(false)
    setChangeForm({ date: '', type: '증액', memo: '', after: 0 })
    changesQ.reload()
  }
  async function saveReceipt() {
    if (!receiptForm.date || !receiptForm.amount) return
    setBudBusy(true)
    await supabase.from('budget_receipts').insert({
      project_id: id!,
      kind: receiptForm.kind,
      date: receiptForm.date,
      amount: receiptForm.amount,
    })
    setBudBusy(false)
    setAddReceipt(false)
    setReceiptForm({ kind: '기성', date: '', amount: 0 })
    receiptsQ.reload()
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
      {/* 상단 고정 헤더 */}
      <div className="proj-head">
        <button className="btn txt" style={{ padding: 0, marginBottom: 8 }} onClick={() => navigate('/ops/art')}>
          ‹ 사업 목록
        </button>
        <div className="pt">
          <h2>{p.name}</h2>
          <span className="pst">{p.status}</span>
        </div>
        <div className="pnow">{p.now_text}</div>
        <div className="pprog">
          <div className="track">
            <div className={`fill${prog.pct === 100 ? ' full' : ''}`} style={{ width: `${prog.pct}%` }} />
          </div>
          <b>{prog.pct}%</b>
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
          <div className="field-grid">
            <Field l="구분" v={p.kind ?? '—'} />
            <Field l="발주기관" v={p.client ?? '—'} />
            <Field l="사업유형" v={<span className="badge gold">{p.proj_type}</span>} />
            <Field l="추정금액" v={eok(Number(p.est_amount) || contract)} />
            <Field l="계약금" v={eok(contract)} />
            <Field l="준공 예정" v={dateOnly(p.due_date) || '—'} />
            <Field
              l="준공 일자"
              v={p.done_date ? dateOnly(p.done_date) : <span className="chip c-prog"><i />진행중</span>}
            />
            <Field l="담당" v={'—'} />
          </div>

          {/* 자문위원 */}
          <div className="bud-h" style={{ marginTop: 18, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div className="t">
              자문위원 <span style={{ color: 'var(--muted)', fontWeight: 400 }}>· {advisors.length}명</span>
            </div>
            {advisors.length > 0 && (
              <button className="btn pri" style={{ padding: '5px 12px', fontSize: 11.5 }} onClick={() => setAdvOpen(true)}>
                자문비 지출결의서
              </button>
            )}
          </div>
          <table className="rowtbl">
            <thead>
              <tr>
                <th>이름</th>
                <th>소속</th>
                <th>연락처</th>
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
                </tr>
              ))}
              {advisors.length === 0 && (
                <tr>
                  <td colSpan={3} style={{ color: 'var(--muted)', textAlign: 'center', padding: 16 }}>
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
          예산 현황
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
                    <input className="hr-in" type="date" value={receiptForm.date} onChange={(e) => setReceiptForm({ ...receiptForm, date: e.target.value })} />
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
                    <input className="hr-in" type="date" value={changeForm.date} onChange={(e) => setChangeForm({ ...changeForm, date: e.target.value })} />
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
          <div className="bud-h" style={{ marginTop: 16 }}>
            <div className="t">예산 집행 현황</div>
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
          세부 진행 현황
          <span className="sc">
            총 {prog.total}공정 · 완료 {prog.nDone} · 진행 {prog.nProg}
          </span>
          <Icon name="chevron" className="icon chev" />
        </summary>
        <div className="sbody">
          {steps.length === 0 ? (
            <CenterNote>등록된 공정이 없습니다.</CenterNote>
          ) : (
            <Step20Editor
              projectId={id!}
              steps={steps}
              comments={comments}
              onChanged={reloadSteps}
            />
          )}
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

function Field({ l, v }: { l: string; v: React.ReactNode }) {
  return (
    <div className="field">
      <div className="fl">{l}</div>
      <div className="fv">{v}</div>
    </div>
  )
}
