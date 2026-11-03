import { useMemo, useState } from 'react'
import { ErrorBanner, LoadingRow, EmptyRow } from '../../components/States'
import { supabase } from '../../lib/supabase'
import { useQuery } from '../../lib/useQuery'
import { eok, won, dateOnly } from '../../lib/format'
import type { Approval, AcctCard, Partner, Employee } from '../../types/db'

// ===================== 접수 대기 =====================
// 승인된 지출결의서(회계접수 전) → 전표 생성
export function InboxView({ onPosted }: { onPosted: () => void }) {
  const [busy, setBusy] = useState(false)
  const apprQ = useQuery<Approval[]>(
    async () =>
      await supabase
        .from('approvals')
        .select('*')
        .eq('kind', '지출결의서')
        .eq('status', '승인')
        .order('req_date', { ascending: false }),
    [],
  )
  const empQ = useQuery<Pick<Employee, 'id' | 'name'>[]>(
    async () => await supabase.from('employees').select('id,name'),
    [],
  )
  const empName = useMemo(() => Object.fromEntries((empQ.data ?? []).map((e) => [e.id, e.name])), [empQ.data])
  const list = apprQ.data ?? []

  async function post(a: Approval) {
    setBusy(true)
    // 전표 생성 + 결재 상태 회계접수
    await supabase.from('acct_tx').insert({
      date: new Date().toISOString().slice(0, 10),
      biz_code: a.biz_code ?? '법인',
      dept_key: a.dept_key,
      tx_type: '지출',
      account: a.account,
      amount: a.amount,
      memo: a.title ?? a.memo,
      project_id: a.project_id,
      budget_item: a.budget_item,
      src: '결의서',
      year: new Date().getFullYear(),
    })
    await supabase.from('approvals').update({ status: '회계접수' }).eq('id', a.id)
    setBusy(false)
    apprQ.reload()
    onPosted()
  }

  return (
    <section className="panel" style={{ borderColor: 'var(--gold)' }}>
      <ErrorBanner error={apprQ.error} table="approvals" />
      <div className="panel-h">
        <div>
          <h2>
            회계 접수 대기 <span className="count">{apprQ.loading ? '…' : list.length}</span>
          </h2>
        </div>
      </div>
      <div className="tbl-wrap">
        <table>
          <thead>
            <tr>
              <th>문서 / 기안자</th>
              <th>사업자·부서</th>
              <th style={{ textAlign: 'right' }}>승인 금액</th>
              <th>계정과목</th>
              <th style={{ textAlign: 'right' }}>접수</th>
            </tr>
          </thead>
          <tbody>
            {apprQ.loading && <LoadingRow cols={5} />}
            {!apprQ.loading &&
              list.map((a) => (
                <tr key={a.id}>
                  <td>
                    <div className="t-title">{a.title || a.memo}</div>
                    <div className="t-sub">
                      {a.doc_no} · {a.drafter_id ? empName[a.drafter_id] ?? '' : ''}
                    </div>
                  </td>
                  <td>
                    <span className="chip inc" style={{ fontSize: 10 }}>
                      {a.biz_code} · {a.dept_key}
                    </span>
                  </td>
                  <td className="tnum" style={{ textAlign: 'right', fontWeight: 700 }}>
                    {a.amount ? eok(a.amount) : '—'}
                  </td>
                  <td>
                    <span className="badge">{a.account}</span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="btn pri" style={{ padding: '6px 13px' }} onClick={() => post(a)} disabled={busy}>
                      접수 · 전표 생성
                    </button>
                  </td>
                </tr>
              ))}
            {!apprQ.loading && list.length === 0 && <EmptyRow cols={5} text="접수할 결의서가 없습니다." />}
          </tbody>
        </table>
      </div>
      <p className="sec-mini" style={{ marginTop: 10 }}>
        승인된 지출결의서를 접수하면 <b>지출 전표</b>가 생성되어 자금현황·전표내역에 반영됩니다.
      </p>
    </section>
  )
}

