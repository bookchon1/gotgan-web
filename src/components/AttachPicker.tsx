import { useRef } from 'react'
import { supabase } from '../lib/supabase'

const MAX = 20 * 1024 * 1024
const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`)

/** 첨부파일 선택 (상신 시 함께 업로드). 파일당 20MB까지 */
export function AttachPicker({ files, onChange, className = 'mfield' }: { files: File[]; onChange: (f: File[]) => void; className?: string }) {
  const ref = useRef<HTMLInputElement>(null)
  const add = (list: FileList | null) => {
    if (!list) return
    const next = [...files]
    for (const f of Array.from(list)) {
      if (f.size > MAX) { alert(`${f.name}: 20MB를 넘어 첨부할 수 없습니다.`); continue }
      if (!next.some((x) => x.name === f.name && x.size === f.size)) next.push(f)
    }
    onChange(next)
    if (ref.current) ref.current.value = ''
  }
  return (
    <div className={className}>
      <label>첨부파일</label>
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center' }}>
        <input ref={ref} type="file" multiple hidden onChange={(e) => add(e.target.files)} />
        <button type="button" className="btn" onClick={() => ref.current?.click()}>파일 선택</button>
        {files.map((f, i) => (
          <span key={i} className="badge" style={{ cursor: 'pointer' }} title="누르면 제외" onClick={() => onChange(files.filter((_, j) => j !== i))}>
            {f.name} ({kb(f.size)}) ✕
          </span>
        ))}
        {!files.length && <span style={{ color: 'var(--ink-3)', fontSize: 12 }}>견적서·영수증 등 (파일당 20MB)</span>}
      </div>
    </div>
  )
}

/** 상신 직후 호출 — 실패해도 상신 자체는 유지하고 실패 파일 이름만 돌려준다 */
export async function uploadAttachments(approvalId: string, files: File[], meId: string | null): Promise<string[]> {
  const failed: string[] = []
  for (const f of files) {
    const safe = f.name.replace(/[^\w.\-가-힣]/g, '_')
    const path = `${approvalId}/${Date.now()}_${safe}`
    const { error } = await supabase.storage.from('approval-files').upload(path, f, { upsert: false })
    if (error) { failed.push(f.name); continue }
    const { error: e2 } = await supabase.from('approval_files').insert({ approval_id: approvalId, name: f.name, path, size: f.size, uploaded_by: meId })
    if (e2) { await supabase.storage.from('approval-files').remove([path]); failed.push(f.name) }
  }
  return failed
}
