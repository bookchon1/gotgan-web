import { won } from '../lib/format'
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

interface Row { name: string; qty: string; unit: string; price: string; amount: string; link?: string }
/** 재고 품의서 본문("1. 품목 · 3개 × 1,000원 = 3,000원 / 구매링크: …")을 표로 분해. 형식이 다르면 null */
function parseOrder(memo: string): { reason: string; rows: Row[]; total: string } | null {
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
  const body = a.memo && a.memo !== a.title ? a.memo : ''
  const order = body ? parseOrder(body) : null
  const meta: [string, string][] = [
    ['문서번호', a.doc_no ?? '—'],
    ['기안일', a.req_date ?? '—'],
    ['기안자', a.drafter_id ? empName[a.drafter_id] ?? '—' : '—'],
  ]
  if (a.biz_code || a.dept_key) meta.push(['사업자·부서', [a.biz_code, a.dept_key].filter(Boolean).join(' · ')])
  if (a.account) meta.push(['계정과목', a.account])
  if (a.budget_item) meta.push(['예산항목', a.budget_item])
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
      <div className="ad-sec">내용</div>
      {order ? (
        <OrderTable o={order} />
      ) : (
        <div className="ad-body">
          {body ? <Linkified text={body} /> : <span style={{ color: 'var(--muted)' }}>작성된 본문이 없습니다.</span>}
        </div>
      )}
      <div className="ad-sec">결재선</div>
      <div className="ad-lines">
        {lines.map((l) => (
          <div key={l.id} className={`ad-ln st-${l.decided}`}>
            <small>{l.role}</small>
            <b>{l.approver_id ? empName[l.approver_id] ?? '—' : l.role === '회계접수' ? '회계 담당' : '미지정'}</b>
            <span>{l.decided === '승인' ? '승인 완료' : l.decided === '반려' ? '반려' : '대기'}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