// ===================== 법인카드 =====================
const CARD_ACCOUNTS = ['차량유지비', '복리후생비', '재료비', '소모품비', '접대비', '통신비', '여비교통비', '지급수수료', '미지정']

export function CardView({ onPosted }: { onPosted: () => void }) {
  const [busy, setBusy] = useState(false)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [acct, setAcct] = useState<Record<string, string>>({})
  const cardQ = useQuery<AcctCard[]>(
    async () => await supabase.from('acct_cards').select('*').order('date', { ascending: false }),
    [],
  )
  const cards = cardQ.data ?? []
  const pending = cards.filter((c) => !c.matched)

  // 집계
  const byAccount = useMemo(() => {
    const m: Record<string, number> = {}
    for (const c of cards) m[c.account || '미지정'] = (m[c.account || '미지정'] || 0) + (Number(c.amount) || 0)
    return m
  }, [cards])
  const total = cards.reduce((s, c) => s + (Number(c.amount) || 0), 0)

  const selTotal = pending.filter((c) => sel.has(c.id)).reduce((s, c) => s + (Number(c.amount) || 0), 0)

  async function process() {
    if (sel.size === 0) return
    setBusy(true)
    for (const c of pending.filter((x) => sel.has(x.id))) {
      const account = acct[c.id] || c.account || '미지정'
      await supabase.from('acct_tx').insert({
        date: c.date,
        biz_code: '법인',
        dept_key: 'management',
        tx_type: '지출',
        account,
        amount: c.amount,
        partner: c.shop,
        memo: c.memo,
        src: '카드',
        year: new Date(c.date).getFullYear(),
      })
      await supabase.from('acct_cards').update({ matched: true, account }).eq('id', c.id)
    }
    setBusy(false)
    setSel(new Set())
    cardQ.reload()
    onPosted()
  }

  return (
    <section className="panel">
      <ErrorBanner error={cardQ.error} table="acct_cards" />
      {/* 집계 카드 */}
      <div className="stats" style={{ marginBottom: 14 }}>
        {Object.entries(byAccount)
          .slice(0, 3)
          .map(([acc, amt]) => (
            <div className="stat" key={acc}>
              <div>
                <div className="lbl">{acc}</div>
                <div className="val tnum" style={{ fontSize: 18 }}>
                  {eok(amt)}
                </div>
              </div>
            </div>
          ))}
        <div className="stat dark">
          <div>
            <div className="lbl">카드 합계</div>
            <div className="val tnum" style={{ fontSize: 18 }}>
              {won(total)}
            </div>
          </div>
        </div>
      </div>

      <div className="panel-h">
        <div>
          <h2>
            법인카드 내역 <span className="count">{cardQ.loading ? '…' : cards.length}</span>
          </h2>
        </div>
      </div>
      <div className="tbl-wrap">
        <table>
          <thead>
            <tr>
              <th style={{ width: 28 }} />
              <th>결제일</th>
              <th>가맹점</th>
              <th style={{ textAlign: 'right' }}>금액</th>
              <th>계정과목</th>
              <th>상태</th>
            </tr>
          </thead>
          <tbody>
            {cardQ.loading && <LoadingRow cols={6} />}
            {!cardQ.loading &&
              cards.map((c) => {
                const done = c.matched
                return (
                  <tr key={c.id} style={done ? { opacity: 0.55 } : undefined}>
                    <td>
                      {!done && (
                        <input
                          type="checkbox"
                          checked={sel.has(c.id)}
                          onChange={(e) =>
                            setSel((s) => {
                              const n = new Set(s)
                              if (e.target.checked) n.add(c.id)
                              else n.delete(c.id)
                              return n
                            })
                          }
                        />
                      )}
                    </td>
                    <td className="tnum" style={{ color: 'var(--muted)' }}>
                      {dateOnly(c.date)}
                    </td>
                    <td>
                      <div className="t-title">{c.shop}</div>
                      <div className="t-sub">{c.memo}</div>
                    </td>
                    <td className="tnum" style={{ textAlign: 'right', color: 'var(--expense)' }}>
                      {won(c.amount)}
                    </td>
                    <td>
                      {done ? (
                        <span className="badge">{c.account}</span>
                      ) : (
                        <select
                          className="sel"
                          style={{ padding: '3px 6px', fontSize: 11 }}
                          value={acct[c.id] ?? c.account ?? '미지정'}
                          onChange={(e) => setAcct((a) => ({ ...a, [c.id]: e.target.value }))}
                        >
                          {CARD_ACCOUNTS.map((a) => (
                            <option key={a} value={a}>
                              {a}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td>
                      {done ? (
                        <span className="chip c-done">
                          <i />
                          전표완료
                        </span>
                      ) : (
                        <span className="chip set-hold">
                          <i />
                          미처리
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            {!cardQ.loading && cards.length === 0 && <EmptyRow cols={6} text="카드 내역이 없습니다." />}
          </tbody>
        </table>
      </div>
      {pending.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, flexWrap: 'wrap', gap: 10 }}>
          <span className="sec-mini" style={{ margin: 0 }}>
            선택 {sel.size}건 · {won(selTotal)}원
          </span>
          <button className="btn pri" onClick={process} disabled={busy || sel.size === 0}>
            {busy ? '처리 중…' : '선택 항목 전표 생성'}
          </button>
        </div>
      )}
    </section>
  )
}

// ===================== 거래처 =====================
export function PartnerView() {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<Partner | null>(null)
  const ptnQ = useQuery<Partner[]>(
    async () => await supabase.from('partners').select('*').order('name', { ascending: true }),
    [],
  )
  const list = (ptnQ.data ?? []).filter((p) => !q || p.name.includes(q))

  return (
    <section className="panel">
      <ErrorBanner error={ptnQ.error} table="partners" />
      <div className="toolbar">
        <h2 style={{ fontSize: 15, fontWeight: 800 }}>
          거래처 <span className="count">{ptnQ.loading ? '…' : list.length}</span>
        </h2>
        <label className="search r" style={{ marginLeft: 'auto' }}>
          <svg className="icon" width="16" height="16" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4-4" />
          </svg>
          <input placeholder="거래처명 검색" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
      </div>
      <div className="tbl-wrap">
        <table>
          <thead>
            <tr>
              <th>거래처명</th>
              <th>사업자번호</th>
              <th>구분</th>
              <th>메모</th>
            </tr>
          </thead>
          <tbody>
            {ptnQ.loading && <LoadingRow cols={4} />}
            {!ptnQ.loading &&
              list.map((p) => (
                <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => setOpen(p)}>
                  <td>
                    <b>{p.name}</b>
                  </td>
                  <td className="tnum">{p.biz_no || '—'}</td>
                  <td>{p.kind ? <span className="badge">{p.kind}</span> : '—'}</td>
                  <td className="t-sub">{p.memo || '—'}</td>
                </tr>
              ))}
            {!ptnQ.loading && list.length === 0 && <EmptyRow cols={4} text="거래처가 없습니다." />}
          </tbody>
        </table>
      </div>

      {open && (
        <div className="modal-bg" onClick={() => setOpen(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="mh">
              <div>
                <div className="eyebrow">거래처 정보</div>
                <h3>{open.name}</h3>
              </div>
              <button className="x" onClick={() => setOpen(null)}>
                ✕
              </button>
            </div>
            <div className="mb">
              <Row label="사업자번호" v={open.biz_no} />
              <Row label="구분" v={open.kind} />
              <Row label="메모" v={open.memo} />
            </div>
            <div className="mf">
              <button className="btn sec" onClick={() => setOpen(null)}>
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

function Row({ label, v }: { label: string; v: string | null }) {
  return (
    <div className="mfield">
      <label>{label}</label>
      <div style={{ fontSize: 13, color: 'var(--ink)' }}>{v || '—'}</div>
    </div>
  )
}
