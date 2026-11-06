// F'cast — 계획 대비 실적 (전년실적·계획·실적·달성률). 분기 기준, 수입=부서별 / 지출=계정과목별.
import { useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useQuery } from '../../lib/useQuery'
import { won } from '../../lib/format'
import { ErrorBanner, LoadingRow } from '../../components/States'
import { AREAS, BIZ, bizShort, deptLabel } from '../../data/areas'
import type { AcctTx, BudgetPlan } from '../../types/db'

const NOW = new Date()
const CUR_YEAR = NOW.getFullYear()
const YEARS = [String(CUR_YEAR + 1), String(CUR_YEAR), String(CUR_YEAR - 1)]
const QUARTERS: [string, number[]][] = [
  ["1Q", [1, 2, 3]],
  ["2Q", [4, 5, 6]],
  ["3Q", [7, 8, 9]],
  ["4Q", [10, 11, 12]],
]
// 수입 부서(섹션) — 경영·미술·상품·체험·교육·홍보 등 AREAS 전체
const INCOME_DEPTS = AREAS
// 지출 계정과목
const EXPENSE_ACCOUNTS = ['인건비', '재료비', '임대료', '관리비', '사무용품비', '도서인쇄비', '통신비', '운반비', '택배비', '복리후생비', '여비교통비', '지급수수료', '소모품비', '비품', '세금과공과', '잡비', '기타']

type Line = { prev: number[]; plan: number[]; act: number[] } // 각 12개월
const empty = (): Line => ({ prev: Array(12).fill(0), plan: Array(12).fill(0), act: Array(12).fill(0) })

// 수입=달성률(실적/계획), 지출=절감률((계획-실적)/계획). 계획 초과 시 지출은 음수(-%).
function calcRate(txType: string, plan: number, actual: number): number | null {
  if (plan <= 0) return null
  if (txType === '수입') return Math.round((actual / plan) * 100)
  return Math.round(((plan - actual) / plan) * 100) // 지출: 남으면 +, 초과하면 -
}
// 색상: 수입은 100%↑ 초록(목표달성)·미달 빨강, 지출은 0%↑ 초록(예산내)·음수 빨강(초과)
function rateColor(txType: string, rate: number | null): string {
  if (rate === null) return 'var(--muted)'
  if (txType === '수입') return rate >= 100 ? 'var(--ok)' : rate >= 80 ? 'var(--brand-ink)' : 'var(--expense)'
  return rate >= 0 ? 'var(--ok)' : 'var(--expense)'
}
const rateText = (r: number | null) => (r === null ? '—' : `${r}%`)
const qsum = (arr: number[], months: number[]) => months.reduce((s, m) => s + arr[m - 1], 0)
const ysum = (arr: number[]) => arr.reduce((a, b) => a + b, 0)

