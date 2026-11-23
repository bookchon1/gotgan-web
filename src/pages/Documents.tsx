import { useMemo, useRef, useState, type DragEvent } from 'react'
import { PageHead } from '../components/PageHead'
import { ErrorBanner, LoadingRow, EmptyRow } from '../components/States'
import { supabase } from '../lib/supabase'
import { useQuery } from '../lib/useQuery'
import { mmdd } from '../lib/format'
import { useAuth } from '../lib/auth'
import { unzipSync } from 'fflate'
import type { GotganDocument, Employee, DocumentFolder } from '../types/db'

const SCOPE_BADGE: Record<string, string> = {
  전사: 'badge green',
  선택: 'badge blue',
  개인: 'badge',
}
const BUCKET = 'documents'

// ── 올리기 보조 ──
type UpItem = { dirs: string[]; name: string; file: File }
const MIME: Record<string, string> = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', txt: 'text/plain', csv: 'text/csv' }
const JUNK = /(^|\/)(thumbs\.db|\.ds_store|desktop\.ini|__macosx)(\/|$)/i

/** 압축 파일 안 이름 복원 (UTF-8 표시가 없는 한글 zip은 CP949) + 맥 자모분리 정리 */
function fixName(n: string): string {
  let out = n
  if (/[\u0080-\u00ff]/.test(n) && ![...n].some((c) => c.charCodeAt(0) > 255)) {
    try {
      const bytes = Uint8Array.from([...n].map((c) => c.charCodeAt(0)))
      const dec = new TextDecoder('euc-kr', { fatal: true }).decode(bytes)
      if (!dec.includes('\uFFFD')) out = dec
    } catch { /* 그대로 */ }
  }
  return out.normalize('NFC')
}

async function expandZip(zip: File): Promise<UpItem[]> {
  const data = unzipSync(new Uint8Array(await zip.arrayBuffer()))
  const items: UpItem[] = []
  for (const [raw, bytes] of Object.entries(data)) {
    const full = fixName(raw)
    if (full.endsWith('/') || JUNK.test(full)) continue
    const parts = full.split('/').filter(Boolean)
    const name = parts.pop()
    if (!name) continue
    const ext = name.split('.').pop()?.toLowerCase() ?? ''
    items.push({ dirs: parts, name, file: new File([bytes as BlobPart], name, { type: MIME[ext] ?? 'application/octet-stream' }) })
  }
  return items
}

