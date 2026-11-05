// F'cast — 계획 대비 실적 (계정과목별 월·분기·연간). 대기업형 예실관리.
import { useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useQuery } from '../../lib/useQuery'
import { won } from '../../lib/format'
import { ErrorBanner, LoadingRow, EmptyRow } from '../../components/States'
import { AREAS, BIZ, bizShort, deptLabel } from '../../data/areas'
import type { AcctTx, BudgetPlan } from '../../types/db'

const NOW = new Date()
const CUR_YEAR = NOW.getFullYear()
const YEARS = [String(CUR_YEAR + 1), String(CUR_YEAR), String(CUR_YEAR - 1)]
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1)
const QUARTERS: [string, number[]][] = [
  ['1분기', [1, 2, 3]],
  ['2분기', [4, 5, 6]],
  ['3분기', [7, 8, 9]],
  ['4분기', [10, 11, 12]],
]

type Row = {
  tx_type: '수입' | '지출'
  account: string
  plan: number[] // index 0..11
  actual: number[]
}

/** 달성률 색상: 수입은 높을수록 좋고(초록), 지출은 계획 초과면 경고(빨강) */
function rateColor(txType: string, rate: number): string {
  if (rate === 0) return 'var(--muted)'
  if (txType === '수입') return rate >= 100 ? 'var(--ok)' : rate >= 80 ? 'var(--brand-ink)' : 'var(--expense)'
  return rate <= 100 ? 'var(--ok)' : 'var(--expense)' // 지출: 계획 이내면 좋음
}