export function ForecastView() {
  const [year, setYear] = useState(String(CUR_YEAR))
  const [biz, setBiz] = useState('all')
  const [view, setView] = useState<'quarter' | 'month'>('quarter')
  const [planOpen, setPlanOpen] = useState(false)
  const prevYear = Number(year) - 1

  // 열 구성: 분기(1Q~4Q) 또는 월(1~12월)
  const cols: [string, number[]][] =
    view === 'month'
      ? Array.from({ length: 12 }, (_, i) => [`${i + 1}월`, [i + 1]] as [string, number[]])
      : QUARTERS
  const avgDiv = view === 'month' ? 12 : 4 // 평균 분모

  const planQ = useQuery<BudgetPlan[]>(
    async () => await supabase.from('acct_budget_plan').select('*').eq('year', Number(year)),
    [year],
  )
  // 올해 + 전년 전표 한 번에
  const txQ = useQuery<Pick<AcctTx, 'date' | 'biz_code' | 'dept_key' | 'tx_type' | 'account' | 'amount'>[]>(
    async () =>
      await supabase
        .from('acct_tx')
        .select('date,biz_code,dept_key,tx_type,account,amount')
        .gte('date', `${prevYear}-01-01`)
        .lte('date', `${year}-12-31`),
    [year],
  )

  const inBiz = (bc: string | null) => biz === 'all' || bc === biz

  // 수입: 부서별 / 지출: 계정별 Line 집계
  const { income, expense } = useMemo(() => {
    const inc = new Map<string, Line>() // key: dept_key
    const exp = new Map<string, Line>() // key: account
    const ensure = (m: Map<string, Line>, k: string) => {
      if (!m.has(k)) m.set(k, empty())
      return m.get(k)!
    }
    // 계획(올해)
    for (const p of planQ.data ?? []) {
      if (!inBiz(p.biz_code)) continue
      if (p.tx_type === '수입') ensure(inc, p.dept_key || '기타').plan[p.month - 1] += Number(p.plan_amount) || 0
      else ensure(exp, p.account || '기타').plan[p.month - 1] += Number(p.plan_amount) || 0
    }
    // 실적(올해=act / 전년=prev)
    for (const t of txQ.data ?? []) {
      if (!inBiz(t.biz_code)) continue
      const y = t.date.slice(0, 4)
      const mi = parseInt(t.date.slice(5, 7), 10) - 1
      if (mi < 0 || mi > 11) continue
      const amt = Number(t.amount) || 0
      const bucket = t.tx_type === '수입' ? ensure(inc, t.dept_key || '기타') : ensure(exp, t.account || '기타')
      if (y === year) bucket.act[mi] += amt
      else if (y === String(prevYear)) bucket.prev[mi] += amt
    }
    return { income: inc, expense: exp }
  }, [planQ.data, txQ.data, biz, year, prevYear])

  const loading = planQ.loading || txQ.loading

  // 표시 행: 수입=부서 순서 고정(데이터 있거나 계획 있으면) / 지출=계정 순서 고정
  const incomeRows = INCOME_DEPTS
    .map((d) => ({ key: d.id, label: d.label, line: income.get(d.id) }))
    .filter((r) => r.line && (ysum(r.line.prev) || ysum(r.line.plan) || ysum(r.line.act)))
  const expenseRows = EXPENSE_ACCOUNTS
    .map((a) => ({ key: a, label: a, line: expense.get(a) }))
    .filter((r) => r.line && (ysum(r.line.prev) || ysum(r.line.plan) || ysum(r.line.act)))
  // 계획/실적에 있지만 목록에 없는 계정도 포함
  for (const [acc, line] of expense) {
    if (!EXPENSE_ACCOUNTS.includes(acc) && (ysum(line.prev) || ysum(line.plan) || ysum(line.act)))
      expenseRows.push({ key: acc, label: acc, line })
  }

  return (
    <section className="panel">
      <ErrorBanner error={planQ.error || txQ.error} table="acct_budget_plan" />
      <div className="panel-h">
        <div>
          <h2>F'cast · 계획 대비 실적</h2>
          <p>{prevYear}년 분기 실적을 토대로 {year}년 계획을 세우고 실적을 비교합니다. 수입은 부서별, 지출은 계정과목별.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginLeft: 'auto' }}>
          <div className="subtabs" style={{ margin: 0 }}>
            <button className={view === 'quarter' ? 'on' : ''} onClick={() => setView('quarter')}>분기별</button>
            <button className={view === 'month' ? 'on' : ''} onClick={() => setView('month')}>월별</button>
          </div>
          <select className="sel" value={year} onChange={(e) => setYear(e.target.value)}>
            {YEARS.map((y) => <option key={y} value={y}>{y}년</option>)}
          </select>
          <select className="sel" value={biz} onChange={(e) => setBiz(e.target.value)}>
            <option value="all">전체 사업자</option>
            {Object.keys(BIZ).map((b) => <option key={b} value={b}>{BIZ[b].kind}</option>)}
          </select>
          <button className="btn txt add-txt" onClick={() => setPlanOpen(true)}>+ 계획 입력</button>
        </div>
      </div>

      <div className="tbl-wrap">
        <table style={{ fontSize: 12 }}>
          <thead>
            <tr>
              <th style={{ whiteSpace: 'nowrap', minWidth: 72 }}>구분</th>
              <th style={{ whiteSpace: 'nowrap', minWidth: 92 }}>항목</th>
              {cols.map(([lbl]) => (
                <th key={lbl} style={{ textAlign: 'right', whiteSpace: 'nowrap', minWidth: view === 'month' ? 88 : 104 }}>{lbl}</th>
              ))}
              <th style={{ textAlign: 'right', whiteSpace: 'nowrap', minWidth: 112, background: 'var(--brand-soft)' }}>합계</th>
              <th style={{ textAlign: 'right', whiteSpace: 'nowrap', minWidth: 104, background: 'var(--brand-soft)' }}>{view === 'month' ? '월평균' : '분기평균'}</th>
            </tr>
          </thead>
          <tbody>
            {loading && <LoadingRow cols={cols.length + 4} />}
            {!loading && (
              <>
                <SectionHeader label="수입" color="var(--ok)" span={cols.length + 4} />
                {incomeRows.length === 0 && <NoData label="수입 데이터가 없습니다." span={cols.length + 4} />}
                {incomeRows.map((r) => <ItemBlock key={r.key} label={r.label} line={r.line!} txType="수입" cols={cols} avgDiv={avgDiv} />)}
                {incomeRows.length > 0 && <TotalBlock label="수입 합계" rows={incomeRows.map((r) => r.line!)} txType="수입" cols={cols} avgDiv={avgDiv} />}

                <SectionHeader label="지출" color="var(--expense)" span={cols.length + 4} />
                {expenseRows.length === 0 && <NoData label="지출 데이터가 없습니다." span={cols.length + 4} />}
                {expenseRows.map((r) => <ItemBlock key={r.key} label={r.label} line={r.line!} txType="지출" cols={cols} avgDiv={avgDiv} />)}
                {expenseRows.length > 0 && <TotalBlock label="지출 합계" rows={expenseRows.map((r) => r.line!)} txType="지출" cols={cols} avgDiv={avgDiv} />}
              </>
            )}
          </tbody>
        </table>
      </div>
      <div className="sec-mini" style={{ marginTop: 10 }}>
        한 항목은 <b>전년도 실적 · 당해년도 계획 · 당해년도 실적 · 달성률/절감률</b> 4줄. 평균은 {view === 'month' ? '월' : '분기'}평균(합계÷{avgDiv}).
        <b> 수입 달성률</b> = 실적÷계획×100 (100%↑ 초록). <b>지출 절감률</b> = (계획−실적)÷계획×100 (예산 내 +%·초록, 초과 시 −%·빨강).
      </div>

      {planOpen && (
        <PlanModal
          year={year}
          onClose={() => setPlanOpen(false)}
          onSaved={() => { planQ.reload(); setPlanOpen(false) }}
        />
      )}
    </section>
  )
}

