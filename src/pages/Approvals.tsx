import { useMemo, useState } from 'react'
import { PageHead } from '../components/PageHead'
import { Icon } from '../components/Icon'
import { ErrorBanner, LoadingRow, EmptyRow } from '../components/States'
import { supabase } from '../lib/supabase'
import { useQuery } from '../lib/useQuery'
import { eok, won } from '../lib/format'
import { useAuth } from '../lib/auth'
import type { Approval, ApprovalLine, Employee, Payslip, PayrollRun } from '../types/db'
import { ApprovalDraftModal } from './ApprovalDraftModal'

const KIND_BADGE: Record<string, { cls: string; label: string }> = {
  지출결의서: { cls: 'badge gold', label: '지출결의' },
  품의: { cls: 'badge blue', label: '품의서' },
  휴가: { cls: 'badge', label: '휴가신청' },
  일반: { cls: 'badge', label: '일반' },
}

type Folder = 'pending' | 'received' | 'drafted' | 'done'

export default function Approvals() {
  const { me } = useAuth()
  const [folder, setFolder] = useState<Folder>('pending')

  const apprQ = useQuery<Approval[]>(
    async () => await supabase.from('approvals').select('*').order('req_date', { ascending: false }),
    [],
  )
  const linesQ = useQuery<ApprovalLine[]>(
    async () => await supabase.from('approval_lines').select('*').order('seq', { ascending: true }),
    [],
  )
  const empQ = useQuery<Pick<Employee, 'id' | 'name'>[]>(
    async () => await supabase.from('employees').select('id,name'),
    [],
  )
  // 수신 문서함: 나에게 수신된 급여명세서 (본인 것만 — RLS 로 보장)
  const mySlipsQ = useQuery<Payslip[]>(
    async () =>
      me?.id
        ? await supabase.from('payslips').select('*').eq('employee_id', me.id)
        : { data: [], error: null },
    [me?.id],
  )
  const runsQ = useQuery<PayrollRun[]>(
    async () => await supabase.from('payroll_runs').select('*'),
    [],
  )
  const runYm = useMemo(
    () => Object.fromEntries((runsQ.data ?? []).map((r) => [r.id, r.ym])),
    [runsQ.data],
  )
  const mySlips = useMemo(() => {
    const s = [...(mySlipsQ.data ?? [])]
    s.sort((a, b) => (runYm[b.run_id] ?? '').localeCompare(runYm[a.run_id] ?? ''))
    return s
  }, [mySlipsQ.data, runYm])

  const empName = useMemo(() => {
    const m: Record<string, string> = {}
    for (const e of empQ.data ?? []) m[e.id] = e.name
    return m
  }, [empQ.data])

  const linesByAppr = useMemo(() => {
    const m: Record<string, ApprovalLine[]> = {}
    for (const l of linesQ.data ?? []) (m[l.approval_id] ??= []).push(l)
    return m
  }, [linesQ.data])

  const all = apprQ.data ?? []

  // 폴더별 필터
  const myId = me?.id
  const pending = all.filter((a) => {
    const lines = linesByAppr[a.id] ?? []
    // 내 차례 = 내게 아직 대기인 결재선이 있고, 그 앞 단계가 모두 승인됨 (반려/회계접수완료 제외)
    if (a.status === '반려' || a.status === '회계접수') return false
    const sorted = lines.slice().sort((x, y) => x.seq - y.seq)
    const myIdx = sorted.findIndex((l) => l.approver_id === myId && l.decided === '대기')
    if (myIdx < 0) return false
    return sorted.slice(0, myIdx).every((l) => l.decided === '승인')
  })
  const drafted = all.filter((a) => a.drafter_id === myId)
  const done = all.filter((a) => a.status === '회계접수' || (a.status === '승인' && a.kind !== '지출결의서'))

  const list = folder === 'pending' ? pending : folder === 'drafted' ? drafted : done
  const title =
    folder === 'pending'
      ? '내 결재 대기'
      : folder === 'received'
        ? '수신 문서함'
        : folder === 'drafted'
          ? '상신한 문서'
          : '완료 문서'

  const loading = apprQ.loading || linesQ.loading
  const [busy, setBusy] = useState(false)
  const [draftOpen, setDraftOpen] = useState(false)

  const reload = () => {
    apprQ.reload()
    linesQ.reload()
  }

  // 승인/반려 처리
  async function decide(a: Approval, decision: '승인' | '반려') {
    const lines = (linesByAppr[a.id] ?? []).slice().sort((x, y) => x.seq - y.seq)
    const myLine = lines.find((l) => l.approver_id === myId && l.decided === '대기')
    if (!myLine) return
    setBusy(true)
    // 내 단계 처리
    await supabase
      .from('approval_lines')
      .update({ decided: decision, decided_at: new Date().toISOString() })
      .eq('id', myLine.id)

    if (decision === '반려') {
      await supabase.from('approvals').update({ status: '반려' }).eq('id', a.id)
    } else {
      // 승인: 남은 승인 단계(회계접수 제외)가 있나?
      const remainApproval = lines.some(
        (l) => l.id !== myLine.id && l.role === '승인' && l.decided === '대기',
      )
      const isAcctStep = myLine.role === '회계접수'
      let newStatus: Approval['status'] = a.status
      if (isAcctStep) {
        newStatus = '회계접수'
      } else if (!remainApproval) {
        // 승인 단계 모두 끝 → 회계접수 단계가 있으면 '승인'(회계접수 대기), 없으면 '승인'
        newStatus = '승인'
      } else {
        newStatus = '진행'
      }
      await supabase.from('approvals').update({ status: newStatus }).eq('id', a.id)

      // 지출결의서가 최종 승인되면 회계 전표 생성 (회계접수 단계에서)
      if (isAcctStep && a.kind === '지출결의서' && a.amount) {
        await supabase.from('acct_tx').insert({
          date: new Date().toISOString().slice(0, 10),
          biz_code: a.biz_code ?? '법인',
          dept_key: a.dept_key,
          tx_type: '지출',
          account: a.account,
          amount: a.amount,
          memo: a.title ?? a.memo,
          project_id: a.project_id,
          budget_item: a.budget_item,
          src: '결의서',
          year: new Date().getFullYear(),
        })
      }
    }
    setBusy(false)
    reload()
  }

  return (
    <div className="page on">
      <PageHead
        eyebrow="DECISIONS, CONNECTED"
        title="전자결재"
        desc="기안을 작성하고, 결재선에 따라 승인과 반려를 처리하세요."
        actions={
          <button className="btn pri" onClick={() => setDraftOpen(true)}>
            <Icon name="approval" className="icon ic" /> 기안 작성
          </button>
        }
      />

      <div className="folders">
        <Fold k="pending" cur={folder} set={setFolder} icon="doc" title="내 결재 대기" n={pending.length} />
        <Fold k="received" cur={folder} set={setFolder} icon="approval" title="수신 문서함" n={mySlips.length} />
        <Fold k="drafted" cur={folder} set={setFolder} icon="clock" title="상신한 문서" n={drafted.length} />
        <Fold k="done" cur={folder} set={setFolder} icon="check" title="완료 문서" n={done.length} />
      </div>

      {folder === 'received' ? (
        <ReceivedBox
          slips={mySlips}
          runYm={runYm}
          loading={mySlipsQ.loading || runsQ.loading}
          error={mySlipsQ.error}
          meName={me?.name ?? ''}
        />
      ) : (
      <section className="panel">
        <ErrorBanner error={apprQ.error} table="approvals" />
        <div className="panel-h">
          <div>
            <h2>
              {title} <span className="count">{loading ? '…' : list.length}</span>
            </h2>
          </div>
        </div>
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>문서</th>
                <th>기안자</th>
                <th>종류</th>
                <th>결재 진행</th>
                <th style={{ textAlign: 'right' }}>금액</th>
                {folder === 'pending' && <th style={{ textAlign: 'right' }}>처리</th>}
              </tr>
            </thead>
            <tbody>
              {loading && <LoadingRow cols={folder === 'pending' ? 6 : 5} />}
              {!loading &&
                list.map((a) => {
                  const kb = KIND_BADGE[a.kind] ?? KIND_BADGE['일반']
                  const lines = linesByAppr[a.id] ?? []
                  return (
                    <tr key={a.id}>
                      <td>
                        <div className="t-title">{a.title || a.memo}</div>
                        <div className="t-sub">{a.doc_no}</div>
                      </td>
                      <td>{a.drafter_id ? empName[a.drafter_id] ?? '—' : '—'}</td>
                      <td>
                        <span className={kb.cls}>{kb.label}</span>
                      </td>
                      <td>
                        <ApprFlow lines={lines} />
                      </td>
                      <td className="tnum" style={{ textAlign: 'right' }}>
                        {a.amount ? eok(a.amount) : '—'}
                      </td>
                      {folder === 'pending' && (
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <button
                            className="btn pri"
                            style={{ padding: '5px 11px', fontSize: 11.5 }}
                            onClick={() => decide(a, '승인')}
                            disabled={busy}
                          >
                            승인
                          </button>
                          <button
                            className="btn sec"
                            style={{ padding: '5px 11px', fontSize: 11.5, marginLeft: 5 }}
                            onClick={() => decide(a, '반려')}
                            disabled={busy}
                          >
                            반려
                          </button>
                        </td>
                      )}
                    </tr>
                  )
                })}
              {!loading && list.length === 0 && (
                <EmptyRow cols={folder === 'pending' ? 6 : 5} text={folder === 'pending' ? '결재할 문서가 없습니다.' : '문서가 없습니다.'} />
              )}
            </tbody>
          </table>
        </div>
      </section>
      )}

      {draftOpen && (
        <ApprovalDraftModal
          onClose={() => setDraftOpen(false)}
          onCreated={() => {
            setDraftOpen(false)
            reload()
          }}
        />
      )}
    </div>
  )
}

