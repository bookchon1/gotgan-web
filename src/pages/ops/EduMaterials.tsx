import { useMemo, useState } from 'react'
import { PageHead } from '../../components/PageHead'
import { ErrorBanner, LoadingRow, EmptyRow } from '../../components/States'
import { supabase } from '../../lib/supabase'
import { useQuery } from '../../lib/useQuery'
import { useAuth } from '../../lib/auth'
import type { EduMaterial, Employee } from '../../types/db'

const SECTIONS = ['이론', '실기', '시험']

/** 파일 크기(바이트) → 사람이 읽는 KB/MB */
function fileSize(n: number | null): string {
  if (!n || n <= 0) return ''
  if (n >= 1_048_576) return `${(n / 1_048_576).toFixed(1)}MB`
  if (n >= 1024) return `${Math.round(n / 1024)}KB`
  return `${n}B`
}

/** 교육 · 수업자료 — 이수과목별 비공개 수업자료(메타데이터) */
export default function EduMaterials() {
  const { me } = useAuth()
  const [addOpen, setAddOpen] = useState(false)

  const matQ = useQuery<EduMaterial[]>(
    async () =>
      await supabase
        .from('edu_materials')
        .select('id,section,subject,title,note,file_path,file_name,file_size,uploader_id')
        .order('created_at', { ascending: false }),
    [],
  )
  const empQ = useQuery<Pick<Employee, 'id' | 'name'>[]>(
    async () => await supabase.from('employees').select('id,name'),
    [],
  )
  const empName = useMemo(() => Object.fromEntries((empQ.data ?? []).map((e) => [e.id, e.name])), [empQ.data])
  const rows = matQ.data ?? []

  const [subj, setSubj] = useState('all')
  const [q, setQ] = useState('')

  // 이수과목 필터 옵션 — 등록된 (section · subject) 조합
  const combos = useMemo(() => {
    const set = new Set<string>()
    for (const r of rows) if (r.section || r.subject) set.add(`${r.section ?? ''} · ${r.subject ?? ''}`)
    return Array.from(set).sort()
  }, [rows])

  const list = useMemo(
    () =>
      rows.filter((r) => {
        if (subj !== 'all' && `${r.section ?? ''} · ${r.subject ?? ''}` !== subj) return false
        if (q.trim()) {
          const hay = [r.title, r.file_name, r.subject, r.section].filter(Boolean).join(' ').toLowerCase()
          if (!hay.includes(q.trim().toLowerCase())) return false
        }
        return true
      }),
    [rows, subj, q],
  )

  const topBtn = (
    <button className="btn pri" onClick={() => setAddOpen(true)}>
      + 수업자료 등록
    </button>
  )

  return (
    <div className="page on">
      <PageHead eyebrow="교육 · 자료" title="수업자료" desc="이수과목별 비공개 수업자료를 관리합니다." actions={topBtn} />
      <section className="panel">
        <ErrorBanner error={matQ.error} table="edu_materials" />
        <div className="toolbar">
          <select className="sel" value={subj} onChange={(e) => setSubj(e.target.value)}>
            <option value="all">전체 이수과목</option>
            {combos.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <label className="search" style={{ marginLeft: 'auto' }}>
            <svg className="icon" width="15" height="15" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4-4" />
            </svg>
            <input placeholder="제목·파일명 검색" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
        </div>
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>이수과목</th>
                <th>수업자료</th>
                <th>파일</th>
                <th>등록자</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {matQ.loading && <LoadingRow cols={5} />}
              {!matQ.loading &&
                list.map((r) => {
                  const hasFile = !!r.file_path
                  const sz = fileSize(r.file_size)
                  return (
                    <tr key={r.id}>
                      <td>
                        <span className="badge">
                          {(r.section ?? '—')}
                          {r.subject ? ` · ${r.subject}` : ''}
                        </span>
                      </td>
                      <td>
                        <div className="t-title">{r.title}</div>
                        {r.note && <div className="t-sub">{r.note}</div>}
                      </td>
                      <td className="tnum">
                        {r.file_name ? `${r.file_name}${sz ? ` · ${sz}` : ''}` : '—'}
                      </td>
                      <td>{r.uploader_id ? empName[r.uploader_id] ?? '—' : '—'}</td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          className="btn sec"
                          style={{ padding: '5px 10px', opacity: hasFile ? 1 : 0.5 }}
                          disabled={!hasFile}
                          onClick={() => {
                            if (hasFile && r.file_path) window.open(r.file_path, '_blank', 'noopener')
                          }}
                        >
                          {hasFile ? '다운로드' : '파일 없음'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              {!matQ.loading && list.length === 0 && !matQ.error && (
                <EmptyRow cols={5} text="등록된 수업자료가 없습니다. '수업자료 등록'으로 추가하세요." />
              )}
            </tbody>
          </table>
        </div>
      </section>

      {addOpen && (
        <MaterialModal
          uploaderId={me?.id ?? null}
          onClose={() => setAddOpen(false)}
          onSaved={() => {
            setAddOpen(false)
            matQ.reload()
          }}
        />
      )}
    </div>
  )
}

// 수업자료 등록 모달 — 메타데이터만(실제 파일 업로드는 Storage 'edu-materials' 버킷 필요)
function MaterialModal({
  uploaderId,
  onClose,
  onSaved,
}: {
  uploaderId: string | null
  onClose: () => void
  onSaved: () => void
}) {
  const [section, setSection] = useState(SECTIONS[0])
  const [subject, setSubject] = useState('')
  const [title, setTitle] = useState('')
  const [note, setNote] = useState('')
  const [fileName, setFileName] = useState('')
  const [fileSizeMb, setFileSizeMb] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function save() {
    if (!title.trim()) {
      setErr('자료 제목을 입력하세요.')
      return
    }
    setBusy(true)
    setErr(null)
    // file_size 는 MB 입력을 바이트로 환산(선택). file_path 는 Storage 미연동이라 null.
    const sizeBytes = fileSizeMb.trim() ? Math.round(parseFloat(fileSizeMb) * 1_048_576) : null
    const { error } = await supabase.from('edu_materials').insert({
      section,
      subject: subject.trim() || null,
      title: title.trim(),
      note: note.trim() || null,
      file_path: null,
      file_name: fileName.trim() || null,
      file_size: Number.isFinite(sizeBytes) ? sizeBytes : null,
      uploader_id: uploaderId,
    })
    setBusy(false)
    if (error) {
      setErr(error.message)
      return
    }
    onSaved()
  }

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460 }}>
        <div className="mh">
          <div>
            <div className="eyebrow">교육 · 자료</div>
            <h3>수업자료 등록</h3>
          </div>
          <button className="x" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="mb">
          <div style={{ display: 'flex', gap: 10 }}>
            <div className="mfield" style={{ width: 120 }}>
              <label>이수 구분</label>
              <select className="ctl" value={section} onChange={(e) => setSection(e.target.value)}>
                {SECTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="mfield" style={{ flex: 1 }}>
              <label>이수과목</label>
              <input
                className="ctl"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="예: 단청학개론"
              />
            </div>
          </div>
          <div className="mfield">
            <label>자료 제목</label>
            <input
              className="ctl"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="예: 단청의 역사와 분류 강의안"
              autoFocus
            />
          </div>
          <div className="mfield">
            <label>설명</label>
            <input
              className="ctl"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="예: 1~3주차 이론 수업 (선택)"
            />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div className="mfield" style={{ flex: 1 }}>
              <label>파일명</label>
              <input
                className="ctl"
                value={fileName}
                onChange={(e) => setFileName(e.target.value)}
                placeholder="예: 단청개론.pdf (선택)"
              />
            </div>
            <div className="mfield" style={{ width: 120 }}>
              <label>크기 (MB)</label>
              <input
                className="ctl"
                type="number"
                min={0}
                step={0.1}
                value={fileSizeMb}
                onChange={(e) => setFileSizeMb(e.target.value)}
                placeholder="예: 2.4"
              />
            </div>
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 4 }}>
            파일 실체 업로드는 Supabase Storage('edu-materials' 버킷) 연동 후 지원됩니다. 현재는 자료 메타데이터만
            등록됩니다.
          </div>
          {err && (
            <div className="login-alert err" style={{ margin: '8px 0 0' }}>
              {err}
            </div>
          )}
        </div>
        <div className="mf">
          <button className="btn sec" onClick={onClose} disabled={busy}>
            취소
          </button>
          <button className="btn pri" onClick={save} disabled={busy}>
            {busy ? '저장 중…' : '등록'}
          </button>
        </div>
      </div>
    </div>
  )
}