function SectionHeader({ label, color, span }: { label: string; color: string; span: number }) {
  return (
    <tr style={{ background: 'var(--line-1, #f1f1f1)' }}>
      <td colSpan={span} style={{ fontWeight: 800, color }}>{label}</td>
    </tr>
  )
}
function NoData({ label, span }: { label: string; span: number }) {
  return <tr><td colSpan={span} style={{ color: 'var(--muted)', padding: '10px 12px' }}>{label}</td></tr>
}

// 한 항목 = 4행(전년실적/계획/실적/달성률). cols = 분기 또는 월 열.
function ItemBlock({ label, line, txType, cols, avgDiv }: { label: string; line: Line; txType: string; cols: [string, number[]][]; avgDiv: number }) {
  const bucket = (arr: number[]) => cols.map(([, ms]) => qsum(arr, ms))
  const prevQ = bucket(line.prev), planQ_ = bucket(line.plan), actQ = bucket(line.act)
  const cell = (v: number) => (v ? won(v) : '—')
  const avg = (arr: number[]) => Math.round(ysum(arr) / avgDiv)
  const rowStyle = { borderTop: 'none' } as const
  return (
    <>
      <tr>
        <td rowSpan={4} style={{ fontWeight: 700, verticalAlign: 'top', borderRight: '1px solid var(--line, #eee)', whiteSpace: 'nowrap' }}>{label}</td>
        <td style={{ color: 'var(--muted)', whiteSpace: 'nowrap' }}>전년도 실적</td>
        {prevQ.map((v, i) => <td key={i} className="tnum" style={{ textAlign: 'right', color: 'var(--muted)' }}>{cell(v)}</td>)}
        <td className="tnum" style={{ textAlign: 'right', background: 'var(--brand-soft)', color: 'var(--muted)' }}>{cell(ysum(line.prev))}</td>
        <td className="tnum" style={{ textAlign: 'right', background: 'var(--brand-soft)', color: 'var(--muted)' }}>{cell(avg(line.prev))}</td>
      </tr>
      <tr style={rowStyle}>
        <td>당해년도 계획</td>
        {planQ_.map((v, i) => <td key={i} className="tnum" style={{ textAlign: 'right' }}>{cell(v)}</td>)}
        <td className="tnum" style={{ textAlign: 'right', background: 'var(--brand-soft)', fontWeight: 700 }}>{cell(ysum(line.plan))}</td>
        <td className="tnum" style={{ textAlign: 'right', background: 'var(--brand-soft)' }}>{cell(avg(line.plan))}</td>
      </tr>
      <tr style={rowStyle}>
        <td>당해년도 실적</td>
        {actQ.map((v, i) => <td key={i} className="tnum" style={{ textAlign: 'right', fontWeight: 600 }}>{cell(v)}</td>)}
        <td className="tnum" style={{ textAlign: 'right', background: 'var(--brand-soft)', fontWeight: 700 }}>{cell(ysum(line.act))}</td>
        <td className="tnum" style={{ textAlign: 'right', background: 'var(--brand-soft)' }}>{cell(avg(line.act))}</td>
      </tr>
      <tr style={rowStyle}>
        <td style={{ color: 'var(--muted)' }}>{txType === '수입' ? '달성률' : '절감률'}</td>
        {cols.map((_, i) => {
          const rate = calcRate(txType, planQ_[i], actQ[i])
          return <td key={i} className="tnum" style={{ textAlign: 'right', fontWeight: 700, color: rateColor(txType, rate) }}>{rateText(rate)}</td>
        })}
        {(() => {
          const rate = calcRate(txType, ysum(line.plan), ysum(line.act))
          return <td className="tnum" style={{ textAlign: 'right', background: 'var(--brand-soft)', fontWeight: 800, color: rateColor(txType, rate) }}>{rateText(rate)}</td>
        })()}
        <td style={{ background: 'var(--brand-soft)' }} />
      </tr>
    </>
  )
}

