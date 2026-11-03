import { useMemo, useState } from 'react'
import { PageHead } from '../components/PageHead'
import { Icon } from '../components/Icon'
import { ErrorBanner, LoadingRow, EmptyRow } from '../components/States'
import { supabase } from '../lib/supabase'
import { useQuery } from '../lib/useQuery'
import { mmdd } from '../lib/format'
import { useAuth } from '../lib/auth'
import type { GotganDocument, Employee } from '../types/db'

type Folder = 'all' | '개인' | '전사' | '선택'

const SCOPE_BADGE: Record<string, string> = {
  전사: 'badge green',
  선택: 'badge blue',
  개인: 'badge',
}

export default function Documents() {
  const { me } = useAuth()
  const [folder, setFolder] = useState<Folder>('all')
  const [q, setQ] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [form, setForm] = useState({ title: '', category: '', scope: '개인' as '개인' | '선택' | '전사' })
  const [busy, setBusy] = useState(false)

  async function createDoc() {
    if (!form.title.trim()) return
    setBusy(true)
    await supabase.from('documents').insert({
      title: form.title.trim(),
      category: form.category || null,
      owner_id: me?.id ?? null,
      share_scope: form.scope,
    })
    setBusy(false)
    setAddOpen(false)
    setForm({ title: '', category: '', scope: '개인' })
    docQ.reload()
  }

  const docQ = useQuery<GotganDocument[]>(
    async () => await supabase.from('documents').select('*').order('created_at', { ascending: false }),
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

  const all = docQ.data ?? []
  const counts = {
    all: all.length,
    개인: all.filter((d) => d.share_scope === '개인').length,
    전사: all.filter((d) => d.share_scope === '전사').length,
    선택: all.filter((d) => d.share_scope === '선택').length,
  }

  const list = all
    .filter((d) => folder === 'all' || d.share_scope === folder)
    .filter((d) => {
      if (!q) return true
      const owner = d.owner_id ? empName[d.owner_id] ?? '' : ''
      return d.title.includes(q) || owner.includes(q)
    })

  return (
    <div className="page on">
      <PageHead
        eyebrow="A PLACE FOR EVERY RECORD"
        title="문서보관"
        desc="필요한 자료를 정리하고, 정해진 범위 안에서 공유하세요."
        actions={
          <button className="btn pri" onClick={() => setAddOpen(true)}>
            문서 만들기
          </button>
        }
      />

      <div className="folders">
        <Fold k="all" cur={folder} set={setFolder} icon="doc" title="모든 문서" n={counts.all} />
        <Fold k="개인" cur={folder} set={setFolder} icon="lock" title="개인 보관" n={counts.개인} />
        <Fold k="전사" cur={folder} set={setFolder} icon="home" title="전사 공유" n={counts.전사} />
        <Fold k="선택" cur={folder} set={setFolder} icon="users" title="선택 공유" n={counts.선택} />
      </div>

      <section className="panel">
        <ErrorBanner error={docQ.error} table="documents" />
        <div className="toolbar">
          <h2 style={{ fontSize: 15, fontWeight: 800 }}>
            {folder === 'all' ? '모든 문서' : folder === '개인' ? '개인 보관' : folder === '전사' ? '전사 공유' : '선택 공유'}{' '}
            <span className="count">{docQ.loading ? '…' : list.length}</span>
          </h2>
          <label className="search r" style={{ marginLeft: 'auto' }}>
            <svg className="icon" width="16" height="16" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4-4" />
            </svg>
            <input placeholder="제목 또는 작성자 검색" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
        </div>
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>문서 이름</th>
                <th>소유자</th>
                <th>공유 범위</th>
                <th>수정일</th>
              </tr>
            </thead>
            <tbody>
              {docQ.loading && <LoadingRow cols={4} />}
              {!docQ.loading &&
                list.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <span className="owner">
                        <span className="av-s" style={{ borderRadius: 7 }}>
                          📄
                        </span>
                        <div className="t-title">{d.title}</div>
                      </span>
                    </td>
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
                    <td className="tnum" style={{ color: 'var(--muted)' }}>
                      {mmdd(d.created_at)}
                    </td>
                  </tr>
                ))}
              {!docQ.loading && list.length === 0 && !docQ.error && (
                <EmptyRow cols={4} text="문서가 없습니다." />
              )}
            </tbody>
          </table>
        </div>
      </section>

      {addOpen && (
        <div className="modal-bg" onClick={() => setAddOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="mh">
              <div>
                <div className="eyebrow">문서 만들기</div>
                <h3>새 문서</h3>
              </div>
              <button className="x" onClick={() => setAddOpen(false)}>
                ✕
              </button>
            </div>
            <div className="mb">
              <div className="mfield">
                <label>문서 이름</label>
                <input className="ctl" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="예: 2026 보존처리 표준계약서" autoFocus />
              </div>
              <div className="mfield">
                <label>분류</label>
                <input className="ctl" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="예: 계약 / 규정 / 보고서" />
              </div>
              <div className="mfield">
                <label>공유 범위</label>
                <select className="ctl" value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value as typeof form.scope })}>
                  <option value="개인">개인 보관</option>
                  <option value="선택">선택 공유</option>
                  <option value="전사">전사 공유</option>
                </select>
              </div>
            </div>
            <div className="mf">
              <button className="btn sec" onClick={() => setAddOpen(false)} disabled={busy}>
                취소
              </button>
              <button className="btn pri" onClick={createDoc} disabled={busy || !form.title.trim()}>
                {busy ? '생성 중…' : '만들기'}
              </button>
            </div>
          </div>
        </div>
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
        <small>{n}개</small>
      </div>
    </button>
  )
}
