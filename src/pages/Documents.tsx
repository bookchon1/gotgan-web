import { useMemo, useState } from 'react'
import { PageHead } from '../components/PageHead'
import { ErrorBanner, LoadingRow, EmptyRow } from '../components/States'
import { supabase } from '../lib/supabase'
import { useQuery } from '../lib/useQuery'
import { mmdd } from '../lib/format'
import { useAuth } from '../lib/auth'
import type { GotganDocument, Employee, DocumentFolder } from '../types/db'

const SCOPE_BADGE: Record<string, string> = {
  전사: 'badge green',
  선택: 'badge blue',
  개인: 'badge',
}
const BUCKET = 'documents'

function fmtSize(n: number | null): string {
  if (!n) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

export default function Documents() {
  const { me } = useAuth()
  const [q, setQ] = useState('')
  const [editDoc, setEditDoc] = useState<GotganDocument | 'new' | null>(null)
  const [detail, setDetail] = useState<GotganDocument | null>(null)
  const [folderId, setFolderId] = useState<string | 'all' | 'none'>('all') // 사용자 폴더 필터
  const isAdmin = me?.role === 'admin'

  const docQ = useQuery<GotganDocument[]>(
    async () => await supabase.from('documents').select('*').order('created_at', { ascending: false }),
    [],
  )
  const folderQ = useQuery<DocumentFolder[]>(
    async () => await supabase.from('document_folders').select('*').order('sort').order('name'),
    [],
  )
  const folders = folderQ.data ?? []

  async function addFolder() {
    const name = window.prompt('새 폴더 이름')?.trim()
    if (!name) return
    const sort = folders.length ? Math.max(...folders.map((f) => f.sort)) + 1 : 0
    const { error } = await supabase.from('document_folders').insert({ name, sort, created_by: me?.id ?? null })
    if (error) { alert(error.message); return }
    folderQ.reload()
  }
  async function renameFolder(f: DocumentFolder) {
    const name = window.prompt('폴더 이름 변경', f.name)?.trim()
    if (!name || name === f.name) return
    const { error } = await supabase.from('document_folders').update({ name }).eq('id', f.id)
    if (error) { alert(error.message); return }
    folderQ.reload()
  }
  async function removeFolder(f: DocumentFolder) {
    if (!window.confirm(`'${f.name}' 폴더를 삭제하시겠습니까?\n(폴더 안 문서는 '미분류'로 이동합니다)`)) return
    const { error } = await supabase.from('document_folders').delete().eq('id', f.id)
    if (error) { alert(error.message); return }
    if (folderId === f.id) setFolderId('all')
    folderQ.reload(); docQ.reload()
  }
  const empQ = useQuery<Pick<Employee, 'id' | 'name'>[]>(
    async () => await supabase.from('employees').select('id,name'),
    [],
  )
  const empName = useMemo(() => {
    const m: Record<string, string> = {}
    for (const e of empQ.data ?? []) m[e.id] = e.name
    return m
  }, [empQ.data])

  const all = docQ.data ?? []

  const list = all
    .filter((d) => (folderId === 'all' || folderId === 'none') ? !d.folder_id : d.folder_id === folderId)
    .filter((d) => {
      if (!q) return true
      const owner = d.owner_id ? empName[d.owner_id] ?? '' : ''
      return d.title.includes(q) || owner.includes(q) || (d.category ?? '').includes(q)
    })

  const canEdit = (d: GotganDocument) => d.owner_id === me?.id || me?.role === 'admin'

  return (
    <div className="page on">
      <PageHead
        eyebrow="A PLACE FOR EVERY RECORD"
        title="문서보관"
        desc="내용을 적고 파일을 올려 보관하고, 정해진 범위 안에서 공유하세요."
        actions={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {isAdmin && (
              <>
                <button className="btn txt" onClick={addFolder} title="새 폴더 만들기">＋ 폴더</button>
                {folderId !== 'all' && folderId !== 'none' && (
                  <button className="btn txt" style={{ color: 'var(--danger)' }}
                    onClick={() => { const f = folders.find((x) => x.id === folderId); if (f) removeFolder(f) }}
                    title="현재 폴더 삭제">－ 폴더</button>
                )}
              </>
            )}
            <button className="btn txt add-txt" onClick={() => setEditDoc('new')}>문서 등록</button>
          </div>
        }
      />

      <section className="panel">
        <ErrorBanner error={docQ.error} table="documents" />
        <div className="toolbar">
          <h2 style={{ fontSize: 15, fontWeight: 800 }}>
            {folderId === 'all' ? '모든 문서' : folderId === 'none' ? '미분류' : (folders.find((f) => f.id === folderId)?.name ?? '문서')}{' '}
            <span className="count">{docQ.loading ? '…' : list.length}</span>
          </h2>
          <label className="search r" style={{ marginLeft: 'auto' }}>
            <svg className="icon" width="16" height="16" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4-4" />
            </svg>
            <input placeholder="제목·작성자·분류 검색" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
        </div>

        {/* 경로(브레드크럼) — 폴더 안에 들어와 있을 때 */}
        {folderId !== 'all' && (
          <div className="doc-crumb" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, padding: '2px 2px 12px' }}>
            <button className="btn txt" style={{ padding: 0 }} onClick={() => setFolderId('all')}>📁 모든 문서</button>
            <span style={{ color: 'var(--muted)' }}>›</span>
            <strong>{folderId === 'none' ? '미분류' : (folders.find((f) => f.id === folderId)?.name ?? '폴더')}</strong>
          </div>
        )}

        {/* 폴더 디렉터리 — '모든 문서'에서만, 하위 폴더로 들어가는 느낌 */}
        {folderId === 'all' && (folders.length > 0 || true) && (
          <div className="doc-dirs" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8, marginBottom: 14 }}>
            {folders.map((f) => {
              const n = all.filter((d) => d.folder_id === f.id).length
              return (
                <div key={f.id} className="doc-dir" onClick={() => setFolderId(f.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', border: '1px solid var(--line, #eee)', borderRadius: 9, cursor: 'pointer', position: 'relative', background: 'var(--card, #fff)' }}>
                  <span style={{ fontSize: 20 }}>📁</span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <strong style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.name}</strong>
                    <small style={{ color: 'var(--muted)' }}>{n}개</small>
                  </div>
                  {isAdmin && (
                    <span style={{ display: 'flex', gap: 2 }} onClick={(e) => e.stopPropagation()}>
                      <button title="이름 변경" onClick={() => renameFolder(f)} style={{ border: 0, background: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 2, fontSize: 12 }}>✎</button>
                      <button title="삭제" onClick={() => removeFolder(f)} style={{ border: 0, background: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 2, fontSize: 12 }}>✕</button>
                    </span>
                  )}
                </div>
              )
            })}
            <div className="doc-dir" onClick={() => setFolderId('none')}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', border: '1px dashed var(--line, #ddd)', borderRadius: 9, cursor: 'pointer', background: 'transparent' }}>
              <span style={{ fontSize: 20, opacity: 0.6 }}>🗂️</span>
              <div><strong style={{ display: 'block' }}>미분류</strong><small style={{ color: 'var(--muted)' }}>{all.filter((d) => !d.folder_id).length}개</small></div>
            </div>
          </div>
        )}

        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>문서 이름</th>
                <th>분류</th>
                <th>첨부</th>
                <th>소유자</th>
                <th>공유 범위</th>
                <th>수정일</th>
              </tr>
            </thead>
            <tbody>
              {docQ.loading && <LoadingRow cols={6} />}
              {!docQ.loading &&
                list.map((d) => (
                  <tr key={d.id} onClick={() => setDetail(d)} style={{ cursor: 'pointer' }}>
                    <td>
                      <span className="owner">
                        <span className="av-s" style={{ borderRadius: 7 }}>📄</span>
                        <div className="t-title">{d.title}</div>
                      </span>
                    </td>
                    <td className="t-sub">{d.category || ''}</td>
                    <td>{d.file_path ? <span className="badge" style={{ fontSize: 10 }}>📎 파일</span> : ''}</td>
                    <td>
                      <span className="owner">
                        <span className="av-s">{d.owner_id ? (empName[d.owner_id] ?? '—').slice(0, 1) : '—'}</span>
                        {d.owner_id ? empName[d.owner_id] ?? '—' : '—'}
                      </span>
                    </td>
                    <td>
                      <span className={SCOPE_BADGE[d.share_scope]}>
                        {d.share_scope === '개인' ? '개인 보관' : `${d.share_scope} 공유`}
                      </span>
                    </td>
                    <td className="tnum" style={{ color: 'var(--muted)' }}>{mmdd(d.updated_at || d.created_at)}</td>
                  </tr>
                ))}
              {!docQ.loading && list.length === 0 && !docQ.error && <EmptyRow cols={6} text="문서가 없습니다. '문서 등록'으로 추가하세요." />}
            </tbody>
          </table>
        </div>
      </section>

      {editDoc && (
        <DocEditModal
          doc={editDoc === 'new' ? null : editDoc}
          meId={me?.id ?? null}
          folders={folders}
          defaultFolderId={folderId !== 'all' && folderId !== 'none' ? folderId : null}
          onClose={() => setEditDoc(null)}
          onSaved={() => { docQ.reload(); setEditDoc(null); setDetail(null) }}
        />
      )}
      {detail && (
        <DocDetailModal
          doc={detail}
          ownerName={detail.owner_id ? empName[detail.owner_id] ?? '—' : '—'}
          canEdit={canEdit(detail)}
          onClose={() => setDetail(null)}
          onEdit={() => { setEditDoc(detail); setDetail(null) }}
          onDeleted={() => { docQ.reload(); setDetail(null) }}
        />
      )}
    </div>
  )
}