function Fold({
  k,
  cur,
  set,
  icon,
  title,
  n,
}: {
  k: Folder
  cur: Folder
  set: (f: Folder) => void
  icon: string
  title: string
  n: number
}) {
  return (
    <button className={`folder${cur === k ? ' on' : ''}`} onClick={() => set(k)}>
      <span className="fi">
        <Icon name={icon} size={20} />
      </span>
      <div>
        <strong>{title}</strong>
        <small>{n}건</small>
      </div>
    </button>
  )
}

// 결재선 진행 표시 (시안 appr-flow)
function ApprFlow({ lines }: { lines: ApprovalLine[] }) {
  if (lines.length === 0) return <span className="t-sub">—</span>
  return (
    <div className="appr-flow">
      {lines.map((l, i) => {
        const cls = l.decided === '승인' ? 'done' : l.decided === '반려' ? 'rej' : isCurrent(lines, i) ? 'cur' : ''
        return (
          <span key={l.id} style={{ display: 'inline-flex', alignItems: 'center' }}>
            {i > 0 && <span className="bar" />}
            <div className={`step ${cls}`}>
              <span className="node">
                {l.decided === '승인' ? (
                  <svg className="icon" width="11" height="11" viewBox="0 0 24 24">
                    <path d="M5 12l4 4 10-10" />
                  </svg>
                ) : (
                  i + 1
                )}
              </span>
            </div>
          </span>
        )
      })}
    </div>
  )
}

