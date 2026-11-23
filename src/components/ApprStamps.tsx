import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export interface Stamp {
  role: string
  name: string
  title?: string | null
  /** 승인·반려·기안 등 도장에 찍히는 글자 (대기는 비움) */
  state?: string
  /** MM/DD */
  date?: string
}

/** 공문서식 결재란 — 기안·검토·합의·승인 칸에 직위·성명·처리 상태·일자를 표시 */
export function ApprStamps({ items }: { items: Stamp[] }) {
  return (
    <div className="stp">
      {items.map((s, i) => (
        <div className="stp-c" key={i}>
          <div className="stp-r">{s.role}</div>
          <div className="stp-t">{s.title || ' '}</div>
          <div className="stp-n">
            <b>{s.name || '\u00a0'}</b>
            {s.state && <span className={s.state === '반려' ? 'rej' : ''}>{s.state}</span>}
          </div>
          <div className="stp-d">{s.date || ' '}</div>
        </div>
      ))}
    </div>
  )
}

/** 직원 id → 직위 */
export function useTitles(ids: (string | null | undefined)[]): Record<string, string> {
  const key = [...new Set(ids.filter(Boolean) as string[])].sort().join(',')
  const [map, setMap] = useState<Record<string, string>>({})
  useEffect(() => {
    if (!key) return
    supabase
      .from('employees')
      .select('id,title')
      .in('id', key.split(','))
      .then(({ data }) => setMap(Object.fromEntries((data ?? []).map((e) => [e.id as string, (e.title as string | null) ?? '']))))
  }, [key])
  return map
}

import type { ApprovalLine } from '../types/db'
const dateOf = (d?: string | null) => (d ? d.slice(5, 10).replace('-', '/') : '')

/** 결재선(참조 제외)을 결재란 칸 목록으로 변환 */
export function buildStamps(lines: ApprovalLine[], empName: Record<string, string>, titles: Record<string, string>, draftDate?: string | null): Stamp[] {
  return lines
    .filter((l) => l.role !== '참조')
    .slice()
    .sort((a, b) => a.seq - b.seq)
    .map((l) => ({
      role: l.role === '회계접수' ? '회계' : l.role,
      name: l.approver_id ? empName[l.approver_id] ?? '' : l.role === '회계접수' ? '회계' : '',
      title: l.approver_id ? titles[l.approver_id] ?? '' : '',
      state: l.role === '기안' ? '기안' : l.decided === '승인' ? '승인' : l.decided === '반려' ? '반려' : '',
      date: l.role === '기안' ? dateOf(l.decided_at) || dateOf(draftDate) : dateOf(l.decided_at),
    }))
}
