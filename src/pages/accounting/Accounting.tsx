import { useEffect, useMemo, useRef, useState } from 'react'
import { PageHead } from '../../components/PageHead'
import { ErrorBanner, LoadingRow, EmptyRow } from '../../components/States'
import { supabase } from '../../lib/supabase'
import { useQuery } from '../../lib/useQuery'
import { eok, dateOnly } from '../../lib/format'
import { bizLabel, ACCT_ORG } from '../../data/areas'
import type { AcctTx, ArtProject } from '../../types/db'
import {
  sumTx,
  inPeriod,
  periodSum,
  delta,
  type Drill,
  type Delta,
  type Sums,
} from './fund'
import { FundBar, FundDonut } from './FundCharts'
import { InboxView, CardView, PartnerView } from './AcctTabs'

const NOW = new Date()
const CUR_YEAR = NOW.getFullYear()
const CUR_MONTH = String(NOW.getMonth() + 1).padStart(2, '0')
const YEARS = [String(CUR_YEAR), String(CUR_YEAR - 1)]
// 월 선택: 연간 + 1~12월
const MONTHS: readonly (readonly [string, string])[] = [
  ['all', '연간'],
  ...Array.from({ length: 12 }, (_, i) => {
    const m = String(i + 1).padStart(2, '0')
    return [m, `${i + 1}월`] as const
  }),
]

type Tab = 'fund' | 'inbox' | 'ledger' | 'card' | 'partner'

// 전년대비 뱃지
function DeltaBadge({ d }: { d: Delta }) {
  if (d.kind === 'new') return <span className="dlt up">신규</span>
  if (d.kind === 'none') return <span className="dlt">—</span>
  if (d.kind === 'up') return <span className="dlt up">▲ {d.pct}%</span>
  if (d.kind === 'down') return <span className="dlt down">▼ {Math.abs(d.pct)}%</span>
  return <span className="dlt">0%</span>
}

// KPI 카드 (시안 kpiCard2)
function Kpi({
  lbl,
  val,
  color,
  badge,
  sub,
}: {
  lbl: string
  val: string
  color?: string
  badge?: React.ReactNode
  sub?: string
}) {
  return (
    <div className="stat">
      <div>
        <div className="lbl" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span>{lbl}</span>
          {badge}
        </div>
        <div className="val tnum" style={color ? { color } : undefined}>
          {val}
        </div>
        {sub && <div className="sub tnum">{sub}</div>}
      </div>
    </div>
  )
}

export default function Accounting() {
  const [tab, setTab] = useState<Tab>('fund')
  const [year, setYear] = useState(String(CUR_YEAR))
  const [month, setMonth] = useState(CUR_MONTH) // 시안처럼 당월 기본
  const [drill, setDrill] = useState<Drill>({ level: 'company' })

  const txQ = useQuery<AcctTx[]>(
    async () =>
      await supabase
        .from('acct_tx')
        .select(
          'id,date,biz_code,dept_key,tx_type,account,amount,partner,memo,project_id,budget_item,src,year',
        ),
    [],
  )
  const projQ = useQuery<Pick<ArtProject, 'id' | 'name'>[]>(
    async () => await supabase.from('art_projects').select('id,name'),
    [],
  )

  const allTx = txQ.data ?? []
  const projName = useMemo(() => {
    const m: Record<string, string> = {}
    for (const p of projQ.data ?? []) m[p.id] = p.name
    return m
  }, [projQ.data])

  // 데이터 로드 후 1회: 당월에 전표가 없으면 '당해연도 전표가 있는 가장 최근 월'로 맞춤
  const snapped = useRef(false)
  useEffect(() => {
    if (snapped.current || allTx.length === 0) return
    snapped.current = true
    const curYearMonths = allTx
      .filter((t) => t.date.slice(0, 4) === String(CUR_YEAR))
      .map((t) => t.date.slice(5, 7))
    if (curYearMonths.length === 0) return
    if (!curYearMonths.includes(CUR_MONTH)) {
      const sorted = curYearMonths.sort()
      setMonth(sorted[sorted.length - 1])
    }
  }, [allTx])

  const periodText = month === 'all' ? `${year}년 연간` : `${year}년 ${parseInt(month, 10)}월`

  return (
    <div className="page on">
      <PageHead
        eyebrow="경영 · 회계"
        title="회계관리"
        desc="사업자·부서별 자금 흐름과 전표를 확인하세요."
      />

      <div className="subtabs" role="tablist">
        {([
          ['fund', '자금현황'],
          ['inbox', '접수대기'],
          ['ledger', '전표내역'],
          ['card', '카드내역'],
          ['partner', '업체정보'],
        ] as [Tab, string][]).map(([k, t]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
            {t}
          </button>
        ))}
      </div>

      <ErrorBanner error={txQ.error} table="acct_tx" />

      {tab === 'fund' && (
        <FundView
          allTx={allTx}
          loading={txQ.loading}
          year={year}
          month={month}
          setYear={setYear}
          setMonth={setMonth}
          drill={drill}
          setDrill={setDrill}
          projName={projName}
          periodText={periodText}
        />
      )}

      {tab === 'ledger' && <LedgerView allTx={allTx} loading={txQ.loading} projName={projName} />}
      {tab === 'inbox' && <InboxView onPosted={() => txQ.reload()} />}
      {tab === 'card' && <CardView onPosted={() => txQ.reload()} />}
      {tab === 'partner' && <PartnerView />}
    </div>
  )
}