async function collectItems(files: File[]): Promise<UpItem[]> {
  const items: UpItem[] = []
  for (const f of files) {
    if (JUNK.test(f.name)) continue
    if (/\.zip$/i.test(f.name)) { items.push(...(await expandZip(f))); continue }
    const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath
    const parts = rel ? rel.normalize('NFC').split('/').filter(Boolean) : [f.name]
    const name = parts.pop() ?? f.name
    if (JUNK.test(rel ?? '')) continue
    items.push({ dirs: parts, name, file: f })
  }
  return items
}

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
  const curFolder = folderId !== 'all' && folderId !== 'none' ? folders.find((x) => x.id === folderId) ?? null : null
  // 하위 폴더 포함 id 목록 (자기 자신 포함)
  function descIds(id: string): string[] {
    const out = [id]
    for (const c of folders) if ((c.parent_id ?? null) === id) out.push(...descIds(c.id))
    return out
  }
  // 현재 위치의 경로 (루트 → 현재)
  const crumbs: DocumentFolder[] = []
  for (let c = curFolder, guard = 0; c && guard < 20; guard++) {
    crumbs.unshift(c)
    c = c.parent_id ? folders.find((x) => x.id === c!.parent_id) ?? null : null
  }
  const [openSet, setOpenSet] = useState<Record<string, boolean>>({})
  const shownFolders = folders.filter((f) => (f.parent_id ?? null) === (curFolder?.id ?? null))

  async function addFolder() {
    const name = window.prompt(curFolder ? `'${curFolder.name}' 안에 만들 폴더 이름` : '새 폴더 이름')?.trim()
    if (!name) return
    const sort = folders.length ? Math.max(...folders.map((f) => f.sort)) + 1 : 0
    const parent = folderId !== 'all' && folderId !== 'none' ? folderId : null
    const { error } = await supabase.from('document_folders').insert({ name, sort, created_by: me?.id ?? null, ...(parent ? { parent_id: parent } : {}) })
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
    if (!window.confirm(`'${f.name}' 폴더를 삭제하시겠습니까?\n(하위 폴더도 함께 삭제되고, 안의 문서는 '미분류'로 이동합니다)`)) return
    const { error } = await supabase.from('document_folders').delete().eq('id', f.id)
    if (error) { alert(error.message); return }
    if (folderId !== 'all' && folderId !== 'none' && descIds(f.id).includes(folderId)) setFolderId(f.parent_id ?? 'all')
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

  // ── 파일·폴더·압축 올리기 ──
  const fileIn = useRef<HTMLInputElement>(null)
  const dirIn = useRef<HTMLInputElement>(null)
  const [upMsg, setUpMsg] = useState<string | null>(null)
  async function uploadMany(picked: File[]) {
    if (!picked.length || !me?.id) return
    try {
      setUpMsg('파일 확인 중…')
      const items = await collectItems(picked)
      if (!items.length) { setUpMsg(null); alert('올릴 파일이 없습니다.'); return }
      const needDirs = items.some((i) => i.dirs.length > 0)
      if (needDirs && !isAdmin) { setUpMsg(null); alert('폴더가 들어 있는 압축·폴더 올리기는 관리자만 할 수 있습니다.'); return }
      const where = curFolder ? pathOf(curFolder, folders) : '공유문서'
      if (!window.confirm(`${items.length}개 파일을 '${where}'에 올립니다.${needDirs ? '\n(압축·폴더 안의 폴더 구조를 그대로 만듭니다)' : ''}\n공유 범위는 전사 공유로 등록됩니다.`)) { setUpMsg(null); return }
      // 폴더 캐시: "부모id|이름" → id
      const known = new Map<string, string>()
      for (const f of folders) known.set(`${f.parent_id ?? ''}|${f.name}`, f.id)
      let nextSort = folders.length ? Math.max(...folders.map((f) => f.sort)) + 1 : 0
      const base = curFolder?.id ?? null
      const ensure = async (dirs: string[]): Promise<string | null> => {
        let parent = base
        for (const d of dirs) {
          const key = `${parent ?? ''}|${d}`
          let id = known.get(key)
          if (!id) {
            const { data, error } = await supabase.from('document_folders')
              .insert({ name: d, sort: nextSort++, created_by: me.id, ...(parent ? { parent_id: parent } : {}) }).select('id').single()
            if (error || !data) throw error ?? new Error('폴더 생성 실패')
            id = data.id as string
            known.set(key, id)
          }
          parent = id
        }
        return parent
      }
      const exist = new Set(all.map((d) => `${d.folder_id ?? ''}|${d.file_name ?? ''}`))
      let done = 0, skipped = 0
      const failed: string[] = []
      for (const it of items) {
        setUpMsg(`올리는 중… ${done + skipped + failed.length + 1} / ${items.length}`)
        try {
          const fid = await ensure(it.dirs)
          if (exist.has(`${fid ?? ''}|${it.name}`)) { skipped++; continue }
          const title = it.name.replace(/\.[^./]+$/, '') || it.name
          const { data, error } = await supabase.from('documents')
            .insert({ title, share_scope: '전사', folder_id: fid, owner_id: me.id, updated_at: new Date().toISOString() }).select('id').single()
          if (error || !data) throw error ?? new Error('등록 실패')
          // 저장소 경로는 영문·숫자만(한글·특수문자 키 거부 방지). 원본 이름은 file_name 에 보관
          const ext = (it.name.match(/\.([A-Za-z0-9]{1,8})$/)?.[1] ?? 'bin').toLowerCase()
          const path = `${data.id}/${Date.now()}_${done}.${ext}`
          const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, it.file, { upsert: true, contentType: it.file.type || undefined })
          if (upErr) { await supabase.from('documents').delete().eq('id', data.id); throw upErr }
          const { error: pErr } = await supabase.from('documents').update({ file_path: path, file_name: it.name, file_size: it.file.size }).eq('id', data.id)
          if (pErr) throw pErr
          exist.add(`${fid ?? ''}|${it.name}`)
          done++
        } catch (e) {
          failed.push(`${it.name} (${e instanceof Error ? e.message : '실패'})`)
        }
      }
      setUpMsg(null)
      folderQ.reload(); docQ.reload()
      alert(`올리기 완료: ${done}개 등록${skipped ? ` · ${skipped}개는 이미 있어 건너뜀` : ''}${failed.length ? `\n실패 ${failed.length}개:\n${failed.slice(0, 8).join('\n')}` : ''}`)
    } catch (e) {
      setUpMsg(null)
      alert(e instanceof Error ? e.message : '올리기에 실패했습니다.')
    }
  }

  // ── 끌어서 옮기기 (폴더 → 폴더, 문서 → 폴더) ──
  const dragRef = useRef<{ kind: 'folder' | 'doc'; id: string } | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  async function dropOn(target: string) {
    const d = dragRef.current
    dragRef.current = null
    setOverId(null)
    if (!d) return
    if (d.kind === 'folder') {
      if (!isAdmin || target === 'none') return
      const f = folders.find((x) => x.id === d.id)
      if (!f) return
      const np = target === 'root' ? null : target
      if ((f.parent_id ?? null) === np) return
      if (np && descIds(f.id).includes(np)) { alert('폴더를 자기 자신이나 그 하위 폴더로는 옮길 수 없습니다.'); return }
      const { data, error } = await supabase.from('document_folders').update({ parent_id: np }).eq('id', f.id).select('id')
      if (error) { alert(error.message); return }
      if (!data || data.length === 0) { alert('옮기지 못했습니다. 권한을 확인해 주세요.'); return }
      folderQ.reload()
    } else {
      const doc = all.find((x) => x.id === d.id)
      if (!doc || !canEdit(doc)) return
      const nf = target === 'root' || target === 'none' ? null : target
      if ((doc.folder_id ?? null) === nf) return
      const { data, error } = await supabase.from('documents').update({ folder_id: nf }).eq('id', doc.id).select('id')
      if (error) { alert(error.message); return }
      if (!data || data.length === 0) { alert('옮기지 못했습니다. 권한을 확인해 주세요.'); return }
      docQ.reload()
    }
  }
  const dnd: Dnd = {
    over: overId,
    drag: (kind, id, ok) =>
      ok
        ? {
            draggable: true,
            onDragStart: (e: DragEvent) => { dragRef.current = { kind, id }; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', id) },
            onDragEnd: () => { dragRef.current = null; setOverId(null) },
          }
        : {},
    drop: (target) => ({
      onDragOver: (e: DragEvent) => { if (dragRef.current) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (overId !== target) setOverId(target) } },
      onDragLeave: () => setOverId((o) => (o === target ? null : o)),
      onDrop: (e: DragEvent) => { e.preventDefault(); void dropOn(target) },
    }),
  }

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
            <button className="btn txt" onClick={() => fileIn.current?.click()} disabled={!!upMsg} title="파일 또는 압축(zip)을 풀어서 올립니다">파일 올리기</button>
            {isAdmin && <button className="btn txt" onClick={() => dirIn.current?.click()} disabled={!!upMsg}>폴더 올리기</button>}
            <button className="btn txt add-txt" onClick={() => setEditDoc('new')}>문서 등록</button>
            <input ref={fileIn} type="file" multiple hidden onChange={(e) => { const f = Array.from(e.target.files ?? []); e.target.value = ''; void uploadMany(f) }} />
            <input ref={dirIn} type="file" hidden {...({ webkitdirectory: '', directory: '' } as Record<string, string>)} onChange={(e) => { const f = Array.from(e.target.files ?? []); e.target.value = ''; void uploadMany(f) }} />
          </div>
        }
      />

      <section className="panel dx">
        <aside className="dx-tree" aria-label="폴더">
          <button className={`dx-node${folderId === 'all' ? ' on' : ''}${overId === 'root' ? ' drop' : ''}`} onClick={() => setFolderId('all')} {...dnd.drop('root')}>
            <i>📁</i>
            <span>공유문서</span>
          </button>
          <TreeLevel parent={null} depth={1} folders={folders} cur={folderId} openSet={openSet} setOpen={setOpenSet} go={setFolderId} dnd={dnd} canDragFolder={isAdmin} />
          <button className={`dx-node${folderId === 'none' ? ' on' : ''}${overId === 'none' ? ' drop' : ''}`} style={{ paddingLeft: 12 }} onClick={() => setFolderId('none')} {...dnd.drop('none')}>
            <i>🗂️</i>
            <span>미분류</span>
          </button>
        </aside>

        <div className="dx-main">
          <ErrorBanner error={docQ.error} table="documents" />
          {upMsg && <div className="dx-up">{upMsg}</div>}
          <div className="toolbar" style={{ marginBottom: 10 }}>
            <div className="dx-crumb" role="navigation" aria-label="경로">
              <button onClick={() => setFolderId('all')} className={`${folderId === 'all' ? 'cur' : ''}${overId === 'root' ? ' drop' : ''}`} {...dnd.drop('root')}>공유문서</button>
              {folderId === 'none' ? (
                <>
                  <span>›</span>
                  <b>미분류</b>
                </>
              ) : (
                crumbs.map((c, i) => (
                  <span key={c.id} className="dx-seg">
                    <span>›</span>
                    {i === crumbs.length - 1 ? <b>{c.name}</b> : <button onClick={() => setFolderId(c.id)} className={overId === c.id ? 'drop' : ''} {...dnd.drop(c.id)}>{c.name}</button>}
                  </span>
                ))
              )}
            </div>
            <label className="search r" style={{ marginLeft: 'auto' }}>
              <svg className="icon" width="16" height="16" viewBox="0 0 24 24">
                <circle cx="11" cy="11" r="7" />
                <path d="M21 21l-4-4" />
              </svg>
              <input placeholder="검색" value={q} onChange={(e) => setQ(e.target.value)} />
            </label>
          </div>

          <div className="tbl-wrap">
            <table className="dx-tbl">
              <thead>
                <tr>
                  <th>이름</th>
                  <th>유형</th>
                  <th>첨부</th>
                  <th>소유자</th>
                  <th>공유 범위</th>
                  <th>수정일</th>
                </tr>
              </thead>
              <tbody>
                {docQ.loading && <LoadingRow cols={6} />}
                {!q && folderId !== 'none' &&
                  shownFolders.map((f) => {
                    const ids = descIds(f.id)
                    const n = all.filter((d) => d.folder_id && ids.includes(d.folder_id)).length
                    return (
                      <tr key={f.id} className={`dx-dir${overId === f.id ? ' drop' : ''}`} onClick={() => setFolderId(f.id)} style={{ cursor: 'pointer' }} {...dnd.drag('folder', f.id, isAdmin)} {...dnd.drop(f.id)}>
                        <td>
                          <span className="owner">
                            <span className="av-s" style={{ borderRadius: 7, background: 'transparent', fontSize: 16 }}>📁</span>
                            <div className="t-title">{f.name}</div>
                          </span>
                        </td>
                        <td className="t-sub">폴더 · {n}개</td>
                        <td></td>
                        <td></td>
                        <td></td>
                        <td className="tnum" style={{ color: 'var(--muted)' }}>
                          <span className="dx-when">{mmdd(f.created_at)}</span>
                          {isAdmin && (
                            <span className="dx-acts" onClick={(e) => e.stopPropagation()}>
                              <button title="이름 변경" onClick={() => renameFolder(f)}>✎</button>
                              <button title="삭제" onClick={() => removeFolder(f)}>✕</button>
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                {!docQ.loading &&
                  list.map((d) => (
                    <tr key={d.id} onClick={() => setDetail(d)} style={{ cursor: 'pointer' }} {...dnd.drag('doc', d.id, canEdit(d))}>
                      <td>
                        <span className="owner">
                          <span className="av-s" style={{ borderRadius: 7 }}>📄</span>
                          <div className="t-title">{d.title}</div>
                        </span>
                      </td>
                      <td className="t-sub">{d.category || '문서'}</td>
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
                {!docQ.loading && list.length === 0 && (q || folderId === 'none' || shownFolders.length === 0) && !docQ.error && <EmptyRow cols={6} text="비어 있습니다." />}
              </tbody>
            </table>
          </div>
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
              <input className="ctl" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
            </div>
            <div className="mfield" style={{ width: 150 }}>
              <label>분류</label>
              <input className="ctl" value={category} onChange={(e) => setCategory(e.target.value)} />
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
                {folders.map((f) => <option key={f.id} value={f.id}>{pathOf(f, folders)}</option>)}
              </select>
            </div>
          </div>
          <div className="mfield">
            <label>내용</label>
            <textarea className="ctl" rows={8} value={body} onChange={(e) => setBody(e.target.value)} style={{ resize: 'vertical' }} />
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


function pathOf(f: DocumentFolder, all: DocumentFolder[]): string {
  const names = [f.name]
  for (let c = f, g = 0; c.parent_id && g < 20; g++) {
    const p = all.find((x) => x.id === c.parent_id)
    if (!p) break
    names.unshift(p.name)
    c = p
  }
  return names.join(' › ')
}

type Dnd = {
  over: string | null
  drag: (kind: 'folder' | 'doc', id: string, ok: boolean) => Record<string, unknown>
  drop: (target: string) => { onDragOver: (e: DragEvent) => void; onDragLeave: () => void; onDrop: (e: DragEvent) => void }
}

function TreeLevel({ parent, depth, folders, cur, openSet, setOpen, go, dnd, canDragFolder }: {
  parent: string | null; depth: number; folders: DocumentFolder[]; cur: string
  openSet: Record<string, boolean>; setOpen: (v: Record<string, boolean>) => void; go: (id: string) => void
  dnd: Dnd; canDragFolder: boolean
}) {
  const kids = folders.filter((f) => (f.parent_id ?? null) === parent)
  // 현재 폴더의 상위 경로는 자동으로 펼침
  const anc = new Set<string>()
  for (let c = folders.find((x) => x.id === cur), g = 0; c && c.parent_id && g < 20; g++) {
    anc.add(c.parent_id)
    c = folders.find((x) => x.id === c!.parent_id)
  }
  return (
    <>
      {kids.map((f) => {
        const has = folders.some((x) => x.parent_id === f.id)
        const open = openSet[f.id] ?? anc.has(f.id)
        return (
          <div key={f.id}>
            <div className={`dx-node${cur === f.id ? ' on' : ''}${dnd.over === f.id ? ' drop' : ''}`} style={{ paddingLeft: 6 + depth * 14 }} {...dnd.drag('folder', f.id, canDragFolder)} {...dnd.drop(f.id)}>
              <button className="dx-tg" disabled={!has} aria-label={open ? '접기' : '펼치기'} onClick={() => setOpen({ ...openSet, [f.id]: !open })}>
                {has ? (open ? '▾' : '▸') : ''}
              </button>
              <button className="dx-nm" onClick={() => go(f.id)}>
                <i>{open && has ? '📂' : '📁'}</i>
                <span>{f.name}</span>
              </button>
            </div>
            {has && open && <TreeLevel parent={f.id} depth={depth + 1} folders={folders} cur={cur} openSet={openSet} setOpen={setOpen} go={go} dnd={dnd} canDragFolder={canDragFolder} />}
          </div>
        )
      })}
    </>
  )
}
