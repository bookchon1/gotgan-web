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

/** 결재 문서 내용 (행을 눌렀을 때 펼침) */
export function ApprDetail({ a, lines, empName }: { a: Approval; lines: ApprovalLine[]; empName: Record<string, string> }) {
  const body = a.memo && a.memo !== a.title ? a.memo : ''
  return (
    <div className="pf" style={{ margin: 0 }}>
      <div className="pf-h">{a.title || '(제목 없음)'}</div>
      <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>
        <span>문서번호 <b style={{ color: 'var(--ink)' }}>{a.doc_no ?? '—'}</b></span>
        <span>기안일 <b style={{ color: 'var(--ink)' }}>{a.req_date ?? '—'}</b></span>
        <span>기안자 <b style={{ color: 'var(--ink)' }}>{a.drafter_id ? empName[a.drafter_id] ?? '—' : '—'}</b></span>
        <span>금액 <b style={{ color: 'var(--brand-ink)' }}>{a.amount ? won(a.amount) + '원' : '—'}</b></span>
      </div>
      <div style={{ whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.65, color: 'var(--ink)', background: 'var(--bg, #faf9f5)', border: '1px solid var(--line)', borderRadius: 8, padding: '10px 12px' }}>
        {body ? <Linkified text={body} /> : <span style={{ color: 'var(--muted)' }}>작성된 본문이 없습니다.</span>}
      </div>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 10, fontSize: 12 }}>
        {lines.map((l) => (
          <span key={l.id}>
            <span style={{ color: 'var(--muted)' }}>{l.role}</span>{' '}
            <b>{l.approver_id ? empName[l.approver_id] ?? '—' : '미지정'}</b>{' '}
            <span className="t-sub">{l.decided}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

