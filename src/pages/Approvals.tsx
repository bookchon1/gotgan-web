import { useMemo, useState } from 'react'
import { PageHead } from '../components/PageHead'
import { Icon } from '../components/Icon'
import { ErrorBanner, LoadingRow, EmptyRow } from '../components/States'
import { supabase } from '../lib/supabase'
import { useQuery } from '../lib/useQuery'
import { eok } from '../lib/format'
import { useAuth } from '../lib/auth'
import type { Approval, ApprovalLine, Employee } from '../types/db'

const KIND_BADGE: Record<string, { cls: string; label: string }> = {
  지출결의서: { cls: 'badge gold', label: '지출결의' },
  품의: { cls: 'badge blue', label: '품의서' },
  휴가: { cls: 'badge', label: '휴가신청' },
  일반: { cls: 'badge', label: '일반' },
}

type Folder = 'pending' | 'drafted' | 'done'

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
    // 내 차례 = 내가 승인자이고 아직 대기인 단계
    return lines.some((l) => l.approver_id === myId && l.decided === '대기') && a.status !== '승인' && a.status !== '반려'
  })
  const drafted = all.filter((a) => a.drafter_id === myId)
  const done = all.filter((a) => a.status === '승인' || a.status === '회계접수')

  const list = folder === 'pending' ? pending : folder === 'drafted' ? drafted : done
  const title = folder === 'pending' ? '내 결재 대기' : folder === 'drafted' ? '상신한 문서' : '완료 문서'

  const loading = apprQ.loading || linesQ.loading

  return (
    <div className="page on">
      <PageHead
        eyebrow="DECISIONS, CONNECTED"
        title="전자결재"
        desc="기안을 작성하고, 결재선에 따라 승인과 반려를 처리하세요."
        actions={
          <button className="btn pri">
            <Icon name="approval" className="icon ic" /> 기안 작성
          </button>
        }
      />

      <div className="folders">
        <Fold k="pending" cur={folder} set={setFolder} icon="doc" title="내 결재 대기" n={pending.length} />
        <Fold k="drafted" cur={folder} set={setFolder} icon="clock" title="상신한 문서" n={drafted.length} />
        <Fold k="done" cur={folder} set={setFolder} icon="check" title="완료 문서" n={done.length} />
      </div>

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
              </tr>
            </thead>
            <tbody>
              {loading && <LoadingRow cols={5} />}
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
                    </tr>
                  )
                })}
              {!loading && list.length === 0 && (
                <EmptyRow cols={5} text={folder === 'pending' ? '결재할 문서가 없습니다.' : '문서가 없습니다.'} />
              )}
            </tbody>
          </table>
        </div>
      </section>
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