// ===== 등록/수정 모달 =====
function DocEditModal({ doc, meId, folders, defaultFolderId, onClose, onSaved }: {
  doc: GotganDocument | null; meId: string | null; folders: DocumentFolder[]
  defaultFolderId: string | null; onClose: () => void; onSaved: () => void
}) {
  const isEdit = !!doc
  const [title, setTitle] = useState(doc?.title ?? '')
  const [category, setCategory] = useState(doc?.category ?? '')
  const [scope, setScope] = useState<'개인' | '선택' | '전사'>(doc?.share_scope ?? '개인')
  const [folderId, setFolderId] = useState<string>(doc?.folder_id ?? defaultFolderId ?? '')
  const [body, setBody] = useState(doc?.body ?? '')
  const [file, setFile] = useState<File | null>(null)
  const [removeFile, setRemoveFile] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function save() {
    if (!title.trim()) { setErr('문서 이름을 입력하세요.'); return }
    setBusy(true); setErr(null)
    try {
      // 1) 문서 행 확보 (신규면 먼저 insert → id 확보)
      let docId = doc?.id
      const base = {
        title: title.trim(), category: category || null, share_scope: scope,
        folder_id: folderId || null, body: body || null, updated_at: new Date().toISOString(),
      }
      if (!isEdit) {
        const { data, error } = await supabase.from('documents')
          .insert({ ...base, owner_id: meId }).select('id').single()
        if (error || !data) throw error ?? new Error('생성 실패')
        docId = data.id
      }
      // 2) 파일 처리
      let filePatch: Partial<GotganDocument> = {}
      if (file && docId) {
        const safe = file.name.replace(/[^\w.\-가-힣]/g, '_')
        const path = `${docId}/${Date.now()}_${safe}`
        const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true })
        if (upErr) throw upErr
        // 기존 파일 교체 시 이전 파일 삭제
        if (doc?.file_path) await supabase.storage.from(BUCKET).remove([doc.file_path])
        filePatch = { file_path: path, file_name: file.name, file_size: file.size }
      } else if (removeFile && doc?.file_path) {
        await supabase.storage.from(BUCKET).remove([doc.file_path])
        filePatch = { file_path: null, file_name: null, file_size: null }
      }
      // 3) 행 업데이트 (수정이거나 파일 변동이 있으면)
      if (isEdit) {
        const { error } = await supabase.from('documents').update({ ...base, ...filePatch }).eq('id', docId)
        if (error) throw error
      } else if (Object.keys(filePatch).length) {
        const { error } = await supabase.from('documents').update(filePatch).eq('id', docId)
        if (error) throw error
      }
      onSaved()
    } catch (e) {
      setErr(e instanceof Error ? e.message : '저장 실패')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 620 }}>
        <div className="mh">
          <div>
            <div className="eyebrow">{isEdit ? '문서 수정' : '문서 등록'}</div>
            <h3>{isEdit ? '문서 수정' : '새 문서'}</h3>
          </div>
          <button className="x" onClick={onClose}>✕</button>
        </div>
        <div className="mb">
          <div style={{ display: 'flex', gap: 10 }}>
            <div className="mfield" style={{ flex: 1 }}>
              <label>문서 이름</label>
              <input className="ctl" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 2026 보존처리 표준계약서" autoFocus />
            </div>
            <div className="mfield" style={{ width: 150 }}>
              <label>분류</label>
              <input className="ctl" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="계약/규정/보고서" />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div className="mfield" style={{ flex: 1 }}>
              <label>공유 범위</label>
              <select className="ctl" value={scope} onChange={(e) => setScope(e.target.value as typeof scope)}>
                <option value="개인">개인 보관</option>
                <option value="선택">선택 공유</option>
                <option value="전사">전사 공유</option>
              </select>
            </div>
            <div className="mfield" style={{ flex: 1 }}>
              <label>폴더</label>
              <select className="ctl" value={folderId} onChange={(e) => setFolderId(e.target.value)}>
                <option value="">미분류</option>
                {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </div>
          </div>
          <div className="mfield">
            <label>내용</label>
            <textarea className="ctl" rows={8} value={body} onChange={(e) => setBody(e.target.value)}
              placeholder="문서 내용을 입력하세요." style={{ resize: 'vertical' }} />
          </div>
          <div className="mfield">
            <label>첨부 파일</label>
            {doc?.file_path && !file && !removeFile && (
              <div className="sec-mini" style={{ margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: 8 }}>
                📎 {doc.file_name} <span style={{ color: 'var(--muted)' }}>{fmtSize(doc.file_size)}</span>
                <button className="btn txt" type="button" onClick={() => setRemoveFile(true)} style={{ fontSize: 12, color: 'var(--danger)' }}>제거</button>
              </div>
            )}
            {removeFile && <div className="sec-mini" style={{ margin: '0 0 6px', color: 'var(--danger)' }}>첨부 제거됨 · 저장 시 적용 <button className="btn txt" type="button" onClick={() => setRemoveFile(false)} style={{ fontSize: 12 }}>취소</button></div>}
            <input className="ctl" type="file" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setRemoveFile(false) }} />
            {file && <div className="sec-mini" style={{ margin: '6px 0 0' }}>선택: {file.name} ({fmtSize(file.size)})</div>}
          </div>
          {err && <div className="login-alert err" style={{ margin: '8px 0 0' }}>{err}</div>}
        </div>
        <div className="mf">
          <button className="btn sec" onClick={onClose} disabled={busy}>취소</button>
          <button className="btn pri" onClick={save} disabled={busy || !title.trim()}>
            {busy ? '저장 중…' : isEdit ? '수정 저장' : '등록'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ===== 상세 보기 =====
function DocDetailModal({ doc, ownerName, canEdit, onClose, onEdit, onDeleted }: {
  doc: GotganDocument; ownerName: string; canEdit: boolean
  onClose: () => void; onEdit: () => void; onDeleted: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function download() {
    if (!doc.file_path) return
    setErr(null)
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(doc.file_path, 60)
    if (error || !data) { setErr('다운로드 링크 생성 실패'); return }
    window.open(data.signedUrl, '_blank')
  }

  async function remove() {
    if (!window.confirm(`'${doc.title}' 문서를 삭제하시겠습니까?`)) return
    setBusy(true); setErr(null)
    if (doc.file_path) await supabase.storage.from(BUCKET).remove([doc.file_path])
    const { error } = await supabase.from('documents').delete().eq('id', doc.id)
    setBusy(false)
    if (error) { setErr(error.message); return }
    onDeleted()
  }

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640 }}>
        <div className="mh">
          <div>
            <div className="eyebrow">{doc.category || '문서'} · {doc.share_scope === '개인' ? '개인 보관' : `${doc.share_scope} 공유`}</div>
            <h3>{doc.title}</h3>
          </div>
          <button className="x" onClick={onClose}>✕</button>
        </div>
        <div className="mb">
          <div className="sec-mini" style={{ margin: '0 0 10px', color: 'var(--muted)' }}>
            작성자 {ownerName} · 수정일 {mmdd(doc.updated_at || doc.created_at)}
          </div>
          {doc.file_path && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'var(--brand-soft)', borderRadius: 8, marginBottom: 12 }}>
              <span>📎 {doc.file_name} <span style={{ color: 'var(--muted)' }}>{fmtSize(doc.file_size)}</span></span>
              <button className="btn pri" type="button" onClick={download} style={{ marginLeft: 'auto', padding: '5px 12px' }}>다운로드</button>
            </div>
          )}
          {doc.body ? (
            <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.65, fontSize: 13.5 }}>{doc.body}</div>
          ) : (
            <div className="sec-mini" style={{ color: 'var(--muted)' }}>본문 내용이 없습니다.{doc.file_path ? ' (첨부 파일을 확인하세요)' : ''}</div>
          )}
          {err && <div className="login-alert err" style={{ margin: '10px 0 0' }}>{err}</div>}
        </div>
        <div className="mf">
          {canEdit && <button className="btn danger-txt" onClick={remove} disabled={busy} style={{ marginRight: 'auto' }}>삭제</button>}
          <button className="btn sec" onClick={onClose} disabled={busy}>닫기</button>
          {canEdit && <button className="btn pri" onClick={onEdit} disabled={busy}>수정</button>}
        </div>
      </div>
    </div>
  )
}

