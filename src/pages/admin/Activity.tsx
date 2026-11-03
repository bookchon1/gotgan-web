import { useMemo } from 'react'
import { PageHead } from '../../components/PageHead'
import { ErrorBanner, LoadingRow, EmptyRow } from '../../components/States'
import { supabase } from '../../lib/supabase'
import { useQuery } from '../../lib/useQuery'
import type { Employee } from '../../types/db'

interface AuditRow {
  id: number
  actor_id: string | null
  action: string
  target: string | null
  at: string
}

// action 종류별 아이콘/색
function marker(action: string): { ch: string; bg: string } {
  if (action.includes('승인') || action.includes('완료')) return { ch: '✓', bg: 'var(--brand-soft)' }
  if (action.includes('등록') || action.includes('생성') || action.includes('추가'))
    return { ch: '+', bg: 'var(--info-soft)' }
  if (action.includes('수정') || action.includes('변경')) return { ch: '✎', bg: 'var(--gold-soft)' }
  if (action.includes('삭제') || action.includes('반려')) return { ch: '✕', bg: 'var(--danger-soft)' }
  return { ch: '·', bg: 'var(--line-2)' }
}

function fmt(at: string): string {
  const d = new Date(at)
  if (isNaN(+d)) return at
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export default function Activity() {
  const logQ = useQuery<AuditRow[]>(
    async () => await supabase.from('audit_log').select('*').order('at', { ascending: false }).limit(50),
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

  const rows = logQ.data ?? []

  return (
    <div className="page on">
      <PageHead
        eyebrow="WORKSPACE HISTORY"
        title="활동 기록"
        desc="업무 공간에서 일어난 변경 사항을 확인하세요."
      />
      <section className="panel">
        <ErrorBanner error={logQ.error} table="audit_log" />
        <div className="tbl-wrap">
          <table>
            <tbody>
              {logQ.loading && <LoadingRow cols={2} />}
              {!logQ.loading &&
                rows.map((r) => {
                  const mk = marker(r.action)
                  return (
                    <tr key={r.id}>
                      <td style={{ width: 40 }}>
                        <span className="av-s" style={{ borderRadius: 8, background: mk.bg }}>
                          {mk.ch}
                        </span>
                      </td>
                      <td>
                        <div className="t-title">
                          {r.action}
                          {r.target ? ` — ${r.target}` : ''}
                        </div>
                        <div className="t-sub">
                          {r.actor_id ? empName[r.actor_id] ?? '—' : '시스템'} · {fmt(r.at)}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              {!logQ.loading && rows.length === 0 && !logQ.error && (
                <EmptyRow cols={2} text="활동 기록이 없습니다." />
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