export function ForecastView() {
  const [year, setYear] = useState(String(CUR_YEAR))
  const [biz, setBiz] = useState('all')
  const [dept, setDept] = useState('all')
  const [view, setView] = useState<'month' | 'quarter'>('quarter')
  const [planOpen, setPlanOpen] = useState(false)

  const planQ = useQuery<BudgetPlan[]>(
    async () => await supabase.from('acct_budget_plan').select('*').eq('year', Number(year)),
    [year],
  )
  const txQ = useQuery<Pick<AcctTx, 'date' | 'biz_code' | 'dept_key' | 'tx_type' | 'account' | 'amount'>[]>(
    async () =>
      await supabase
        .from('acct_tx')
        .select('date,biz_code,dept_key,tx_type,account,amount')
        .gte('date', `${year}-01-01`)
        .lte('date', `${year}-12-31`),
    [year],
  )

  const inScope = (bc: string | null, dk: string | null) =>
    (biz === 'all' || bc === biz) && (dept === 'all' || dk === dept)

  // (구분, 계정) 단위로 계획/실적 월별 집계
  const rows = useMemo<Row[]>(() => {
    const map = new Map<string, Row>()
    const key = (t: string, a: string) => `${t}||${a}`
    const ensure = (t: '수입' | '지출', a: string) => {
      const k = key(t, a)
      if (!map.has(k)) map.set(k, { tx_type: t, account: a, plan: Array(12).fill(0), actual: Array(12).fill(0) })
      return map.get(k)!
    }
    for (const p of planQ.data ?? []) {
      if (!inScope(p.biz_code, p.dept_key)) continue
      ensure(p.tx_type, p.account).plan[p.month - 1] += Number(p.plan_amount) || 0
    }
    for (const t of txQ.data ?? []) {
      if (!inScope(t.biz_code, t.dept_key)) continue
      const m = parseInt(t.date.slice(5, 7), 10) - 1
      if (m < 0 || m > 11) continue
      ensure(t.tx_type, t.account || '미지정').actual[m] += Number(t.amount) || 0
    }
    return [...map.values()].sort((a, b) =>
      a.tx_type !== b.tx_type ? (a.tx_type === '수입' ? -1 : 1) : a.account.localeCompare(b.account),
    )
  }, [planQ.data, txQ.data, biz, dept])

  const loading = planQ.loading || txQ.loading
  const cols = view === 'month' ? MONTHS.map((m) => [`${m}월`, [m]] as [string, number[]]) : QUARTERS
  const sumIn = (arr: number[], months: number[]) => months.reduce((s, m) => s + arr[m - 1], 0)

  // 구분별 섹션 (수입/지출)
  const sections: ('수입' | '지출')[] = ['수입', '지출']

  return (
    <section className="panel">
      <ErrorBanner error={planQ.error || txQ.error} table="acct_budget_plan" />
      <div className="panel-h">
        <div>
          <h2>F'cast · 계획 대비 실적</h2>
          <p>{year}년 계정과목별 계획(예산)과 실적을 비교합니다. 실적은 전표에서 자동 집계됩니다.</p>
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
          <select className="sel" value={dept} onChange={(e) => setDept(e.target.value)}>
            <option value="all">전체 부서</option>
            {AREAS.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
          </select>
          <button className="btn txt add-txt" onClick={() => setPlanOpen(true)}>+ 계획 입력</button>
        </div>
      </div>

      <div className="tbl-wrap">
        <table style={{ fontSize: 12 }}>
          <thead>
            <tr>
              <th style={{ whiteSpace: 'nowrap', minWidth: 110 }}>계정과목</th>
              <th style={{ whiteSpace: 'nowrap' }}>구분</th>
              {cols.map(([lbl]) => (
                <th key={lbl} style={{ textAlign: 'right', whiteSpace: 'nowrap', minWidth: 118 }}>{lbl}</th>
              ))}
              <th style={{ textAlign: 'right', whiteSpace: 'nowrap', minWidth: 130, background: 'var(--brand-soft)' }}>연간 계</th>
            </tr>
            <tr style={{ fontSize: 10.5, color: 'var(--muted)' }}>
              <th /><th style={{ textAlign: 'right' }}>계획/실적/달성</th>
              {cols.map(([lbl]) => (
                <th key={lbl} style={{ textAlign: 'right', fontWeight: 500 }}>계획 · 실적 · %</th>
              ))}
              <th style={{ background: 'var(--brand-soft)' }} />
            </tr>
          </thead>
          <tbody>
            {loading && <LoadingRow cols={cols.length + 3} />}
            {!loading && rows.length === 0 && (
              <EmptyRow cols={cols.length + 3} text="계획/실적 데이터가 없습니다. '+ 계획 입력'으로 예산을 세우거나 전표를 입력하세요." />
            )}
            {!loading &&
              sections.map((sec) => {
                const secRows = rows.filter((r) => r.tx_type === sec)
                if (secRows.length === 0) return null
                return (
                  <SectionRows key={sec} sec={sec} secRows={secRows} cols={cols} sumIn={sumIn} />
                )
              })}
          </tbody>
        </table>
      </div>
      <div className="sec-mini" style={{ marginTop: 10 }}>
        <b>달성률</b> = 실적 ÷ 계획 × 100. 수입은 100% 이상이 좋고(초록), 지출은 계획 이내(100% 이하)가 좋습니다.
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

// 구분(수입/지출) 섹션: 계정 행들 + 소계
function SectionRows({
  sec, secRows, cols, sumIn,
}: {
  sec: '수입' | '지출'
  secRows: Row[]
  cols: [string, number[]][]
  sumIn: (arr: number[], months: number[]) => number
}) {
  const totPlan = Array(12).fill(0).map((_, i) => secRows.reduce((s, r) => s + r.plan[i], 0))
  const totAct = Array(12).fill(0).map((_, i) => secRows.reduce((s, r) => s + r.actual[i], 0))
  const yrPlan = totPlan.reduce((a, b) => a + b, 0)
  const yrAct = totAct.reduce((a, b) => a + b, 0)
  return (
    <>
      <tr style={{ background: 'var(--line-1, #f3f3f3)' }}>
        <td colSpan={cols.length + 3} style={{ fontWeight: 800, color: sec === '수입' ? 'var(--ok)' : 'var(--expense)' }}>
          {sec}
        </td>
      </tr>
      {secRows.map((r) => (
        <tr key={r.account}>
          <td className="t-title">{r.account}</td>
          <td style={{ color: 'var(--muted)', fontSize: 10.5 }}>{r.tx_type}</td>
          {cols.map(([lbl, months]) => {
            const p = sumIn(r.plan, months)
            const a = sumIn(r.actual, months)
            const rate = p > 0 ? Math.round((a / p) * 100) : 0
            return <PlanActualCell key={lbl} plan={p} actual={a} rate={rate} txType={r.tx_type} />
          })}
          <YearCell plan={r.plan.reduce((a, b) => a + b, 0)} actual={r.actual.reduce((a, b) => a + b, 0)} txType={r.tx_type} />
        </tr>
      ))}
      <tr style={{ fontWeight: 800, background: 'var(--brand-soft)' }}>
        <td>{sec} 소계</td>
        <td />
        {cols.map(([lbl, months]) => {
          const p = sumIn(totPlan, months)
          const a = sumIn(totAct, months)
          const rate = p > 0 ? Math.round((a / p) * 100) : 0
          return <PlanActualCell key={lbl} plan={p} actual={a} rate={rate} txType={sec} bold />
        })}
        <YearCell plan={yrPlan} actual={yrAct} txType={sec} bold />
      </tr>
    </>
  )
}

function PlanActualCell({ plan, actual, rate, txType, bold }: { plan: number; actual: number; rate: number; txType: string; bold?: boolean }) {
  return (
    <td className="tnum" style={{ textAlign: 'right', fontWeight: bold ? 800 : undefined }}>
      <div style={{ color: 'var(--muted)' }}>{plan ? won(plan) : '—'}</div>
      <div>{actual ? won(actual) : '—'}</div>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: rateColor(txType, rate) }}>{rate ? `${rate}%` : ''}</div>
    </td>
  )
}

function YearCell({ plan, actual, txType, bold }: { plan: number; actual: number; txType: string; bold?: boolean }) {
  const rate = plan > 0 ? Math.round((actual / plan) * 100) : 0
  const diff = actual - plan
  return (
    <td className="tnum" style={{ textAlign: 'right', background: 'var(--brand-soft)', fontWeight: bold ? 800 : 600 }}>
      <div style={{ color: 'var(--muted)' }}>{plan ? won(plan) : '—'}</div>
      <div>{actual ? won(actual) : '—'}</div>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: rateColor(txType, rate) }}>
        {rate ? `${rate}%` : ''} {diff ? `(${diff > 0 ? '+' : ''}${won(diff)})` : ''}
      </div>
    </td>
  )
}