// ========================= 자금현황 =========================
function FundView({
  allTx,
  loading,
  year,
  month,
  setYear,
  setMonth,
  drill,
  setDrill,
  projName,
  periodText,
}: {
  allTx: AcctTx[]
  loading: boolean
  year: string
  month: string
  setYear: (v: string) => void
  setMonth: (v: string) => void
  drill: Drill
  setDrill: (d: Drill) => void
  projName: Record<string, string>
  periodText: string
}) {
  // 현재 기간+drill 전표
  const scope = allTx.filter((t) => inPeriod(t, year, month, drill))
  const s = sumTx(scope)

  // 전년대비 (같은 월범위)
  const monthMax = month === 'all' ? 12 : parseInt(month, 10)
  const curY = parseInt(year, 10)
  const ytdCur = periodSum(allTx, curY, monthMax, drill)
  const ytdPrev = periodSum(allTx, curY - 1, monthMax, drill)

  // drill 이동
  const go = (d: Drill) => setDrill(d)

  // 엑셀(CSV) 내보내기 — 현재 기간+drill 전표
  function exportCsv() {
    const head = ['일자', '사업자', '부서', '구분', '계정', '거래처', '적요', '금액', '출처']
    const lines = [...scope]
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .map((t) =>
        [
          dateOnly(t.date),
          t.biz_code ?? '',
          t.dept_key ?? '',
          t.tx_type,
          t.account ?? '',
          t.partner ?? '',
          (t.memo ?? '').replace(/"/g, '""'),
          String(Number(t.amount) || 0),
          t.src ?? '',
        ]
          .map((c) => `"${c}"`)
          .join(','),
      )
    const csv = '﻿' + [head.map((h) => `"${h}"`).join(','), ...lines].join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `자금현황_${year}_${month === 'all' ? '연간' : month + '월'}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      {/* 기간 + breadcrumb */}
      <section className="panel">
        <div className="panel-h" style={{ alignItems: 'center' }}>
          <div className="acct-crumb">
            <button className="crumb-b" onClick={() => go({ level: 'company' })}>
              회사 전체
            </button>
            {drill.biz && (
              <>
                <span className="crumb-sep">›</span>
                <button className="crumb-b" onClick={() => go({ level: 'biz', biz: drill.biz })}>
                  {bizLabel(drill.biz)}
                </button>
              </>
            )}
            {drill.dept && (
              <>
                <span className="crumb-sep">›</span>
                <button
                  className="crumb-b"
                  onClick={() => go({ level: 'dept', biz: drill.biz, dept: drill.dept })}
                >
                  {drill.dept}
                </button>
              </>
            )}
            {drill.project && (
              <>
                <span className="crumb-sep">›</span>
                <b>{projName[drill.project] ?? '사업'}</b>
              </>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <select className="sel" value={year} onChange={(e) => setYear(e.target.value)}>
              {YEARS.map((y) => (
                <option key={y} value={y}>
                  {y}년
                </option>
              ))}
            </select>
            <select className="sel" value={month} onChange={(e) => setMonth(e.target.value)}>
              {MONTHS.map(([v, t]) => (
                <option key={v} value={v}>
                  {t}
                </option>
              ))}
            </select>
            <button className="btn sec" onClick={exportCsv} disabled={scope.length === 0}>
              엑셀 내보내기
            </button>
          </div>
        </div>

        {/* KPI */}
        <div className="stats" style={{ marginTop: 4 }}>
          <Kpi lbl="수입" val={eok(s.income)} color="var(--ok)" badge={<DeltaBadge d={delta(ytdCur.income, ytdPrev.income)} />} sub={`전년 ${eok(ytdPrev.income)}`} />
          <Kpi lbl="지출" val={eok(s.expense)} color="var(--expense)" badge={<DeltaBadge d={delta(ytdCur.expense, ytdPrev.expense)} />} sub={`전년 ${eok(ytdPrev.expense)}`} />
          <Kpi lbl="순이익" val={(s.profit >= 0 ? '+' : '') + eok(s.profit)} color={s.profit >= 0 ? 'var(--brand)' : 'var(--expense)'} badge={<DeltaBadge d={delta(ytdCur.profit, ytdPrev.profit)} />} sub={`전년 ${eok(ytdPrev.profit)}`} />
          <Kpi lbl="전표" val={`${scope.length}건`} sub={periodText} />
        </div>
      </section>

      {/* 누계 · 전년 대비 비교 밴드 */}
      <FundCompare curY={curY} month={month} monthMax={monthMax} cur={ytdCur} prev={ytdPrev} />

      {/* 차트 (대표용): 월별 수지 막대 + 수입/지출 도넛 */}
      <div className="fund-charts">
        <section className="panel">
          <div className="panel-h" style={{ marginBottom: 6 }}>
            <div>
              <h2 style={{ fontSize: 16 }}>월별 수지 추이</h2>
            </div>
          </div>
          <FundBar rows={allTx} year={year} drill={drill} />
        </section>
        <section className="panel">
          <div className="panel-h" style={{ marginBottom: 6 }}>
            <div>
              <h2 style={{ fontSize: 16 }}>수입 · 지출</h2>
              <p>이 기간 구성</p>
            </div>
          </div>
          <FundDonut s={s} />
        </section>
      </div>

      {/* drill 테이블 */}
      <section className="panel">
        <div className="panel-h">
          <div>
            <h2>{fundTableTitle(drill, projName)}</h2>
            <p>행을 누르면 그 아래로 들어갑니다.</p>
          </div>
        </div>
        <FundTable
          allTx={allTx}
          loading={loading}
          scope={scope}
          s={s}
          year={year}
          month={month}
          drill={drill}
          go={go}
          projName={projName}
        />
      </section>
    </>
  )
}

// 드릴 레벨별 표 제목 (시안: 사업자별 손익 / …부서별 손익 / …전표)
function fundTableTitle(d: Drill, projName: Record<string, string>): string {
  if (d.level === 'company') return '사업자별 손익'
  if (d.level === 'biz') return `${bizLabel(d.biz!)} · 부서별 손익`
  if (d.level === 'dept') return `${bizLabel(d.biz!)} · ${d.dept} · 전표`
  return `${projName[d.project!] ?? '사업'} · 손익`
}

// ===== 누계·전년 대비 비교 밴드 (시안 renderFundCompare) =====
function FundCompare({
  curY,
  month,
  monthMax,
  cur,
  prev,
}: {
  curY: number
  month: string
  monthMax: number
  cur: Sums
  prev: Sums
}) {
  const periodTxt = month === 'all' ? `${curY}년 연간` : `${curY}년 1~${monthMax}월 누계`
  const prevTxt = month === 'all' ? `${curY - 1}년 연간` : `${curY - 1}년 1~${monthMax}월`
  return (
    <section className="panel" style={{ marginTop: 14 }}>
      <div className="cmp-head">
        <h2 style={{ fontSize: 15, margin: 0 }}>누계 · 전년 대비</h2>
        <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>
          <b style={{ color: 'var(--brand-ink)' }}>{periodTxt}</b> vs {prevTxt}
        </span>
      </div>
      <div className="cmp-grid">
        <CmpItem lbl="수입" cur={cur.income} prev={prev.income} color="var(--ok)" />
        <CmpItem lbl="지출" cur={cur.expense} prev={prev.expense} color="var(--expense)" />
        <CmpItem
          lbl="순이익"
          cur={cur.profit}
          prev={prev.profit}
          color={cur.profit >= 0 ? 'var(--brand)' : 'var(--expense)'}
          signed
        />
      </div>
    </section>
  )
}

function CmpItem({
  lbl,
  cur,
  prev,
  color,
  signed,
}: {
  lbl: string
  cur: number
  prev: number
  color: string
  signed?: boolean
}) {
  const mx = Math.max(1, Math.abs(cur), Math.abs(prev))
  const cw = Math.round((Math.abs(cur) / mx) * 100)
  const pw = Math.round((Math.abs(prev) / mx) * 100)
  const sign = (v: number) => (signed && v >= 0 ? '+' : '')
  return (
    <div className="cmp-item">
      <div className="cmp-lbl">
        {lbl} <DeltaBadge d={delta(cur, prev)} />
      </div>
      <div className="cmp-row">
        <span className="cmp-tag cur">당기</span>
        <div className="cmp-track">
          <div className="cmp-fill" style={{ width: `${cw}%`, background: color }} />
        </div>
        <b className="tnum" style={{ color }}>
          {sign(cur)}
          {eok(cur)}
        </b>
      </div>
      <div className="cmp-row">
        <span className="cmp-tag prev">전년</span>
        <div className="cmp-track">
          <div className="cmp-fill" style={{ width: `${pw}%`, background: 'var(--line-2)' }} />
        </div>
        <b className="tnum" style={{ color: 'var(--muted)' }}>
          {sign(prev)}
          {eok(prev)}
        </b>
      </div>
    </div>
  )
}

function FundTable({
  allTx,
  loading,
  scope,
  s,
  year,
  month,
  drill,
  go,
  projName,
}: {
  allTx: AcctTx[]
  loading: boolean
  scope: AcctTx[]
  s: ReturnType<typeof sumTx>
  year: string
  month: string
  drill: Drill
  go: (d: Drill) => void
  projName: Record<string, string>
}) {
  // 행 집계 helper
  const sumFor = (extra: Partial<Drill>) =>
    sumTx(allTx.filter((t) => inPeriod(t, year, month, { ...drill, ...extra } as Drill)))

  const col0 =
    drill.level === 'company' ? '사업자' : drill.level === 'biz' ? '부서' : '일자 · 적요'

  // company: 사업자별 / biz: 부서별 / dept·project: 전표 리스트
  let bodyRows: JSX.Element[] = []
  if (drill.level === 'company') {
    bodyRows = Object.keys(ACCT_ORG).map((biz) => {
      const r = sumFor({ biz })
      return (
        <DrillRow key={biz} label={bizLabel(biz)} inc={r.income} exp={r.expense} onClick={() => go({ level: 'biz', biz })} />
      )
    })
  } else if (drill.level === 'biz') {
    const depts = ACCT_ORG[drill.biz!] ?? []
    bodyRows = depts.map((dept) => {
      const r = sumFor({ dept })
      return (
        <DrillRow key={dept} label={dept} inc={r.income} exp={r.expense} onClick={() => go({ level: 'dept', biz: drill.biz, dept })} />
      )
    })
  } else {
    // 전표 리스트 (날짜 desc)
    const list = [...scope].sort((a, b) => (a.date < b.date ? 1 : -1))
    bodyRows = list.map((t) => (
      <tr key={t.id}>
        <td>
          <b>{t.memo}</b>
          <div className="t-sub">
            {dateOnly(t.date)} · {t.account}
            {t.partner ? ` · ${t.partner}` : ''}
            {t.dept_key === 'art' && t.project_id ? (
              <span style={{ color: 'var(--brand-ink)' }}> · {projName[t.project_id] ?? ''}</span>
            ) : null}
          </div>
        </td>
        <td className="tnum" style={{ textAlign: 'right', color: 'var(--ok)' }}>
          {t.tx_type === '수입' ? eok(t.amount) : '—'}
        </td>
        <td className="tnum" style={{ textAlign: 'right', color: 'var(--expense)' }}>
          {t.tx_type === '지출' ? eok(t.amount) : '—'}
        </td>
        <td style={{ textAlign: 'right' }}>
          <span className={`chip ${t.src === '직접' ? '' : 'auto'}`}>{t.src}</span>
        </td>
      </tr>
    ))
  }

  return (
    <div className="tbl-wrap">
      <table>
        <thead>
          <tr>
            <th>{col0}</th>
            <th style={{ textAlign: 'right' }}>수입</th>
            <th style={{ textAlign: 'right' }}>지출</th>
            <th style={{ textAlign: 'right' }}>{drill.level === 'company' || drill.level === 'biz' ? '순이익' : '출처'}</th>
          </tr>
        </thead>
        <tbody>
          {loading && <LoadingRow cols={4} />}
          {!loading && bodyRows}
          {!loading && bodyRows.length === 0 && <EmptyRow cols={4} text="전표가 없습니다." />}
        </tbody>
        <tfoot>
          <tr style={{ background: 'var(--brand-soft)', fontWeight: 800 }}>
            <td>합계</td>
            <td className="tnum" style={{ textAlign: 'right', color: 'var(--ok)' }}>
              {eok(s.income)}
            </td>
            <td className="tnum" style={{ textAlign: 'right', color: 'var(--expense)' }}>
              {eok(s.expense)}
            </td>
            <td className="tnum" style={{ textAlign: 'right', color: s.profit >= 0 ? 'var(--brand)' : 'var(--expense)' }}>
              {(drill.level === 'company' || drill.level === 'biz') ? (s.profit >= 0 ? '+' : '') + eok(s.profit) : ''}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

function DrillRow({ label, inc, exp, onClick }: { label: string; inc: number; exp: number; onClick: () => void }) {
  const profit = inc - exp
  return (
    <tr className="fund-drill" style={{ cursor: 'pointer' }} onClick={onClick}>
      <td>
        <b>{label}</b>
      </td>
      <td className="tnum" style={{ textAlign: 'right', color: 'var(--ok)' }}>
        {eok(inc)}
      </td>
      <td className="tnum" style={{ textAlign: 'right', color: 'var(--expense)' }}>
        {eok(exp)}
      </td>
      <td className="tnum" style={{ textAlign: 'right', color: profit >= 0 ? 'var(--brand)' : 'var(--expense)' }}>
        {(profit >= 0 ? '+' : '') + eok(profit)}
      </td>
    </tr>
  )
}

// ========================= 전표내역 =========================
function LedgerView({
  allTx,
  loading,
  projName,
}: {
  allTx: AcctTx[]
  loading: boolean
  projName: Record<string, string>
}) {
  const [biz, setBiz] = useState('all')
  const [type, setType] = useState('all')
  const list = allTx
    .filter((t) => (biz === 'all' || t.biz_code === biz) && (type === 'all' || t.tx_type === type))
    .sort((a, b) => (a.date < b.date ? 1 : -1))
  let tInc = 0,
    tExp = 0
  for (const t of list) {
    const amt = Number(t.amount) || 0
    t.tx_type === '수입' ? (tInc += amt) : (tExp += amt)
  }

  return (
    <section className="panel">
      <div className="panel-h">
        <div>
          <h2>
            전표 내역 <span className="count">{loading ? '…' : list.length}</span>
          </h2>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <select className="sel" value={biz} onChange={(e) => setBiz(e.target.value)}>
            <option value="all">전체 사업자</option>
            <option value="법인">법인</option>
            <option value="개인">개인</option>
            <option value="더북촌">더북촌</option>
          </select>
          <select className="sel" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="all">전체</option>
            <option value="수입">수입</option>
            <option value="지출">지출</option>
          </select>
        </div>
      </div>
      <div className="tbl-wrap">
        <table>
          <thead>
            <tr>
              <th>일자</th>
              <th>사업자·부서</th>
              <th>구분</th>
              <th>계정</th>
              <th>거래처</th>
              <th>적요</th>
              <th style={{ textAlign: 'right' }}>금액</th>
              <th>출처</th>
            </tr>
          </thead>
          <tbody>
            {loading && <LoadingRow cols={8} />}
            {!loading &&
              list.map((t) => (
                <tr key={t.id}>
                  <td className="tnum" style={{ color: 'var(--muted)' }}>
                    {dateOnly(t.date)}
                  </td>
                  <td>
                    <span className="chip inc" style={{ fontSize: 10 }}>
                      {t.biz_code} · {t.dept_key}
                    </span>
                  </td>
                  <td>
                    <span className={`chip ${t.tx_type === '수입' ? 'inc' : 'exp'}`}>{t.tx_type}</span>
                  </td>
                  <td>{t.account}</td>
                  <td className="t-sub">{t.partner || '—'}</td>
                  <td>
                    {t.memo}
                    {t.project_id && (
                      <div className="t-sub" style={{ color: 'var(--brand-ink)' }}>
                        {projName[t.project_id] ?? ''}
                      </div>
                    )}
                  </td>
                  <td className="tnum" style={{ textAlign: 'right', color: t.tx_type === '수입' ? 'var(--ok)' : 'var(--expense)' }}>
                    {eok(t.amount)}
                  </td>
                  <td>
                    <span className={`chip ${t.src === '직접' ? '' : 'auto'}`}>{t.src}</span>
                  </td>
                </tr>
              ))}
            {!loading && list.length === 0 && <EmptyRow cols={8} text="전표가 없습니다." />}
          </tbody>
          <tfoot>
            <tr style={{ background: 'var(--brand-soft)', fontWeight: 800 }}>
              <td colSpan={6}>합계</td>
              <td className="tnum" style={{ textAlign: 'right' }}>
                수입 {eok(tInc)} / 지출 {eok(tExp)}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  )
}
