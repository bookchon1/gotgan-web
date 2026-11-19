import { useEffect, useState } from 'react'
import { won } from '../lib/format'
import { supabase } from '../lib/supabase'
import { bizShort, deptLabel } from '../data/areas'
import type { Approval, ApprovalLine } from '../types/db'

/** 본문 텍스트의 http(s) 주소를 눌러 열 수 있게 */
export function Linkified({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s<>"']+)/g)
  return (
    <>
      {parts.map((p, i) =>
        /^https?:\/\//.test(p) ? (
          <a key={i} href={p} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--brand-ink)', textDecoration: 'underline' }}>
            {p}
          </a>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  )
}

export interface Row { name: string; qty: string; unit: string; price: string; amount: string; link?: string }
/** 재고 품의서 본문("1. 품목 · 3개 × 1,000원 = 3,000원 / 구매링크: …")을 표로 분해. 형식이 다르면 null */
export function parseOrder(memo: string): { reason: string; rows: Row[]; total: string } | null {
  const rows: Row[] = []
  const reason: string[] = []
  let total = ''
  for (const raw of memo.split('\n')) {
    const t = raw.trim()
    if (!t) continue
    const m = t.match(/^\d+\.\s+(.+?)\s·\s([\d,]+)(\S*)\s×\s([\d,]+)원\s=\s([\d,]+)원$/)
    if (m) {
      rows.push({ name: m[1], qty: m[2], unit: m[3], price: m[4], amount: m[5] })
      continue
    }
    const l = t.match(/^구매링크:\s*(https?:\/\/\S+)$/)
    if (l && rows.length) {
      rows[rows.length - 1].link = l[1]
      continue
    }
    const sum = t.match(/^합계\s+([\d,]+)원$/)
    if (sum) {
      total = sum[1]
      continue
    }
    if (!rows.length) reason.push(t)
    else return null // 표 뒤에 알 수 없는 줄이 있으면 원문 그대로 보여준다
  }
  return rows.length ? { reason: reason.join('\n'), rows, total } : null
}
export interface FeeRow { name: string; org: string; amount: string }
/** 자문비 품의 본문("1. 이름 (소속) · 300,000원 … 합계 N원")을 대상자별 표로 분해. 형식이 다르면 null */
export function parseFees(memo: string): { title: string; rows: FeeRow[]; total: string } | null {
  const rows: FeeRow[] = []
  const head: string[] = []
  let total = ''
  for (const raw of memo.split('\n')) {
    const t = raw.trim()
    if (!t) continue
    const m = t.match(/^\d+\.\s+(.+?)(?:\s\((.+)\))?\s·\s([\d,]+)원$/)
    if (m) {
      rows.push({ name: m[1], org: m[2] ?? '', amount: m[3] })
      continue
    }
    const sum = t.match(/^합계\s+([\d,]+)원$/)
    if (sum) {
      total = sum[1]
      continue
    }
    if (!rows.length) head.push(t)
    else return null
  }
  return rows.length ? { title: head.join(' '), rows, total } : null
}

function FeeTable({ f }: { f: { title: string; rows: FeeRow[]; total: string } }) {
  return (
    <table className="rowtbl sp-ord">
      <colgroup>
        <col style={{ width: 50 }} />
        <col style={{ width: 150 }} />
        <col />
        <col style={{ width: 130 }} />
      </colgroup>
      <thead>
        <tr>
          <th style={{ textAlign: 'left' }}>순번</th>
          <th style={{ textAlign: 'left' }}>대상자</th>
          <th style={{ textAlign: 'left' }}>소속</th>
          <th>자문비(원)</th>
        </tr>
      </thead>
      <tbody>
        {f.rows.map((r, i) => (
          <tr key={i}>
            <td style={{ textAlign: 'left', color: 'var(--muted)' }}>{i + 1}</td>
            <td style={{ textAlign: 'left' }}><b>{r.name}</b></td>
            <td style={{ textAlign: 'left' }} className="t-sub">{r.org || '—'}</td>
            <td className="tnum" style={{ fontWeight: 700 }}>{r.amount}</td>
          </tr>
        ))}
        {f.total && (
          <tr className="sp-sum">
            <td colSpan={3}>합계 ({f.rows.length}명)</td>
            <td className="tnum">{f.total}원</td>
          </tr>
        )}
      </tbody>
    </table>
  )
}

export interface PayRow { name: string; gross: string; ded: string; net: string }
/** 급여 상신 본문("1. 이름 · 지급 … · 공제 … · 실지급 …원")을 직원별 표로 분해. 형식이 다르면 null */
export function parsePay(memo: string): { rows: PayRow[]; total: string } | null {
  const rows: PayRow[] = []
  let total = ''
  for (const raw of memo.split('\n')) {
    const t = raw.trim()
    if (!t) continue
    const m = t.match(/^\d+\.\s+(.+?)\s·\s지급\s(-?[\d,]+)원\s·\s공제\s(-?[\d,]+)원\s·\s실지급\s(-?[\d,]+)원$/)
    if (m) {
      rows.push({ name: m[1], gross: m[2], ded: m[3], net: m[4] })
      continue
    }
    const sum = t.match(/^합계\s+([\d,]+)원$/)
    if (sum) {
      total = sum[1]
      continue
    }
    if (rows.length) return null
  }
  return rows.length ? { rows, total } : null
}

function PayTable({ p }: { p: { rows: PayRow[]; total: string } }) {
  const n = (v: string) => parseInt(v.replace(/,/g, ''), 10) || 0
  const g = p.rows.reduce((x, r) => x + n(r.gross), 0)
  const d = p.rows.reduce((x, r) => x + n(r.ded), 0)
  return (
    <table className="rowtbl sp-ord">
      <colgroup>
        <col style={{ width: 50 }} />
        <col />
        <col style={{ width: 130 }} />
        <col style={{ width: 120 }} />
        <col style={{ width: 130 }} />
      </colgroup>
      <thead>
        <tr>
          <th style={{ textAlign: 'left' }}>순번</th>
          <th style={{ textAlign: 'left' }}>이름</th>
          <th>지급액(원)</th>
          <th>공제(원)</th>
          <th>실지급액(원)</th>
        </tr>
      </thead>
      <tbody>
        {p.rows.map((r, i) => (
          <tr key={i}>
            <td style={{ textAlign: 'left', color: 'var(--muted)' }}>{i + 1}</td>
            <td style={{ textAlign: 'left' }}><b>{r.name}</b></td>
            <td className="tnum">{r.gross}</td>
            <td className="tnum">{r.ded}</td>
            <td className="tnum" style={{ fontWeight: 700 }}>{r.net}</td>
          </tr>
        ))}
        <tr className="sp-sum">
          <td colSpan={2}>합계 ({p.rows.length}명)</td>
          <td className="tnum">{won(g)}</td>
          <td className="tnum">{won(d)}</td>
          <td className="tnum">{p.total}원</td>
        </tr>
      </tbody>
    </table>
  )
}

const hostOf = (u: string) => {
  try { return new URL(u).hostname.replace(/^www\./, '') } catch { return '링크' }
}

function OrderTable({ o }: { o: { reason: string; rows: Row[]; total: string } }) {
  return (
    <div>
      {o.reason && <div className="ad-body" style={{ marginBottom: 10 }}>{o.reason}</div>}
      <table className="rowtbl sp-ord">
        <colgroup>
          <col />
          <col style={{ width: 90 }} />
          <col style={{ width: 120 }} />
          <col style={{ width: 120 }} />
        </colgroup>
        <thead>
          <tr>
            <th style={{ textAlign: 'left' }}>품목</th>
            <th>수량</th>
            <th>단가(원)</th>
            <th>금액(원)</th>
          </tr>
        </thead>
        <tbody>
          {o.rows.map((r, i) => (
            <tr key={i}>
              <td>
                <b>{r.name}</b>
                {r.link && (
                  <a className="sp-link" href={r.link} target="_blank" rel="noopener noreferrer" title={r.link}>
                    🔗 {hostOf(r.link)}
                  </a>
                )}
              </td>
              <td className="tnum">{r.qty}{r.unit}</td>
              <td className="tnum">{r.price}</td>
              <td className="tnum" style={{ fontWeight: 700 }}>{r.amount}</td>
            </tr>
          ))}
          {o.total && (
            <tr className="sp-sum">
              <td colSpan={3}>합계</td>
              <td className="tnum">{o.total}원</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

const KIND_LABEL: Record<string, string> = { 지출결의서: '지출결의서', 품의: '품의서', 휴가: '휴가신청', 일반: '일반' }

/** 결재 문서 내용 (행을 눌렀을 때 펼침) — 지출결의서·품의서·기타 공통 */
export function ApprDetail({ a, lines, empName }: { a: Approval; lines: ApprovalLine[]; empName: Record<string, string> }) {
  const [projName, setProjName] = useState('')
  useEffect(() => {
    if (!a.project_id) return setProjName('')
    supabase
      .from('art_projects')
      .select('name')
      .eq('id', a.project_id)
      .maybeSingle()
      .then(({ data }) => setProjName((data as { name?: string } | null)?.name ?? ''))
  }, [a.project_id])

  const body = a.memo && a.memo !== a.title ? a.memo : ''
  const order = body ? parseOrder(body) : null
  const fees = body && !order ? parseFees(body) : null
  const pay = body && !order && !fees ? parsePay(body) : null
  const isExp = a.kind === '지출결의서'
  const target = [projName, a.budget_item].filter(Boolean).join(' · ')
  const meta: [string, string][] = [
    ['문서번호', a.doc_no ?? '—'],
    ['기안일', a.req_date ?? '—'],
    ['기안자', a.drafter_id ? empName[a.drafter_id] ?? '—' : '—'],
  ]
  if (a.biz_code) meta.push(['사업자', bizShort(a.biz_code)])
  if (a.dept_key) meta.push(['부서', deptLabel(a.dept_key)])
  return (
    <div className="ad">
      <div className="ad-head">
        <span className="ad-kind">{KIND_LABEL[a.kind] ?? a.kind}</span>
        <h4>{a.title || '(제목 없음)'}</h4>
        <span className="ad-amt tnum">{a.amount ? won(a.amount) + '원' : ''}</span>
      </div>
      <dl className="ad-meta">
        {meta.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      {order ? (
        <>
          <div className="ad-sec">구매 내역</div>
          <OrderTable o={order} />
        </>
      ) : pay ? (
        <>
          <div className="ad-sec">급여 지급 내역 (직원별)</div>
          <PayTable p={pay} />
        </>
      ) : fees ? (
        <>
          <div className="ad-sec">자문비 지급 대상자별 내역</div>
          <FeeTable f={fees} />
        </>
      ) : (
        <>
          {isExp && (
            <>
              <div className="ad-sec">지출 내역</div>
              <table className="rowtbl sp-ord">
                <colgroup>
                  <col />
                  <col style={{ width: 110 }} />
                  <col style={{ width: 220 }} />
                  <col style={{ width: 120 }} />
                </colgroup>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left' }}>건명</th>
                    <th style={{ textAlign: 'left' }}>계정</th>
                    <th style={{ textAlign: 'left' }}>반영 사업 · 예산항목</th>
                    <th>금액(원)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><b>{a.title || '—'}</b></td>
                    <td style={{ textAlign: 'left' }}>{a.account || '—'}</td>
                    <td style={{ textAlign: 'left' }}>{target || '—'}</td>
                    <td className="tnum" style={{ fontWeight: 700 }}>{a.amount ? won(a.amount) : '—'}</td>
                  </tr>
                </tbody>
              </table>
            </>
          )}
          {(body || !isExp) && (
            <>
              <div className="ad-sec">{isExp ? '비고' : '내용'}</div>
              <div className="ad-body">
                {body ? <Linkified text={body} /> : <span style={{ color: 'var(--muted)' }}>작성된 본문이 없습니다.</span>}
              </div>
            </>
          )}
        </>
      )}
      <div className="ad-sec">결재선</div>
      <div className="ad-lines">
        {lines.filter((l) => l.role !== '참조').map((l) => (
          <div key={l.id} className={`ad-ln st-${l.decided}`}>
            <small>{l.role}</small>
            <b>{l.approver_id ? empName[l.approver_id] ?? '—' : l.role === '회계접수' ? '회계 담당' : '미지정'}</b>
            <span>{l.decided === '승인' ? '승인 완료' : l.decided === '반려' ? '반려' : '대기'}</span>
          </div>
        ))}
      </div>
      {lines.some((l) => l.role === '참조') && (
        <>
          <div className="ad-sec">참조</div>
          <div className="ad-lines">
            {lines.filter((l) => l.role === '참조').map((l) => (
              <div key={l.id} className="ad-ln">
                <small>참조</small>
                <b>{l.approver_id ? empName[l.approver_id] ?? '—' : '—'}</b>
                <span>열람</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
