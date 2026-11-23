import { Fragment, useState } from 'react'
import { ErrorBanner, LoadingRow, EmptyRow } from '../../components/States'
import { supabase } from '../../lib/supabase'
import { useQuery } from '../../lib/useQuery'
import type { Partner } from '../../types/db'

// ===================== 업체정보 (거래처) =====================
const PARTNER_KINDS = ['발주처', '협력업체', '공급처', '재무과', '학예사', '소장처', '자문위원', '기타']

type Form = {
  name: string
  kind: string
  person: string
  phone1: string
  phone2: string
  email: string
  biz_no: string
  address: string
  memo: string
}
const EMPTY: Form = { name: '', kind: PARTNER_KINDS[0], person: '', phone1: '', phone2: '', email: '', biz_no: '', address: '', memo: '' }
const toForm = (p: Partner): Form => ({
  name: p.name ?? '',
  kind: p.kind ?? PARTNER_KINDS[0],
  person: p.person ?? '',
  phone1: p.phone1 ?? '',
  phone2: p.phone2 ?? '',
  email: p.email ?? '',
  biz_no: p.biz_no ?? '',
  address: p.address ?? '',
  memo: p.memo ?? '',
})
const nn = (v: string) => v.trim() || null

/** 등록·수정 공용 인라인 폼 (팝업 없이 화면 안에서 펼침) */
function PartnerForm({
  initial,
  onSave,
  onCancel,
  onDelete,
  title,
}: {
  initial: Form
  onSave: (f: Form) => Promise<string | null>
  onCancel: () => void
  onDelete?: () => Promise<string | null>
  title: string
}) {
  const [f, setF] = useState<Form>(initial)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [confirmDel, setConfirmDel] = useState(false)
  const set = (k: keyof Form, v: string) => setF((o) => ({ ...o, [k]: v }))

  async function save() {
    if (!f.name.trim()) {
      setErr('거래처명을 입력하세요.')
      return
    }
    setBusy(true)
    setErr(null)
    const e = await onSave(f)
    setBusy(false)
    if (e) setErr(e)
  }
  async function del() {
    if (!onDelete) return
    if (!confirmDel) {
      setConfirmDel(true)
      return
    }
    setBusy(true)
    const e = await onDelete()
    setBusy(false)
    if (e) setErr(e)
  }

  const fld = (label: string, k: keyof Form, opt?: { ph?: string; span?: number; type?: string }) => (
    <label className="pf-f" style={opt?.span ? { gridColumn: `span ${opt.span}` } : undefined}>
      <span>{label}</span>
      <input
        className="hr-in"
        type={opt?.type ?? 'text'}
        value={f[k]}
        placeholder={opt?.ph}
        onChange={(e) => set(k, e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') save()
          if (e.key === 'Escape') onCancel()
        }}
      />
    </label>
  )

  return (
    <div className="pf">
      <div className="pf-h">{title}</div>
      <div className="pf-grid">
        {fld('거래처명 *', 'name', { span: 2 })}
        <label className="pf-f">
          <span>구분</span>
          <select className="hr-in" value={f.kind} onChange={(e) => set('kind', e.target.value)}>
            {[...new Set([...PARTNER_KINDS, f.kind])].map((k) => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
        </label>
        {fld('사업자번호', 'biz_no', {})}
        {fld('담당자', 'person', { span: 2 })}
        {fld('연락처1 (대표)', 'phone1', {})}
        {fld('연락처2', 'phone2')}
        {fld('이메일', 'email', { type: 'email', span: 2 })}
        {fld('주소', 'address', { span: 2 })}
        {fld('메모', 'memo', { span: 4 })}
      </div>
      {err && <div className="login-alert err" style={{ margin: '8px 0 0' }}>{err}</div>}
      <div className="pf-act">
        {onDelete && (
          <button className={`btn txt pf-del${confirmDel ? ' on' : ''}`} onClick={del} disabled={busy} onBlur={() => setConfirmDel(false)}>
            {confirmDel ? '정말 삭제' : '삭제'}
          </button>
        )}
        <span style={{ flex: 1 }} />
        <button className="btn sec" onClick={onCancel} disabled={busy}>취소</button>
        <button className="btn pri" onClick={save} disabled={busy || !f.name.trim()}>
          {busy ? '저장 중…' : '저장'}
        </button>
      </div>
    </div>
  )
}

export function PartnerView() {
  const [q, setQ] = useState('')
  const [kindF, setKindF] = useState('전체')
  const [openId, setOpenId] = useState<string | null>(null) // 펼쳐진(수정 중) 업체
  const [adding, setAdding] = useState(false)
  const ptnQ = useQuery<Partner[]>(
    async () => await supabase.from('partners').select('*').order('name', { ascending: true }),
    [],
  )
  const all = ptnQ.data ?? []
  const kinds = ['전체', ...new Set(all.map((p) => p.kind).filter((k): k is string => !!k))]
  const list = all.filter(
    (p) =>
      (kindF === '전체' || p.kind === kindF) &&
      (!q ||
        p.name.includes(q) ||
        (p.person ?? '').includes(q) ||
        (p.kind ?? '').includes(q) ||
        (p.phone1 ?? '').includes(q) ||
        (p.email ?? '').includes(q)),
  )

  const payload = (f: Form) => ({
    name: f.name.trim(),
    kind: nn(f.kind),
    person: nn(f.person),
    phone1: nn(f.phone1),
    phone2: nn(f.phone2),
    email: nn(f.email),
    biz_no: nn(f.biz_no),
    address: nn(f.address),
    memo: nn(f.memo),
  })

  async function create(f: Form): Promise<string | null> {
    const { error } = await supabase.from('partners').insert(payload(f))
    if (error) return error.message
    setAdding(false)
    ptnQ.reload()
    return null
  }
  async function update(id: string, f: Form): Promise<string | null> {
    const { data, error } = await supabase.from('partners').update(payload(f)).eq('id', id).select('id')
    if (error) return error.message
    if (!data || data.length === 0) return '저장되지 않았습니다 (수정 권한이 없을 수 있습니다)'
    setOpenId(null)
    ptnQ.reload()
    return null
  }
  async function remove(id: string): Promise<string | null> {
    const { data, error } = await supabase.from('partners').delete().eq('id', id).select('id')
    if (error) return error.message
    if (!data || data.length === 0) return '삭제되지 않았습니다 (권한이 없을 수 있습니다)'
    setOpenId(null)
    ptnQ.reload()
    return null
  }

  return (
    <section className="panel">
      <ErrorBanner error={ptnQ.error} table="partners" />
      <div className="toolbar">
        <h2 style={{ fontSize: 15, fontWeight: 800 }}>
          업체정보 <span className="count">{ptnQ.loading ? '…' : list.length}</span>
        </h2>
        <div className="r" style={{ display: 'flex', gap: 8, marginLeft: 'auto', alignItems: 'center', flexWrap: 'wrap' }}>
          <select className="hr-in" style={{ width: 110 }} value={kindF} onChange={(e) => setKindF(e.target.value)} aria-label="구분 필터">
            {kinds.map((k) => (
              <option key={k} value={k}>{k === '전체' ? '구분 전체' : k}</option>
            ))}
          </select>
          <label className="search">
            <svg className="icon" width="16" height="16" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4-4" />
            </svg>
            <input placeholder="검색" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <button
            className="btn pri"
            style={{ padding: '6px 14px', fontSize: 12.5 }}
            onClick={() => {
              setAdding((v) => !v)
              setOpenId(null)
            }}
          >
            {adding ? '닫기' : '+ 업체 등록'}
          </button>
        </div>
      </div>

      {adding && (
        <PartnerForm title="새 업체 등록" initial={EMPTY} onSave={create} onCancel={() => setAdding(false)} />
      )}

      <div className="tbl-wrap">
        <table>
          <thead>
            <tr>
              <th>거래처명</th>
              <th>구분</th>
              <th>담당자</th>
              <th>연락처1</th>
              <th>이메일</th>
              <th>사업자번호</th>
            </tr>
          </thead>
          <tbody>
            {ptnQ.loading && <LoadingRow cols={6} />}
            {!ptnQ.loading &&
              list.map((p) => {
                const on = openId === p.id
                return (
                  <Fragment key={p.id}>
                    <tr
                      className={on ? 'pf-row on' : 'pf-row'}
                      style={{ cursor: 'pointer' }}
                      onClick={() => {
                        setOpenId(on ? null : p.id)
                        setAdding(false)
                      }}
                    >
                      <td><b>{p.name}</b></td>
                      <td className="t-sub">{p.kind || '—'}</td>
                      <td>{p.person || '—'}</td>
                      <td className="tnum">{p.phone1 || '—'}</td>
                      <td className="t-sub">{p.email || '—'}</td>
                      <td className="tnum">{p.biz_no || '—'}</td>
                    </tr>
                    {on && (
                      <tr className="pf-edit">
                        <td colSpan={6}>
                          <PartnerForm
                            title="업체 정보 수정"
                            initial={toForm(p)}
                            onSave={(f) => update(p.id, f)}
                            onCancel={() => setOpenId(null)}
                            onDelete={() => remove(p.id)}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            {!ptnQ.loading && list.length === 0 && <EmptyRow cols={6} text="등록된 업체가 없습니다." />}
          </tbody>
        </table>
      </div>
    </section>
  )
}