// 현재 차례 = 앞 단계 모두 승인, 본인은 대기인 첫 단계
function isCurrent(lines: ApprovalLine[], i: number): boolean {
  if (lines[i].decided !== '대기') return false
  return lines.slice(0, i).every((l) => l.decided === '승인')
}

// ===================== 수신 문서함 (급여명세서) =====================
function ReceivedBox({
  slips,
  runYm,
  loading,
  error,
  meName,
}: {
  slips: Payslip[]
  runYm: Record<string, string>
  loading: boolean
  error: string | null
  meName: string
}) {
  const [view, setView] = useState<Payslip | null>(null)
  return (
    <section className="panel">
      <ErrorBanner error={error} table="payslips" />
      <div className="panel-h">
        <div>
          <h2>
            수신 문서함 <span className="count">{loading ? '…' : slips.length}</span>
          </h2>
          <p>
            결재 대상은 아니지만 나에게 전달된 문서입니다. <b>각자 본인에게 수신된 문서만 표시됩니다.</b>
          </p>
        </div>
      </div>
      <div className="tbl-wrap">
        <table>
          <thead>
            <tr>
              <th>문서</th>
              <th>종류</th>
              <th>귀속월</th>
              <th style={{ textAlign: 'right' }}>실지급액</th>
              <th style={{ textAlign: 'right' }}>열람</th>
            </tr>
          </thead>
          <tbody>
            {loading && <LoadingRow cols={5} />}
            {!loading &&
              slips.map((s) => {
                const ym = runYm[s.run_id] ?? ''
                return (
                  <tr key={s.id} style={{ cursor: 'pointer' }} onClick={() => setView(s)}>
                    <td>
                      <div className="t-title">{ym} 급여명세서</div>
                      <div className="t-sub">본인만 열람 가능</div>
                    </td>
                    <td>
                      <span className="badge gold">급여명세서</span>
                    </td>
                    <td className="tnum" style={{ color: 'var(--muted)' }}>
                      {ym}
                    </td>
                    <td className="tnum" style={{ textAlign: 'right', fontWeight: 700 }}>
                      {won(s.net_pay)}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        className="btn sec"
                        style={{ padding: '6px 13px' }}
                        onClick={(e) => {
                          e.stopPropagation()
                          setView(s)
                        }}
                      >
                        열람
                      </button>
                    </td>
                  </tr>
                )
              })}
            {!loading && slips.length === 0 && !error && (
              <EmptyRow cols={5} text="수신된 문서가 없습니다." />
            )}
          </tbody>
        </table>
      </div>
      <div className="table-foot">
        <span>급여명세서는 노무 담당자가 각 직원에게 수신 처리하며, 받는 사람만 목록에 보이고 열람할 수 있습니다.</span>
      </div>

      {view && <PayslipModal slip={view} ym={runYm[view.run_id] ?? ''} name={meName} onClose={() => setView(null)} />}
    </section>
  )
}