// 섹션 합계(수입/지출 전체) — 동일 4행 구조
function TotalBlock({ label, rows, txType, cols, avgDiv }: { label: string; rows: Line[]; txType: string; cols: [string, number[]][]; avgDiv: number }) {
  const sum = (sel: (l: Line) => number[]) => Array(12).fill(0).map((_, i) => rows.reduce((s, l) => s + sel(l)[i], 0))
  const agg: Line = { prev: sum((l) => l.prev), plan: sum((l) => l.plan), act: sum((l) => l.act) }
  return (
    <ItemBlock label={label} line={agg} txType={txType} cols={cols} avgDiv={avgDiv} />
  )
}

// ===== 계획 입력 모달 — 수입(부서)/지출(계정) 분기별 계획 =====
function PlanModal({ year, onClose, onSaved }: { year: string; onClose: () => void; onSaved: () => void }) {
  const [biz, setBiz] = useState('법인')
  const [txType, setTxType] = useState<'수입' | '지출'>('수입')
  const [dept, setDept] = useState(INCOME_DEPTS[0]?.id ?? 'art')
  const [account, setAccount] = useState(EXPENSE_ACCOUNTS[0])
  const [q, setQ] = useState<number[]>([0, 0, 0, 0]) // 분기별 계획
  const [prevRef, setPrevRef] = useState<number[] | null>(null) // 전년 분기 실적 참고
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const total = q.reduce((a, b) => a + b, 0)
  const curKey = txType === '수입' ? dept : account

  // 전년 분기실적 + 올해 기존계획 불러오기 (참고용)
  async function load() {
    setMsg(null)
    const prevYear = Number(year) - 1
    // 전년 실적
    let txReq = supabase.from('acct_tx').select('date,amount')
      .eq('tx_type', txType).eq('biz_code', biz)
      .gte('date', `${prevYear}-01-01`).lte('date', `${prevYear}-12-31`)
    txReq = txType === '수입' ? txReq.eq('dept_key', dept) : txReq.eq('account', account)
    const { data: tx } = await txReq
    const pq = [0, 0, 0, 0]
    for (const r of tx ?? []) {
      const m = parseInt(r.date.slice(5, 7), 10)
      pq[Math.floor((m - 1) / 3)] += Number(r.amount) || 0
    }
    setPrevRef(pq)
    // 올해 기존 계획
    let plReq = supabase.from('acct_budget_plan').select('month,plan_amount')
      .eq('year', Number(year)).eq('biz_code', biz).eq('tx_type', txType)
    plReq = txType === '수입'
      ? plReq.eq('dept_key', dept).eq('account', '수입')
      : plReq.eq('dept_key', '공통').eq('account', account)
    const { data: pl } = await plReq
    const qq = [0, 0, 0, 0]
    for (const r of pl ?? []) qq[Math.floor((r.month - 1) / 3)] += Number(r.plan_amount) || 0
    if ((pl?.length ?? 0) > 0) { setQ(qq); setMsg('전년 실적과 기존 계획을 불러왔습니다.') }
    else setMsg('전년 분기 실적을 참고로 불러왔습니다.')
  }

  function usePrev() { if (prevRef) setQ([...prevRef]) }

  async function save() {
    setBusy(true); setErr(null); setMsg(null)
    // 분기 → 월(3등분, 나머지는 첫 달). dept/account 저장 규칙 고정.
    const dept_key = txType === '수입' ? dept : '공통'
    const acc = txType === '수입' ? '수입' : account
    const rows: { biz_code: string; dept_key: string; tx_type: string; account: string; year: number; month: number; plan_amount: number; updated_at: string }[] = []
    q.forEach((qv, qi) => {
      const base = Math.floor(qv / 3), rem = qv - base * 3
      for (let k = 0; k < 3; k++) {
        rows.push({
          biz_code: biz, dept_key, tx_type: txType, account: acc,
          year: Number(year), month: qi * 3 + k + 1,
          plan_amount: base + (k === 0 ? rem : 0), updated_at: new Date().toISOString(),
        })
      }
    })
    const { error } = await supabase.from('acct_budget_plan')
      .upsert(rows, { onConflict: 'biz_code,dept_key,tx_type,account,year,month' })
    setBusy(false)
    if (error) { setErr(error.message); return }
    onSaved()
  }

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
        <div className="mh">
          <div>
            <div className="eyebrow">F'cast · 계획 입력</div>
            <h3>{year}년 계획 (분기)</h3>
          </div>
          <button className="x" onClick={onClose}>✕</button>
        </div>
        <div className="mb">
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <div className="mfield" style={{ width: 120 }}>
              <label>사업자</label>
              <select className="ctl" value={biz} onChange={(e) => setBiz(e.target.value)}>
                {Object.keys(BIZ).map((b) => <option key={b} value={b}>{BIZ[b].kind}</option>)}
              </select>
            </div>
            <div className="mfield" style={{ width: 100 }}>
              <label>구분</label>
              <select className="ctl" value={txType} onChange={(e) => { setTxType(e.target.value as '수입' | '지출'); setPrevRef(null); setQ([0, 0, 0, 0]) }}>
                <option value="수입">수입</option>
                <option value="지출">지출</option>
              </select>
            </div>
            <div className="mfield" style={{ flex: 1, minWidth: 140 }}>
              <label>{txType === '수입' ? '부서' : '계정과목'}</label>
              {txType === '수입' ? (
                <select className="ctl" value={dept} onChange={(e) => { setDept(e.target.value); setPrevRef(null) }}>
                  {INCOME_DEPTS.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
                </select>
              ) : (
                <select className="ctl" value={account} onChange={(e) => { setAccount(e.target.value); setPrevRef(null) }}>
                  {EXPENSE_ACCOUNTS.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, margin: '4px 0 10px' }}>
            <button className="btn txt" type="button" onClick={load} style={{ fontSize: 12 }}>전년실적·기존계획 불러오기</button>
            {prevRef && <button className="btn txt" type="button" onClick={usePrev} style={{ fontSize: 12 }}>전년값 그대로</button>}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            {QUARTERS.map(([lbl], i) => (
              <div className="mfield" key={lbl} style={{ margin: 0 }}>
                <label style={{ fontSize: 11 }}>
                  {lbl}{prevRef ? <span style={{ color: 'var(--muted)' }}> · 전년 {won(prevRef[i])}</span> : ''}
                </label>
                <input
                  className="ctl" type="number" min={0}
                  value={q[i] || ''}
                  onChange={(e) => setQ((v) => v.map((x, j) => (j === i ? parseInt(e.target.value, 10) || 0 : x)))}
                  style={{ padding: '6px 8px' }}
                />
              </div>
            ))}
          </div>
          <div className="sec-mini" style={{ margin: '10px 0 0', display: 'flex', justifyContent: 'space-between' }}>
            <span>{bizShort(biz)} · {txType} · {txType === '수입' ? deptLabel(curKey) : curKey}</span>
            <b>연간 계획 ₩{won(total)}</b>
          </div>

          {msg && <div className="login-alert warn" style={{ margin: '8px 0 0' }}>{msg}</div>}
          {err && <div className="login-alert err" style={{ margin: '8px 0 0' }}>{err}</div>}
        </div>
        <div className="mf">
          <button className="btn sec" onClick={onClose} disabled={busy}>취소</button>
          <button className="btn pri" onClick={save} disabled={busy}>{busy ? '저장 중…' : '계획 저장'}</button>
        </div>
      </div>
    </div>
  )
}
