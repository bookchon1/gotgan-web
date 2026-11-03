import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHead } from '../../components/PageHead'
import { ErrorBanner, LoadingRow, EmptyRow } from '../../components/States'
import { supabase } from '../../lib/supabase'
import { useQuery } from '../../lib/useQuery'
import type { ArtProject, BudgetReceipt, ArtStatus } from '../../types/db'

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

  const projects = useQuery<ArtProject[]>(
    async () =>
      await supabase
        .from('art_projects')
        .select(
          'id,name,client,biz_code,proj_type,kind,status,progress,now_text,est_amount,owner_id,contract_base,due_date,done_date,year',
        )
        .order('year', { ascending: false })
        .order('due_date', { ascending: true }),
    [],
  )
  const receipts = useQuery<Pick<BudgetReceipt, 'project_id' | 'amount'>[]>(
    async () => await supabase.from('budget_receipts').select('project_id,amount'),
    [],
  )

  // project_id → 수금 합계
  const receivedMap = useMemo(() => {
    const m: Record<string, number> = {}
    for (const r of receipts.data ?? []) m[r.project_id] = (m[r.project_id] || 0) + r.amount
    return m
  }, [receipts.data])

  const all = projects.data ?? []
  const list = all.filter((p) => showDone || isCurrent(p))
  const hiddenDone = all.filter((p) => !isCurrent(p)).length

  let tCon = 0,
    tRec = 0
  for (const p of list) {
    tCon += p.contract_base || 0
    tRec += receivedMap[p.id] || 0
  }

  return (
    <div className="page on">
      <PageHead
        eyebrow="미술 · 사업"
        title="사업관리"
        desc="진행 중이거나 당해연도 사업을 확인하세요. 행을 클릭하면 상세로 이동합니다."
        actions={
          (hiddenDone > 0 || showDone) && (
            <button
              className={`btn ${showDone ? 'pri' : 'sec'}`}
              onClick={() => setShowDone((v) => !v)}
            >
              {showDone ? '진행 사업만 보기' : `완료 사업 보기 (${hiddenDone})`}
            </button>
          )
        }
      />

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
                <th>사업명</th>
                <th>유형</th>
                <th>상태</th>
                <th>진행률</th>
                <th style={{ textAlign: 'right' }}>계약금</th>
                <th style={{ textAlign: 'right' }}>수금</th>
                <th style={{ textAlign: 'right' }}>미수금</th>
                <th style={{ textAlign: 'center' }}>준공</th>
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
      </section>
    </div>
  )
}