// ===== 계획 입력 모달 — 계정과목 1개의 12개월 계획금액 입력 =====
const PLAN_ACCOUNTS: Record<'수입' | '지출', string[]> = {
  수입: ['매출대금', '지원금', '기타수입'],
  지출: ['인건비', '재료비', '임대료', '관리비', '사무용품비', '도서인쇄비', '통신비', '운반비', '택배비', '복리후생비', '여비교통비', '지급수수료', '소모품비', '비품', '잡비', '기타'],
}

function PlanModal({ year, onClose, onSaved }: { year: string; onClose: () => void; onSaved: () => void }) {
  const [biz, setBiz] = useState('법인')
  const [dept, setDept] = useState('art')
  const [txType, setTxType] = useState<'수입' | '지출'>('지출')
  const [account, setAccount] = useState(PLAN_ACCOUNTS['지출'][0])
  const [vals, setVals] = useState<number[]>(Array(12).fill(0))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const total = vals.reduce((a, b) => a + b, 0)

  // 기존 계획 불러오기 (사업자·부서·구분·계정 지정 시)
  async function load() {
    const { data } = await supabase
      .from('acct_budget_plan')
      .select('month,plan_amount')
      .eq('year', Number(year)).eq('biz_code', biz).eq('dept_key', dept)
      .eq('tx_type', txType).eq('account', account)
    const next = Array(12).fill(0)
    for (const r of data ?? []) next[r.month - 1] = Number(r.plan_amount) || 0
    setVals(next)
    setMsg((data?.length ?? 0) > 0 ? '기존 계획을 불러왔습니다.' : null)
  }

  function setEqual() {
    // 연간 총액을 12등분
    const per = Math.round(total / 12)
    setVals(Array(12).fill(per))
  }

  async function save() {
    setBusy(true); setErr(null); setMsg(null)
    // 월별 upsert (0도 저장 — 계획 0 명시)
    const payload = vals.map((v, i) => ({
      biz_code: biz, dept_key: dept, tx_type: txType, account,
      year: Number(year), month: i + 1, plan_amount: v, updated_at: new Date().toISOString(),
    }))
    const { error } = await supabase
      .from('acct_budget_plan')
      .upsert(payload, { onConflict: 'biz_code,dept_key,tx_type,account,year,month' })
    setBusy(false)
    if (error) { setErr(error.message); return }
    onSaved()
  }

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640 }}>
        <div className="mh">
          <div>
            <div className="eyebrow">F'cast · 계획 입력</div>
            <h3>{year}년 계정과목 계획</h3>
          </div>
          <button className="x" onClick={onClose}>✕</button>
        </div>
        <div className="mb">
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <div className="mfield" style={{ flex: 1, minWidth: 110 }}>
              <label>사업자</label>
              <select className="ctl" value={biz} onChange={(e) => setBiz(e.target.value)}>
                {Object.keys(BIZ).map((b) => <option key={b} value={b}>{BIZ[b].kind}</option>)}
              </select>
            </div>
            <div className="mfield" style={{ flex: 1, minWidth: 110 }}>
              <label>부서</label>
              <select className="ctl" value={dept} onChange={(e) => setDept(e.target.value)}>
                {AREAS.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
              </select>
            </div>
            <div className="mfield" style={{ width: 100 }}>
              <label>구분</label>
              <select className="ctl" value={txType} onChange={(e) => { const t = e.target.value as '수입' | '지출'; setTxType(t); setAccount(PLAN_ACCOUNTS[t][0]) }}>
                <option value="수입">수입</option>
                <option value="지출">지출</option>
              </select>
            </div>
            <div className="mfield" style={{ flex: 1, minWidth: 130 }}>
              <label>계정과목</label>
              <select className="ctl" value={account} onChange={(e) => setAccount(e.target.value)}>
                {PLAN_ACCOUNTS[txType].map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, margin: '4px 0 8px' }}>
            <button className="btn txt" onClick={load} type="button" style={{ fontSize: 12 }}>기존 계획 불러오기</button>
            <button className="btn txt" onClick={setEqual} type="button" style={{ fontSize: 12 }}>12등분</button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            {MONTHS.map((m) => (
              <div className="mfield" key={m} style={{ margin: 0 }}>
                <label style={{ fontSize: 11 }}>{m}월</label>
                <input
                  className="ctl"
                  type="number"
                  min={0}
                  value={vals[m - 1] || ''}
                  onChange={(e) => setVals((v) => v.map((x, i) => (i === m - 1 ? parseInt(e.target.value, 10) || 0 : x)))}
                  style={{ padding: '6px 8px' }}
                />
              </div>
            ))}
          </div>
          <div className="sec-mini" style={{ margin: '10px 0 0', display: 'flex', justifyContent: 'space-between' }}>
            <span>{bizShort(biz)} · {deptLabel(dept)} · {txType} · {account}</span>
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
