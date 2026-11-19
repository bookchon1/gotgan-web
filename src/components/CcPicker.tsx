import { useEffect, useState } from 'react'
import { approverLabel, sortApprovers } from '../lib/format'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'

interface Emp { id: string; name: string; title: string | null }

/** 참조자 선택 — 결재에는 참여하지 않고 문서를 열람만 하는 사람 (여러 명) */
export function CcPicker({ value, onChange, className = 'mfield', compact = false }: { value: string[]; onChange: (ids: string[]) => void; className?: string; compact?: boolean }) {
  const { me } = useAuth()
  const [emps, setEmps] = useState<Emp[]>([])
  useEffect(() => {
    supabase
      .from('employees')
      .select('id,name,title')
      .eq('status', '재직')
      .order('name', { ascending: true })
      .then(({ data }) => setEmps(sortApprovers(((data ?? []) as Emp[]).filter((e) => e.id !== me?.id))))
  }, [me?.id])
  const byId = Object.fromEntries(emps.map((e) => [e.id, e]))
  return (
    <div className={className}>
      {compact ? <span>참조 (선택)</span> : <label>참조</label>}
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center' }}>
        <select
          className="ctl"
          style={compact ? { width: '100%' } : { width: 160, flex: 'none' }}
          value=""
          onChange={(e) => {
            if (e.target.value && !value.includes(e.target.value)) onChange([...value, e.target.value])
          }}
        >
          <option value="">참조</option>
          {emps.filter((e) => !value.includes(e.id)).map((e) => (
            <option key={e.id} value={e.id}>{approverLabel(e)}</option>
          ))}
        </select>
        {value.map((id) => (
          <span key={id} className="badge" style={{ cursor: 'pointer' }} onClick={() => onChange(value.filter((x) => x !== id))} title="누르면 제외">
            참조 {byId[id]?.name ?? ''} ✕
          </span>
        ))}
      </div>
    </div>
  )
}

/** 참조 결재선 행 — 열람 전용이라 처리 상태는 '승인'으로 두어 결재 대기 목록에 뜨지 않게 한다 */
export function ccLines(approvalId: string, startSeq: number, ids: string[]) {
  return ids.map((id, i) => ({ approval_id: approvalId, seq: startSeq + i, approver_id: id, role: '참조' as const, decided: '승인' as const, decided_at: null as string | null }))
}
