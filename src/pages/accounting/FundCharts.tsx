// 자금현황 막대/도넛 차트 — 시안 renderFundBar / renderFundDonut 그대로 SVG 이식
import { sumTx, type Drill, type Sums } from './fund'
import { eok } from '../../lib/format'
import type { AcctTx } from '../../types/db'

/** 월별 수입/지출 막대 (만원 단위, 금액은 막대 위). 전체 12개월. */
export function FundBar({ rows, year, drill }: { rows: AcctTx[]; year: string; drill: Drill }) {
  const base = rows.filter((t) => {
    if (t.date.slice(0, 4) !== year) return false
    if (drill.biz && t.biz_code !== drill.biz) return false
    if (drill.dept && t.dept_key !== drill.dept) return false
    if (drill.project && t.project_id !== drill.project) return false
    return true
  })
  const mo: { m: number; inc: number; exp: number }[] = []
  for (let m = 1; m <= 12; m++) {
    const mm = String(m).padStart(2, '0')
    const s = sumTx(base.filter((t) => t.date.slice(5, 7) === mm))
    mo.push({ m, inc: s.income, exp: s.expense })
  }
  const max = Math.max(1, ...mo.map((x) => Math.max(x.inc, x.exp)))
  const W = 560,
    H = 210,
    padL = 8,
    padB = 24,
    padT = 22,
    gw = (W - padL * 2) / 12,
    bw = gw * 0.3
  const barVal = (n: number) => (n ? Math.round(n / 10000).toLocaleString('ko-KR') : '')

  const rects: JSX.Element[] = []
  const amts: JSX.Element[] = []
  const labels: JSX.Element[] = []
  mo.forEach((x, i) => {
    const cx = padL + gw * i + gw / 2
    const ih = (x.inc / max) * (H - padB - padT)
    const eh = (x.exp / max) * (H - padB - padT)
    const incX = cx - bw - 1,
      expX = cx + 1
    rects.push(
      <rect key={`i${i}`} x={incX.toFixed(1)} y={(H - padB - ih).toFixed(1)} width={bw.toFixed(1)} height={ih.toFixed(1)} rx="2" fill="var(--ok)" />,
      <rect key={`e${i}`} x={expX.toFixed(1)} y={(H - padB - eh).toFixed(1)} width={bw.toFixed(1)} height={eh.toFixed(1)} rx="2" fill="var(--expense)" />,
    )
    const incCX = incX + bw / 2,
      expCX = expX + bw / 2
    const bothClose = x.inc > 0 && x.exp > 0 && Math.abs(ih - eh) < 12
    if (x.inc > 0) {
      const iyOff = bothClose ? 15 : 4
      amts.push(
        <text key={`it${i}`} x={incCX.toFixed(1)} y={(H - padB - ih - iyOff).toFixed(1)} textAnchor="middle" fontSize="9" fontWeight="800" fill="var(--ok)">
          {barVal(x.inc)}
        </text>,
      )
    }
    if (x.exp > 0) {
      amts.push(
        <text key={`et${i}`} x={expCX.toFixed(1)} y={(H - padB - eh - 4).toFixed(1)} textAnchor="middle" fontSize="9" fontWeight="800" fill="var(--expense)">
          {barVal(x.exp)}
        </text>,
      )
    }
    labels.push(
      <text key={`l${i}`} x={cx.toFixed(1)} y={H - 8} textAnchor="middle" fontSize="9.5" fill="var(--muted)">
        {x.m}
      </text>,
    )
  })

  return (
    <div>
      <div className="chart-leg" style={{ justifyContent: 'space-between' }}>
        <span style={{ display: 'inline-flex', gap: 14 }}>
          <span>
            <i style={{ background: 'var(--ok)' }} />
            수입
          </span>
          <span>
            <i style={{ background: 'var(--expense)' }} />
            지출
          </span>
        </span>
        <span style={{ fontWeight: 700, color: 'var(--ink-soft)' }}>단위: 만원</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }}>
        <line x1={padL} y1={H - padB} x2={W - padL} y2={H - padB} stroke="var(--line)" strokeWidth="1" />
        {rects}
        {amts}
        {labels}
      </svg>
    </div>
  )
}

/** 수입/지출 구성 도넛 + 중앙 순이익 + 하단 범례 */
export function FundDonut({ s }: { s: Sums }) {
  const inc = s.income,
    exp = s.expense,
    tot = inc + exp
  const r = 58,
    cx = 80,
    cy = 80,
    c = 2 * Math.PI * r
  const incFrac = tot > 0 ? inc / tot : 0
  const incLen = c * incFrac,
    expLen = c * (1 - incFrac)
  const profit = inc - exp

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      <svg viewBox="0 0 160 160" style={{ width: '100%', maxWidth: 200, height: 'auto', flex: 'none' }}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--surface-2)" strokeWidth="22" />
        {tot > 0 && (
          <>
            <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--ok)" strokeWidth="22" strokeDasharray={`${incLen.toFixed(1)} ${c.toFixed(1)}`} transform={`rotate(-90 ${cx} ${cy})`} strokeLinecap="butt" />
            <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--expense)" strokeWidth="22" strokeDasharray={`${expLen.toFixed(1)} ${c.toFixed(1)}`} strokeDashoffset={(-incLen).toFixed(1)} transform={`rotate(-90 ${cx} ${cy})`} strokeLinecap="butt" />
          </>
        )}
        <text x={cx} y={cy - 6} textAnchor="middle" fontSize="11" fill="var(--muted)">
          순이익
        </text>
        <text x={cx} y={cy + 14} textAnchor="middle" fontSize="19" fontWeight="800" fill={profit >= 0 ? 'var(--brand)' : 'var(--expense)'}>
          {(profit >= 0 ? '+' : '') + eok(profit)}
        </text>
      </svg>
      <div style={{ display: 'flex', gap: 20, justifyContent: 'center', flexWrap: 'wrap', width: '100%' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, fontSize: 11, color: 'var(--muted)' }}>
            <i style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--ok)', display: 'inline-block' }} />
            수입
          </div>
          <div className="tnum" style={{ fontSize: 14, fontWeight: 800, color: 'var(--ok)' }}>
            {eok(inc)}
          </div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, fontSize: 11, color: 'var(--muted)' }}>
            <i style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--expense)', display: 'inline-block' }} />
            지출
          </div>
          <div className="tnum" style={{ fontSize: 14, fontWeight: 800, color: 'var(--expense)' }}>
            {eok(exp)}
          </div>
        </div>
      </div>
    </div>
  )
}
