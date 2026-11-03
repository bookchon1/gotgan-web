import { useMemo, useState } from 'react'
import { PageHead } from '../components/PageHead'
import { Icon } from '../components/Icon'
import { ErrorBanner, LoadingRow, EmptyRow } from '../components/States'
import { supabase } from '../lib/supabase'
import { useQuery } from '../lib/useQuery'
import { mmdd } from '../lib/format'
import type { GotganDocument, Employee } from '../types/db'

type Folder = 'all' | '개인' | '전사' | '선택'

const SCOPE_BADGE: Record<string, string> = {
  전사: 'badge green',
  선택: 'badge blue',
  개인: 'badge',
}

export default function Documents() {
  const [folder, setFolder] = useState<Folder>('all')
  const [q, setQ] = useState('')

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
          <button className="btn pri">
            <Icon name="approval" className="icon ic" /> 문서 만들기
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
                      <span className={SCOPE_BADGE[d.share_scope]}>{d.share_scope} 공유</span>
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
