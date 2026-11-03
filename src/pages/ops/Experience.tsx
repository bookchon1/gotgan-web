import { useMemo, useState } from 'react'
import { PageHead } from '../../components/PageHead'
import { ErrorBanner, LoadingRow, EmptyRow } from '../../components/States'
import { supabase } from '../../lib/supabase'
import { useQuery } from '../../lib/useQuery'
import type { ExperienceType } from '../../types/db'

/** 체험 · 체험현황 — 운영하는 체험의 대상·시간·정원·장소를 관리 */
export default function Experience() {
  const [addOpen, setAddOpen] = useState(false)

  const expQ = useQuery<ExperienceType[]>(
    async () =>
      await supabase
        .from('experience_types')
        .select('id,name,category,target,duration,capacity,place,active,memo')
        .order('name', { ascending: true }),
    [],
  )
  const rows = expQ.data ?? []

  const [cat, setCat] = useState('all')
  const [q, setQ] = useState('')

  // 분류 select — 등록된 분류에서 추출(없으면 빈 목록)
  const categories = useMemo(() => {
    const set = new Set<string>()
    for (const r of rows) if (r.category) set.add(r.category)
    return Array.from(set).sort()
  }, [rows])

  const list = useMemo(
    () =>
      rows.filter((r) => {
        if (cat !== 'all' && r.category !== cat) return false
        if (q.trim()) {
          const hay = [r.name, r.target, r.category].filter(Boolean).join(' ').toLowerCase()
          if (!hay.includes(q.trim().toLowerCase())) return false
        }
        return true
      }),
    [rows, cat, q],
  )

  async function toggleActive(row: ExperienceType) {
    const { error } = await supabase.from('experience_types').update({ active: !row.active }).eq('id', row.id)
    if (!error) expQ.reload()
  }

  const topBtn = (
    <button className="btn pri" onClick={() => setAddOpen(true)}>
      + 체험종류 등록
    </button>
  )

  return (
    <div className="page on">
      <PageHead eyebrow="체험" title="체험현황" desc="체험 프로그램 운영과 일정을 관리합니다." actions={topBtn} />
      <section className="panel">
        <ErrorBanner error={expQ.error} table="experience_types" />
        <div className="toolbar">
          <select className="sel" value={cat} onChange={(e) => setCat(e.target.value)}>
            <option value="all">전체 분류</option>
            {categories.map((c) => (
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
            <input placeholder="체험명·대상·분류 검색" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
        </div>
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>체험종류 / 분류</th>
                <th>대상</th>
                <th>소요 시간</th>
                <th>정원</th>
                <th>장소</th>
                <th>상태</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {expQ.loading && <LoadingRow cols={7} />}
              {!expQ.loading &&
                list.map((r) => (
                  <tr key={r.id} style={r.active ? undefined : { opacity: 0.55 }}>
                    <td>
                      <div className="t-title">{r.name}</div>
                      {r.category && <div className="t-sub">{r.category}</div>}
                    </td>
                    <td>{r.target ?? '—'}</td>
                    <td className="tnum">{r.duration ?? '—'}</td>
                    <td className="tnum">{r.capacity != null ? `${r.capacity}명` : '—'}</td>
                    <td>{r.place ?? '—'}</td>
                    <td>
                      {r.active ? (
                        <span className="chip c-done">
                          <i />
                          운영 중
                        </span>
                      ) : (
                        <span className="chip c-plan">
                          <i />
                          중지
                        </span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button className="btn sec" style={{ padding: '5px 10px' }} onClick={() => toggleActive(r)}>
                        {r.active ? '중지' : '운영'}
                      </button>
                    </td>
                  </tr>
                ))}
              {!expQ.loading && list.length === 0 && !expQ.error && (
                <EmptyRow cols={7} text="등록된 체험종류가 없습니다. '체험종류 등록'으로 추가하세요." />
              )}
            </tbody>
          </table>
        </div>
      </section>

      {addOpen && (
        <ExperienceModal
          onClose={() => setAddOpen(false)}
          onSaved={() => {
            setAddOpen(false)
            expQ.reload()
          }}
        />
      )}
    </div>
  )
}

// 체험종류 등록 모달
function ExperienceModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('')
  const [category, setCategory] = useState('전통미술·공예')
  const [target, setTarget] = useState('')
  const [duration, setDuration] = useState('')
  const [capacity, setCapacity] = useState<number>(10)
  const [place, setPlace] = useState('')
  const [memo, setMemo] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function save() {
    if (!name.trim()) {
      setErr('체험명을 입력하세요.')
      return
    }
    setBusy(true)
    setErr(null)
    const { error } = await supabase.from('experience_types').insert({
      name: name.trim(),
      category: category.trim() || null,
      target: target.trim() || null,
      duration: duration.trim() || null,
      capacity: Number(capacity) || null,
      place: place.trim() || null,
      active: true,
      memo: memo.trim() || null,
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
            <div className="eyebrow">체험 · 종류</div>
            <h3>체험종류 등록</h3>
          </div>
          <button className="x" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="mb">
          <div className="mfield">
            <label>체험명</label>
            <input
              className="ctl"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 단청 문양 그리기"
              autoFocus
            />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div className="mfield" style={{ flex: 1 }}>
              <label>분류</label>
              <input
                className="ctl"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="예: 전통미술·공예"
              />
            </div>
            <div className="mfield" style={{ flex: 1 }}>
              <label>대상</label>
              <input
                className="ctl"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder="예: 초등~성인"
              />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div className="mfield" style={{ flex: 1 }}>
              <label>소요시간</label>
              <input
                className="ctl"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                placeholder="예: 90분"
              />
            </div>
            <div className="mfield" style={{ width: 120 }}>
              <label>정원 (명)</label>
              <input
                className="ctl"
                type="number"
                min={1}
                value={capacity || ''}
                onChange={(e) => setCapacity(parseInt(e.target.value, 10) || 0)}
                placeholder="0"
              />
            </div>
            <div className="mfield" style={{ flex: 1 }}>
              <label>장소</label>
              <input
                className="ctl"
                value={place}
                onChange={(e) => setPlace(e.target.value)}
                placeholder="예: 체험실 1"
              />
            </div>
          </div>
          <div className="mfield">
            <label>메모</label>
            <input className="ctl" value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="준비물 등 (선택)" />
          </div>
          {err && (
            <div className="login-alert err" style={{ margin: 0 }}>
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