function PayslipModal({
  slip,
  ym,
  name,
  onClose,
}: {
  slip: Payslip
  ym: string
  name: string
  onClose: () => void
}) {
  const gross = (Number(slip.base_pay) || 0) + (Number(slip.allowances) || 0)
  const dedRows: [string, number][] = [
    ['국민연금', slip.d_pension],
    ['건강보험', slip.d_health],
    ['장기요양', slip.d_ltc],
    ['고용보험', slip.d_employment],
    ['소득세', slip.d_income_tax],
    ['지방소득세', slip.d_local_tax],
    ['기타공제', slip.d_other],
  ]
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
        <div className="mh">
          <div>
            <div className="eyebrow">급여명세서</div>
            <h3>
              {ym} · {name}
            </h3>
          </div>
          <button className="x" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="mb">
          <div className="bud-h">
            <div className="t">지급</div>
          </div>
          <PayRow label="기본급" value={slip.base_pay} />
          <PayRow label="수당" value={slip.allowances} />
          <PayRow label="지급 합계" value={gross} strong />

          <div className="bud-h" style={{ marginTop: 12 }}>
            <div className="t">공제</div>
          </div>
          {dedRows.map(([k, v]) => (
            <PayRow key={k} label={k} value={v} expense />
          ))}
          <PayRow label="공제 합계" value={slip.deductions} strong expense />

          <div
            style={{
              marginTop: 14,
              padding: '12px 14px',
              borderRadius: 10,
              background: 'var(--brand-soft)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <b style={{ fontSize: 13 }}>실지급액</b>
            <b className="tnum" style={{ fontSize: 18, color: 'var(--brand)' }}>
              {won(slip.net_pay)}원
            </b>
          </div>
        </div>
        <div className="mf">
          <button className="btn pri" onClick={onClose}>
            확인
          </button>
        </div>
      </div>
    </div>
  )
}

function PayRow({
  label,
  value,
  strong,
  expense,
}: {
  label: string
  value: number
  strong?: boolean
  expense?: boolean
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        padding: '6px 2px',
        fontSize: 13,
        fontWeight: strong ? 800 : 500,
        borderTop: strong ? '1px solid var(--line-2)' : undefined,
      }}
    >
      <span style={{ color: strong ? 'var(--ink)' : 'var(--muted)' }}>{label}</span>
      <span className="tnum" style={{ color: expense ? 'var(--expense)' : 'var(--ink)' }}>
        {expense && value ? '−' : ''}
        {won(value)}
      </span>
    </div>
  )
}
