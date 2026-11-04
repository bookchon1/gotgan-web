import { useMemo, useState } from 'react'
import { PageHead } from '../../components/PageHead'
import { ErrorBanner, LoadingRow, EmptyRow } from '../../components/States'
import { supabase } from '../../lib/supabase'
import { useQuery } from '../../lib/useQuery'
import { mmdd } from '../../lib/format'
import type { PromoActivity, Employee } from '../../types/db'

// 상태 → 칩 클래스/라벨 (시안: 제작 중 / 게시 완료 / 예정)
const ST_CHIP: Record<PromoActivity['status'], [string, string]> = {
  plan: ['c-plan', '예정'],
  prog: ['c-prog', '제작 중'],
  done: ['c-done', '게시 완료'],
}
const CHANNELS = ['인스타그램', '블로그', '보도자료', '유튜브', '기타']

/** 홍보 · 홍보현황 — 채널별 홍보활동·담당자·진행상태·게시 링크 */
export default function Promotion() {
  const [addOpen, setAddOpen] = useState(false)

  const promoQ = useQuery<PromoActivity[]>(
    async () =>
      await supabase
        .from('promo_activities')
        .select('id,title,channel,owner_id,start_date,end_date,status,link,memo')
        .order('start_date', { ascending: false }),
    [],
  )
  const empQ = useQuery<Pick<Employee, 'id' | 'name'>[]>(
    async () => await supabase.from('employees').select('id,name').order('name', { ascending: true }),
    [],
  )
  const empName = useMemo(() => Object.fromEntries((empQ.data ?? []).map((e) => [e.id, e.name])), [empQ.data])
  const employees = empQ.data ?? []
  const rows = promoQ.data ?? []

  const [channel, setChannel] = useState('all')
  const [status, setStatus] = useState('all')
  const [q, setQ] = useState('')

  const list = useMemo(
    () =>
      rows.filter((r) => {
        if (channel !== 'all' && r.channel !== channel) return false
        if (status !== 'all' && r.status !== status) return false
        if (q.trim()) {
          const hay = [r.title, r.channel, r.owner_id ? empName[r.owner_id] : '']
            .filter(Boolean)
            .join(' ')
            .toLowerCase()
          if (!hay.includes(q.trim().toLowerCase())) return false
        }
        return true
      }),
    [rows, channel, status, q, empName],
  )

  const topBtn = (
    <button className="btn txt add-txt" onClick={() => setAddOpen(true)}>
      + 홍보활동 등록
    </button>
  )

  return (
    <div className="page on">
      <PageHead eyebrow="홍보" title="홍보현황" desc="채널별 홍보활동과 게시 일정을 관리합니다." actions={topBtn} />
      <section className="panel">
        <ErrorBanner error={promoQ.error} table="promo_activities" />
        <div className="toolbar">
          <select className="sel" value={channel} onChange={(e) => setChannel(e.target.value)}>
            <option value="all">전체 채널</option>
            {CHANNELS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select className="sel" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">전체 상태</option>
            <option value="prog">제작 중</option>
            <option value="done">게시 완료</option>
            <option value="plan">예정</option>
          </select>
          <label className="search" style={{ marginLeft: 'auto' }}>
            <svg className="icon" width="15" height="15" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4-4" />
            </svg>
            <input placeholder="활동명·채널·담당자 검색" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
        </div>
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>홍보활동 / 채널</th>
                <th>담당자</th>
                <th>진행 기간</th>
                <th>상태</th>
                <th>게시 링크</th>
              </tr>
            </thead>
            <tbody>
              {promoQ.loading && <LoadingRow cols={5} />}
              {!promoQ.loading &&
                list.map((r) => {
                  const sc = ST_CHIP[r.status] ?? ST_CHIP.prog
                  const owner = r.owner_id ? empName[r.owner_id] ?? '—' : '—'
                  return (
                    <tr key={r.id}>
                      <td>
                        <div className="t-title">{r.title}</div>
                        {r.channel && <div className="t-sub">{r.channel}</div>}
                      </td>
                      <td>
                        <span className="owner">
                          <span className="av-s">{owner.slice(0, 1)}</span>
                          {owner}
                        </span>
                      </td>
                      <td className="tnum">
                        {r.start_date || r.end_date ? `${mmdd(r.start_date)}~${mmdd(r.end_date)}` : '—'}
                      </td>
                      <td>
                        <span className={`chip ${sc[0]}`}>
                          <i />
                          {sc[1]}
                        </span>
                      </td>
                      <td>
                        {r.link ? (
                          <a
                            className="btn txt"
                            style={{ padding: 0 }}
                            href={r.link}
                            target="_blank"
                            rel="noreferrer"
                          >
                            게시물 보기 ↗
                          </a>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  )
                })}
              {!promoQ.loading && list.length === 0 && !promoQ.error && (
                <EmptyRow cols={5} text="등록된 홍보활동이 없습니다. '홍보활동 등록'으로 추가하세요." />
              )}
            </tbody>
          </table>
        </div>
      </section>

      {addOpen && (
        <PromoModal
          employees={employees}
          onClose={() => setAddOpen(false)}
          onSaved={() => {
            setAddOpen(false)
            promoQ.reload()
          }}
        />
      )}
    </div>
  )
}

// 홍보활동 등록 모달
function PromoModal({
  employees,
  onClose,
  onSaved,
}: {
  employees: Pick<Employee, 'id' | 'name'>[]
  onClose: () => void
  onSaved: () => void
}) {
  const [title, setTitle] = useState('')
  const [channel, setChannel] = useState(CHANNELS[0])
  const [ownerId, setOwnerId] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [status, setStatus] = useState<PromoActivity['status']>('prog')
  const [link, setLink] = useState('')
  const [memo, setMemo] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function save() {
    if (!title.trim()) {
      setErr('홍보활동명을 입력하세요.')
      return
    }
    setBusy(true)
    setErr(null)
    const { error } = await supabase.from('promo_activities').insert({
      title: title.trim(),
      channel,
      owner_id: ownerId || null,
      start_date: startDate || null,
      end_date: endDate || null,
      status,
      link: link.trim() || null,
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
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
        <div className="mh">
          <div>
            <div className="eyebrow">홍보 · 활동</div>
            <h3>홍보활동 등록</h3>
          </div>
          <button className="x" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="mb">
          <div className="mfield">
            <label>활동명</label>
            <input
              className="ctl"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="예: 삼국유사 목판 복원 과정 연재"
              autoFocus
            />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div className="mfield" style={{ flex: 1 }}>
              <label>채널</label>
              <select className="ctl" value={channel} onChange={(e) => setChannel(e.target.value)}>
                {CHANNELS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="mfield" style={{ flex: 1 }}>
              <label>담당자</label>
              <select className="ctl" value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
                <option value="">미지정</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div className="mfield" style={{ flex: 1 }}>
              <label>시작일</label>
              <input className="ctl" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="mfield" style={{ flex: 1 }}>
              <label>종료일</label>
              <input className="ctl" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
            <div className="mfield" style={{ width: 120 }}>
              <label>상태</label>
              <select
                className="ctl"
                value={status}
                onChange={(e) => setStatus(e.target.value as PromoActivity['status'])}
              >
                <option value="prog">제작 중</option>
                <option value="done">게시 완료</option>
                <option value="plan">예정</option>
              </select>
            </div>
          </div>
          <div className="mfield">
            <label>게시 링크</label>
            <input
              className="ctl"
              type="url"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://"
            />
          </div>
          <div className="mfield">
            <label>메모</label>
            <input className="ctl" value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="(선택)" />
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
