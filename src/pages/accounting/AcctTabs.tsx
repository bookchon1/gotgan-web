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
  const [uploadOpen, setUploadOpen] = useState(false)
  const cardQ = useQuery<AcctCard[]>(
    async () => await supabase.from('acct_cards').select('*').order('date', { ascending: false }),
    [],
  )
  const cards = cardQ.data ?? []
  const pending = cards.filter((c) => !c.matched)

  // 카드 분석 4종: 카드 구분별 / 카드사별 / 계정과목별 / 합계
  const ana = useMemo(() => {
    const byCard: Record<string, number> = {}
    const byBank: Record<string, number> = {}
    const byAcct: Record<string, number> = {}
    let total = 0
    for (const c of cards) {
      const amt = Number(c.amount) || 0
      total += amt
      byCard[c.card || '카드'] = (byCard[c.card || '카드'] || 0) + amt
      byBank[c.bank || '미지정'] = (byBank[c.bank || '미지정'] || 0) + amt
      byAcct[c.account || '미지정'] = (byAcct[c.account || '미지정'] || 0) + amt
    }
    return { byCard, byBank, byAcct, total }
  }, [cards])

  const selTotal = pending.filter((c) => sel.has(c.id)).reduce((s, c) => s + (Number(c.amount) || 0), 0)

  async function process() {
    if (sel.size === 0) return
    const chosen = pending.filter((x) => sel.has(x.id))
    if (chosen.some((c) => (acct[c.id] || c.account || '미지정') === '미지정')) {
      alert('계정과목이 "미지정"인 건이 있습니다. 먼저 지정해 주세요.')
      return
    }
    setBusy(true)
    for (const c of chosen) {
      const account = acct[c.id] || c.account || '미지정'
      await supabase.from('acct_tx').insert({
        date: c.date,
        biz_code: '법인',
        dept_key: 'management',
        tx_type: '지출',
        account,
        amount: c.amount,
        partner: c.shop,
        memo: `[카드] ${c.bank ?? ''} ${c.memo ?? ''}`.trim(),
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
      <div className="panel-h">
        <div>
          <h2>
            법인카드 내역 <span className="count">{cardQ.loading ? '…' : cards.length}</span>
          </h2>
          <p>카드사 엑셀 업로드 → 결제일·가맹점·금액 발췌 → 계정 설정 → 전표 처리</p>
        </div>
        <div className="r" style={{ display: 'flex', gap: 8 }}>
          <button className="btn sec" onClick={downloadCardTemplate}>
            양식 다운로드
          </button>
          <button className="btn pri" onClick={() => setUploadOpen(true)}>
            내역 업로드
          </button>
        </div>
      </div>

      {/* 카드 분석 4종 */}
      <div className="card-ana" style={{ marginBottom: 14 }}>
        <AnaBlock title="카드 구분별" obj={ana.byCard} />
        <AnaBlock title="카드사별" obj={ana.byBank} />
        <AnaBlock title="계정과목별" obj={ana.byAcct} />
        <div className="card" style={{ margin: 0, padding: '14px 16px', background: 'var(--brand)', color: '#fff', borderColor: 'transparent' }}>
          <div style={{ fontSize: 11, fontWeight: 800, opacity: 0.75, marginBottom: 7 }}>합계</div>
          <div className="tnum" style={{ fontSize: 22, fontWeight: 800 }}>₩{won(ana.total)}</div>
          <div style={{ fontSize: 11, opacity: 0.8, marginTop: 2 }}>카드 사용 총액</div>
        </div>
      </div>

      <div className="tbl-wrap">
        <table style={{ fontSize: 12.5 }}>
          <thead>
            <tr>
              <th style={{ width: 28 }} />
              <th style={{ whiteSpace: 'nowrap' }}>결제일</th>
              <th style={{ whiteSpace: 'nowrap' }}>카드</th>
              <th>가맹점</th>
              <th style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>금액</th>
              <th style={{ whiteSpace: 'nowrap' }}>계정과목</th>
              <th>적요</th>
              <th style={{ whiteSpace: 'nowrap' }}>상태</th>
            </tr>
          </thead>
          <tbody>
            {cardQ.loading && <LoadingRow cols={8} />}
            {!cardQ.loading &&
              cards.map((c) => {
                const done = c.matched
                return (
                  <tr key={c.id} style={done ? { opacity: 0.55 } : undefined}>
                    <td style={{ textAlign: 'center' }}>
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
                    <td className="tnum" style={{ color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                      {dateOnly(c.date)}
                    </td>
                    <td>
                      <span className="badge" style={{ fontSize: 10 }}>{c.bank || c.card || '카드'}</span>
                    </td>
                    <td>{c.shop}</td>
                    <td className="tnum" style={{ textAlign: 'right', fontWeight: 700, color: 'var(--expense)' }}>
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
                    <td className="t-sub">{c.memo || '—'}</td>
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
            {!cardQ.loading && cards.length === 0 && <EmptyRow cols={8} text="카드 내역이 없습니다. '내역 업로드'로 카드사 엑셀을 올리세요." />}
          </tbody>
        </table>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginTop: 14, flexWrap: 'wrap' }}>
        <span className="sec-mini" style={{ margin: 0 }}>
          {sel.size > 0
            ? `선택 ${sel.size}건 · ₩${won(selTotal)} → 지출 전표로 처리`
            : '가맹점으로 계정을 지정한 뒤 선택 항목을 전표로 처리하세요.'}
        </span>
        <button className="btn pri" onClick={process} disabled={busy || sel.size === 0}>
          {busy ? '처리 중…' : '선택 항목 전표 처리 →'}
        </button>
      </div>

      {uploadOpen && (
        <CardUploadModal
          onClose={() => setUploadOpen(false)}
          onUploaded={() => {
            cardQ.reload()
            setUploadOpen(false)
          }}
        />
      )}
    </section>
  )
}

// 카드 분석 블록 (항목별 합계, 금액 내림차순)
function AnaBlock({ title, obj }: { title: string; obj: Record<string, number> }) {
  const items = Object.keys(obj).sort((a, b) => obj[b] - obj[a])
  return (
    <div className="card" style={{ margin: 0, padding: '14px 16px' }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--muted)', letterSpacing: '.04em', marginBottom: 7 }}>{title}</div>
      {items.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>—</div>
      ) : (
        items.map((k) => (
          <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '3px 0' }}>
            <span>{k}</span>
            <b className="tnum">{won(obj[k])}</b>
          </div>
        ))
      )}
    </div>
  )
}

// 표준 카드내역 CSV 양식 다운로드
function downloadCardTemplate() {
  const head = ['결제일(YYYY-MM-DD)', '카드사', '가맹점', '금액', '적요']
  const sample = ['2026-10-18', '신한카드', '한국미술재료상사', '1200000', '안료 구매']
  const csv = '﻿' + [head, sample].map((r) => r.map((c) => `"${c}"`).join(',')).join('\r\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = '법인카드_내역_양식.csv'
  a.click()
  URL.revokeObjectURL(url)
}

// 카드내역 업로드 — CSV 텍스트 붙여넣기/파일. 열 순서: 결제일,카드사,가맹점,금액,적요
type ParsedCard = { date: string; bank: string; shop: string; amount: number; memo: string; ok: boolean }
function parseCardCsv(text: string): ParsedCard[] {
  const rows: ParsedCard[] = []
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  for (const line of lines) {
    // 쉼표 또는 탭 구분, 따옴표 제거
    const cells = line.split(/\t|,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map((c) => c.replace(/^"|"$/g, '').trim())
    const rawDate = cells[0] ?? ''
    // 헤더/안내 줄 건너뛰기
    if (/결제일|날짜|date/i.test(rawDate)) continue
    const d = rawDate.replace(/[./]/g, '-').replace(/-(\d)(?=-|$)/g, '-0$1')
    const dateOk = /^\d{4}-\d{2}-\d{2}$/.test(d)
    const amount = parseInt((cells[3] ?? '').replace(/[^0-9-]/g, ''), 10) || 0
    rows.push({
      date: d,
      bank: cells[1] ?? '',
      shop: cells[2] ?? '',
      amount,
      memo: cells[4] ?? '',
      ok: dateOk && amount > 0,
    })
  }
  return rows
}

function CardUploadModal({ onClose, onUploaded }: { onClose: () => void; onUploaded: () => void }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const rows = useMemo(() => parseCardCsv(text), [text])
  const valid = rows.filter((r) => r.ok)

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    const reader = new FileReader()
    reader.onload = () => setText(String(reader.result ?? ''))
    reader.readAsText(f, 'utf-8')
  }

  async function save() {
    if (valid.length === 0) {
      setErr('올바른 행이 없습니다. 열 순서(결제일·카드사·가맹점·금액·적요)를 확인하세요.')
      return
    }
    setBusy(true)
    setErr(null)
    const payload = valid.map((r) => ({
      date: r.date,
      card: '법인카드',
      bank: r.bank || null,
      shop: r.shop || null,
      amount: r.amount,
      memo: r.memo || null,
      matched: false,
    }))
    const { error } = await supabase.from('acct_cards').insert(payload)
    setBusy(false)
    if (error) {
      setErr(error.message)
      return
    }
    onUploaded()
  }

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 680 }}>
        <div className="mh">
          <div>
            <div className="eyebrow">법인카드 · 내역 업로드</div>
            <h3>카드내역 업로드</h3>
          </div>
          <button className="x" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="mb">
          <div className="sec-mini" style={{ margin: '0 0 8px' }}>
            카드사 엑셀을 <b>CSV로 저장</b>하거나, 셀을 복사해 아래에 붙여넣으세요. 열 순서는{' '}
            <b>결제일 · 카드사 · 가맹점 · 금액 · 적요</b> 입니다. (헤더 줄은 자동으로 건너뜁니다)
          </div>
          <div className="mfield">
            <label>CSV 파일</label>
            <input className="ctl" type="file" accept=".csv,text/csv,text/plain" onChange={onFile} />
          </div>
          <div className="mfield">
            <label>또는 붙여넣기</label>
            <textarea
              className="ctl"
              rows={6}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={'2026-10-18,신한카드,한국미술재료상사,1200000,안료 구매\n2026-10-14,국민카드,북촌지류,800000,한지 구매'}
              style={{ fontFamily: 'monospace', fontSize: 12 }}
            />
          </div>

          {rows.length > 0 && (
            <div className="tbl-wrap" style={{ maxHeight: 240, overflow: 'auto' }}>
              <table style={{ fontSize: 12 }}>
                <thead>
                  <tr>
                    <th>결제일</th>
                    <th>카드사</th>
                    <th>가맹점</th>
                    <th style={{ textAlign: 'right' }}>금액</th>
                    <th>적요</th>
                    <th>확인</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 100).map((r, i) => (
                    <tr key={i} style={r.ok ? undefined : { background: 'var(--danger-soft, #fde8e8)' }}>
                      <td className="tnum">{r.date || '—'}</td>
                      <td>{r.bank || '—'}</td>
                      <td>{r.shop || '—'}</td>
                      <td className="tnum" style={{ textAlign: 'right' }}>{r.amount ? won(r.amount) : '—'}</td>
                      <td className="t-sub">{r.memo || '—'}</td>
                      <td>{r.ok ? '✓' : <span style={{ color: 'var(--danger)' }}>오류</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {rows.length > 0 && (
            <div className="sec-mini" style={{ margin: '8px 0 0' }}>
              총 {rows.length}행 · 정상 <b>{valid.length}건</b>
              {rows.length - valid.length > 0 ? ` · 오류 ${rows.length - valid.length}건(제외)` : ''}
            </div>
          )}

          {err && <div className="login-alert err" style={{ margin: '8px 0 0' }}>{err}</div>}
        </div>
        <div className="mf">
          <button className="btn sec" onClick={onClose} disabled={busy}>
            취소
          </button>
          <button className="btn pri" onClick={save} disabled={busy || valid.length === 0}>
            {busy ? '업로드 중…' : `${valid.length}건 업로드`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ===================== 거래처 =====================
const PARTNER_KINDS = ['발주처', '협력업체', '공급처', '기타']

export function PartnerView() {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<Partner | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const ptnQ = useQuery<Partner[]>(
    async () => await supabase.from('partners').select('*').order('name', { ascending: true }),
    [],
  )
  const list = (ptnQ.data ?? []).filter(
    (p) => !q || p.name.includes(q) || (p.person ?? '').includes(q),
  )

  return (
    <section className="panel">
      <ErrorBanner error={ptnQ.error} table="partners" />
      <div className="toolbar">
        <h2 style={{ fontSize: 15, fontWeight: 800 }}>
          거래처 <span className="count">{ptnQ.loading ? '…' : list.length}</span>
        </h2>
        <div className="r" style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
          <label className="search">
            <svg className="icon" width="16" height="16" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4-4" />
            </svg>
            <input placeholder="업체명·담당자 검색" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <button className="btn txt add-txt" onClick={() => setAddOpen(true)}>
            + 업체 등록
          </button>
        </div>
      </div>
      <div className="tbl-wrap">
        <table>
          <thead>
            <tr>
              <th>거래처명</th>
              <th>담당자</th>
              <th>직책</th>
              <th>연락처1</th>
              <th>이메일</th>
              <th>사업자번호</th>
            </tr>
          </thead>
          <tbody>
            {ptnQ.loading && <LoadingRow cols={6} />}
            {!ptnQ.loading &&
              list.map((p) => (
                <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => setOpen(p)}>
                  <td>
                    <b>{p.name}</b>
                  </td>
                  <td>{p.person || '—'}</td>
                  <td className="t-sub">{p.title || '—'}</td>
                  <td className="tnum">{p.phone1 || '—'}</td>
                  <td className="t-sub">{p.email || '—'}</td>
                  <td className="tnum">{p.biz_no || '—'}</td>
                </tr>
              ))}
            {!ptnQ.loading && list.length === 0 && <EmptyRow cols={6} text="거래처가 없습니다." />}
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
              <Row label="담당자" v={open.person} />
              <Row label="직책" v={open.title} />
              <Row label="연락처1" v={open.phone1} />
              <Row label="연락처2" v={open.phone2} />
              <Row label="이메일" v={open.email} />
              <Row label="주소" v={open.address} />
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

      {addOpen && (
        <PartnerAddModal
          onClose={() => setAddOpen(false)}
          onCreated={() => {
            ptnQ.reload()
            setAddOpen(false)
          }}
        />
      )}
    </section>
  )
}

// 업체 등록 모달
function PartnerAddModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('')
  const [person, setPerson] = useState('')
  const [title, setTitle] = useState('')
  const [phone1, setPhone1] = useState('')
  const [phone2, setPhone2] = useState('')
  const [email, setEmail] = useState('')
  const [address, setAddress] = useState('')
  const [bizNo, setBizNo] = useState('')
  const [kind, setKind] = useState(PARTNER_KINDS[0])
  const [memo, setMemo] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function save() {
    if (!name.trim()) {
      setErr('거래처명을 입력하세요.')
      return
    }
    setBusy(true)
    setErr(null)
    const { error } = await supabase.from('partners').insert({
      name: name.trim(),
      person: person || null,
      title: title || null,
      phone1: phone1 || null,
      phone2: phone2 || null,
      email: email || null,
      address: address || null,
      biz_no: bizNo || null,
      kind,
      memo: memo || null,
    })
    setBusy(false)
    if (error) {
      setErr(error.message)
      return
    }
    onCreated()
  }

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="mh">
          <div>
            <div className="eyebrow">업체 등록</div>
            <h3>거래처 추가</h3>
          </div>
          <button className="x" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="mb">
          <div className="mfield">
            <label>거래처명</label>
            <input className="ctl" value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 국립경주박물관" autoFocus />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div className="mfield" style={{ flex: 1 }}>
              <label>담당자</label>
              <input className="ctl" value={person} onChange={(e) => setPerson(e.target.value)} />
            </div>
            <div className="mfield" style={{ flex: 1 }}>
              <label>직책</label>
              <input className="ctl" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div className="mfield" style={{ flex: 1 }}>
              <label>연락처1(대표)</label>
              <input className="ctl" value={phone1} onChange={(e) => setPhone1(e.target.value)} />
            </div>
            <div className="mfield" style={{ flex: 1 }}>
              <label>연락처2</label>
              <input className="ctl" value={phone2} onChange={(e) => setPhone2(e.target.value)} />
            </div>
          </div>
          <div className="mfield">
            <label>이메일</label>
            <input className="ctl" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="mfield">
            <label>주소</label>
            <input className="ctl" value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div className="mfield" style={{ flex: 1 }}>
              <label>사업자번호</label>
              <input className="ctl" value={bizNo} onChange={(e) => setBizNo(e.target.value)} placeholder="000-00-00000" />
            </div>
            <div className="mfield" style={{ width: 140 }}>
              <label>구분</label>
              <select className="ctl" value={kind} onChange={(e) => setKind(e.target.value)}>
                {PARTNER_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="mfield">
            <label>메모</label>
            <input className="ctl" value={memo} onChange={(e) => setMemo(e.target.value)} />
          </div>

          {err && <div className="login-alert err" style={{ margin: 0 }}>{err}</div>}
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

function Row({ label, v }: { label: string; v: string | null }) {
  return (
    <div className="mfield">
      <label>{label}</label>
      <div style={{ fontSize: 13, color: 'var(--ink)' }}>{v || '—'}</div>
    </div>
  )
}
