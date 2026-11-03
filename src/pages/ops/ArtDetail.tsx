import { useMemo, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Icon } from '../../components/Icon'
import { ErrorBanner, CenterNote } from '../../components/States'
import { supabase } from '../../lib/supabase'
import { useQuery } from '../../lib/useQuery'
import { eok, won, dateRange, dateOnly } from '../../lib/format'
import type {
  ArtProject,
  ArtBudget,
  BudgetChange,
  BudgetReceipt,
  ProjectStep,
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
  STEP_LABEL,
} from './artDetail'

export default function ArtDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const detailsRefs = useRef<HTMLDetailsElement[]>([])

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

  const p = projQ.data?.[0]
  const budget = budgetQ.data ?? []
  const changes = changesQ.data ?? []
  const receipts = receiptsQ.data ?? []
  const steps = stepsQ.data ?? []
  const advisors = advQ.data ?? []
  const tx = txQ.data ?? []

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
          <div className="bud-h" style={{ marginTop: 18 }}>
            <div className="t">
              자문위원 <span style={{ color: 'var(--muted)', fontWeight: 400 }}>· {advisors.length}명</span>
            </div>
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

          {/* 설계변경 */}
          {changes.length > 0 && (
            <>
              <div className="bud-h" style={{ marginTop: 16 }}>
                <div className="t">설계변경</div>
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
                </tbody>
              </table>
            </>
          )}

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
          <div className="step20 sched">
            {steps.map((s, i) => {
              const cls = s.status === 'done' ? 'done' : s.status === 'prog' ? 'prog' : s.status === 'na' ? 'na' : ''
              return (
                <div className={`s20c ${cls}`} key={s.id}>
                  <div className="s20-main">
                    <div className="top">
                      <span className="num">{i + 1}</span>
                      <span>{s.title}</span>
                      <span className={`stt ${STEP_LABEL[s.status][0]}`}>{STEP_LABEL[s.status][1]}</span>
                    </div>
                    <div className="sch">
                      <Icon name="calendar" size={13} style={{ color: 'var(--muted)', flex: 'none' }} />
                      <span className="dur">
                        {s.from_date ? dateRange(s.from_date, s.to_date) : <span style={{ color: 'var(--muted)' }}>일정 미정</span>}
                      </span>
                    </div>
                  </div>
                </div>
              )
            })}
            {steps.length === 0 && <CenterNote>등록된 공정이 없습니다.</CenterNote>}
          </div>
          {steps.length > 0 && (
            <p className="sec-mini" style={{ marginTop: 12 }}>
              진행률 <b>{prog.pct}%</b> = (완료 {prog.nDone} + 진행중 {prog.nProg}×0.5) ÷ 유효 {prog.valid}공정
              {prog.nNa > 0 && (
                <span style={{ color: 'var(--muted)' }}> · 해당없음 {prog.nNa}건 제외</span>
              )}
            </p>
          )}
        </div>
      </details>
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
