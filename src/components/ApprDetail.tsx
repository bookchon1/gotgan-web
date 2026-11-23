import { parseFormMemo, type ParsedForm } from '../lib/apprForms'
import { useEffect, useState } from 'react'
import { won } from '../lib/format'
import { supabase } from '../lib/supabase'
import { bizShort, deptLabel } from '../data/areas'
import type { Approval, ApprovalLine } from '../types/db'
import { ApprStamps, buildStamps, useTitles } from './ApprStamps'

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
/** 양식(품의서·휴가원·출장신청서 등)으로 작성된 본문 */
function FormView({ f }: { f: ParsedForm }) {
  let n = 0
  return (
    <div style={{ marginTop: 14 }}>
      {f.kv.map((k, i) => (
        <div className="ad-it" key={'k' + i}>
          <span className="no">{++n}.</span>
          <b>{k.label}</b>
          <span className="v">{k.value}</span>
        </div>
      ))}
      {f.sections.map((sec, i) => {
        const tbl = parseOrder(sec.body)
        return (
          <div key={i}>
            <div className="ad-it">
              <span className="no">{++n}.</span>
              <b>{sec.label}</b>
            </div>
            <div className="ad-itbody">
              {tbl ? (
                <OrderTable o={tbl} />
              ) : (
                <div className="ad-body">{sec.body ? <Linkified text={sec.body} /> : <span style={{ color: 'var(--muted)' }}>—</span>}</div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export interface SiteRow { name: string; days: string; dates: string; amount: string }
/** 현장 정산 본문("1. 이름 · 근무 2일 (11/06, 11/20) · 660,000원 … 식대 N원 / 합계 N원")을 인원별 표로 분해 */
export function parseSite(memo: string): { title: string; rows: SiteRow[]; meal: string; total: string } | null {
  const rows: SiteRow[] = []
  const head: string[] = []
  let meal = ''
  let total = ''
  for (const raw of memo.split('\n')) {
    const t = raw.trim()
    if (!t) continue
    const m = t.match(/^\d+\.\s+(.+?)\s·\s근무\s(\d+)일\s\((.*)\)\s·\s(-?[\d,]+)원$/)
    if (m) {
      rows.push({ name: m[1], days: m[2], dates: m[3], amount: m[4] })
      continue
    }
    const ml = t.match(/^식대\s+([\d,]+)원$/)
    if (ml) { meal = ml[1]; continue }
    const sum = t.match(/^합계\s+([\d,]+)원$/)
    if (sum) { total = sum[1]; continue }
    if (!rows.length) head.push(t)
    else return null
  }
  return rows.length ? { title: head.join(' '), rows, meal, total } : null
}

function SiteTable({ f }: { f: { title: string; rows: SiteRow[]; meal: string; total: string } }) {
  const labor = f.rows.reduce((n, r) => n + (parseInt(r.amount.replace(/,/g, ''), 10) || 0), 0)
  return (
    <table className="rowtbl sp-ord">
      <colgroup>
        <col style={{ width: 50 }} />
        <col style={{ width: 120 }} />
        <col style={{ width: 80 }} />
        <col />
        <col style={{ width: 130 }} />
      </colgroup>
      <thead>
        <tr>
          <th style={{ textAlign: 'left' }}>순번</th>
          <th style={{ textAlign: 'left' }}>이름</th>
          <th>근무일수</th>
          <th style={{ textAlign: 'left' }}>근무일</th>
          <th>금액(원)</th>
        </tr>
      </thead>
      <tbody>
        {f.rows.map((r, i) => (
          <tr key={i}>
            <td style={{ textAlign: 'left', color: 'var(--muted)' }}>{i + 1}</td>
            <td style={{ textAlign: 'left' }}><b>{r.name}</b></td>
            <td className="tnum">{r.days}일</td>
            <td style={{ textAlign: 'left' }} className="t-sub">{r.dates}</td>
            <td className="tnum" style={{ fontWeight: 700 }}>{r.amount}</td>
          </tr>
        ))}
        <tr className="sp-sum">
          <td colSpan={4}>인건비 합계 ({f.rows.length}명)</td>
          <td className="tnum">{won(labor)}원</td>
        </tr>
        {f.meal && (
          <tr className="sp-sum">
            <td colSpan={4}>식대 합계</td>
            <td className="tnum">{f.meal}원</td>
          </tr>
        )}
        {f.total && (
          <tr className="sp-sum">
            <td colSpan={4}>총 합계</td>
            <td className="tnum">{f.total}원</td>
          </tr>
        )}
      </tbody>
    </table>
  )
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

const esc = (t: unknown) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const nl = (t: string) => esc(t).replace(/\n/g, '<br>')

/** 결재 문서를 정식 기안서 양식으로 인쇄(또는 PDF로 저장) */
function printDoc(a: Approval, lines: ApprovalLine[], empName: Record<string, string>, atts: { name: string }[], target: string, titles: Record<string, string>) {
  const w = window.open('', '_blank')
  if (!w) return alert('팝업이 차단되었습니다. 브라우저에서 이 사이트의 팝업을 허용해 주세요.')
  const body = a.memo && a.memo !== a.title ? a.memo : ''
  const form = body ? parseFormMemo(body) : null
  const orderTbl = (o: { reason: string; rows: Row[]; total: string }) =>
    `${o.reason ? `<p>${nl(o.reason)}</p>` : ''}<table class="grid"><thead><tr><th>품목</th><th>수량</th><th>단가(원)</th><th>금액(원)</th></tr></thead><tbody>${o.rows
      .map((r) => `<tr><td>${esc(r.name)}</td><td class="r">${esc(r.qty + r.unit)}</td><td class="r">${esc(r.price)}</td><td class="r">${esc(r.amount)}</td></tr>`)
      .join('')}${o.total ? `<tr class="sum"><td colspan="3">합계</td><td class="r">${esc(o.total)}</td></tr>` : ''}</tbody></table>`
  let content = ''
  let no = 0
  if (form) {
    for (const k of form.kv) content += `<div class="it"><span class="no">${++no}.</span><b>${esc(k.label)}</b><span class="v">${nl(k.value)}</span></div>`
    for (const sec of form.sections) {
      const t = parseOrder(sec.body)
      content += `<div class="it"><span class="no">${++no}.</span><b>${esc(sec.label)}</b></div><div class="ib">${t ? orderTbl(t) : nl(sec.body)}</div>`
    }
  } else if (body) {
    const t = parseOrder(body)
    content += t ? `<h3>구매 내역</h3>${orderTbl(t)}` : `<h3>내용</h3><div class="txt">${nl(body)}</div>`
  }
  if (a.kind === '지출결의서') {
    content =
      `<h3>지출 내역</h3><table class="grid"><thead><tr><th>건명</th><th>계정</th><th>반영 사업 · 예산항목</th><th>금액(원)</th></tr></thead><tbody><tr><td>${esc(a.title)}</td><td>${esc(a.account || '—')}</td><td>${esc(target || '—')}</td><td class="r">${a.amount ? won(a.amount) : '—'}</td></tr></tbody></table>` +
      content
  }
  const flow = lines.filter((l) => l.role !== '참조').slice().sort((x, y) => x.seq - y.seq)
  const stamps = buildStamps(lines, empName, titles, a.req_date)
  const stampCell = (x: { role: string; name: string; title?: string | null; state?: string; date?: string }) =>
    `<td><div class="role">${esc(x.role)}</div><div class="ti">${esc(x.title || '')}</div><div class="nm">${esc(x.name)}</div><div class="st ${x.state === '반려' ? 'rej' : ''}">${esc(x.state || '')}</div><div class="dt">${esc(x.date || '')}</div></td>`
  const comments = flow.filter((l) => l.comment).map((l) => `<tr><th>${esc(l.role)} ${esc(l.approver_id ? empName[l.approver_id] ?? '' : '')}</th><td>${nl(l.comment ?? '')}</td></tr>`).join('')
  const ccs = lines.filter((l) => l.role === '참조').map((l) => (l.approver_id ? empName[l.approver_id] ?? '' : '')).filter(Boolean)
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${esc(a.doc_no ?? '')} ${esc(a.title)}</title>
<style>
@page{size:A4;margin:16mm 15mm}
*{box-sizing:border-box}
body{font-family:'Malgun Gothic','Apple SD Gothic Neo',sans-serif;font-size:12px;color:#111;margin:0}
h1{text-align:center;font-size:24px;letter-spacing:.4em;margin:6px 0 18px}
h3{font-size:13px;margin:16px 0 6px;border-left:3px solid #333;padding-left:6px}
.top{display:flex;justify-content:space-between;align-items:flex-start;gap:16px}
.stamps{border-collapse:collapse;margin-left:auto}
.stamps td{border:1px solid #333;width:64px;text-align:center;padding:0;vertical-align:top}
.stamps .role{background:#f0f0f0;border-bottom:1px solid #333;font-size:10.5px;padding:2px 0}
.stamps .ti{font-size:10px;color:#555;padding:3px 2px 0;min-height:15px}
.stamps .nm{font-size:12px;font-weight:700;padding:6px 2px 2px}
.it{display:flex;gap:6px;margin:5px 0;line-height:1.7;font-size:12.5px}.it .no{min-width:18px;font-weight:700}.it .v{flex:1}.it b+.v:before{content:': '}
.ib{margin:2px 0 8px 24px}.att{margin-top:12px}.end{margin-top:10px;font-weight:700}
.stamps .st{font-size:11px;color:#1a6b45;height:16px}
.stamps .st.rej{color:#b00020}
.stamps .dt{font-size:10px;color:#555;padding-bottom:3px}
table.grid{border-collapse:collapse;width:100%;margin-bottom:4px}
.grid th,.grid td{border:1px solid #555;padding:5px 8px;text-align:left;vertical-align:top}
.grid th{background:#f2f2f2;font-weight:700;width:110px}
.grid thead th{width:auto;text-align:center}
.grid .r{text-align:right;font-variant-numeric:tabular-nums}
.grid .sum td{font-weight:700;background:#fafafa}
.kv th{width:110px}
.txt{border:1px solid #555;padding:10px 12px;min-height:60px;line-height:1.7}
.meta{margin-top:4px}
.foot{margin-top:18px;font-size:11px;color:#444}
@media print{.noprint{display:none}}
.noprint{text-align:center;margin:10px}
</style></head><body>
<div class="noprint"><button onclick="window.print()">인쇄 / PDF로 저장</button></div>
<h1>${esc(form ? form.form : KIND_LABEL[a.kind] ?? a.kind)}</h1>
<div class="top">
  <table class="grid meta" style="width:58%">
    <tr><th>문서번호</th><td>${esc(a.doc_no ?? '—')}</td></tr>
    <tr><th>시행일자</th><td>${esc(a.req_date ?? '—')}</td></tr>
    <tr><th>수 신</th><td>내부결재</td></tr>
    <tr><th>기안자</th><td>${esc(a.drafter_id ? empName[a.drafter_id] ?? '—' : '—')}</td></tr>
    ${a.dept_key ? `<tr><th>부서</th><td>${esc(deptLabel(a.dept_key))}</td></tr>` : ''}
    ${a.biz_code ? `<tr><th>사업자</th><td>${esc(bizShort(a.biz_code))}</td></tr>` : ''}
  </table>
  <table class="stamps"><tr>${stamps.map(stampCell).join('')}</tr></table>
</div>
<table class="grid" style="margin-top:8px"><tr><th>제 목</th><td><b>${esc(a.title)}</b></td></tr>${a.amount ? `<tr><th>금 액</th><td>${won(a.amount)}원</td></tr>` : ''}${ccs.length ? `<tr><th>참 조</th><td>${esc(ccs.join(', '))}</td></tr>` : ''}</table>
${content}
${atts.length ? `<div class="att">붙임&nbsp;&nbsp;${atts.map((f, i) => `${atts.length > 1 ? `${i + 1}. ` : ''}${esc(f.name)} 1부`).join('<br>&emsp;&emsp;&emsp;')}</div>` : ''}
<div class="end">끝.</div>
${comments ? `<h3>결재 의견</h3><table class="grid">${comments}</table>` : ''}
<div class="foot">출력일 ${new Date().toISOString().slice(0, 10)} · 곳간 전자결재</div>
</body></html>`
  w.document.open()
  w.document.write(html)
  w.document.close()
  setTimeout(() => w.focus(), 100)
}

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

  const titles = useTitles(lines.map((l) => l.approver_id))
  const [atts, setAtts] = useState<{ id: string; name: string; path: string; size: number | null }[]>([])
  useEffect(() => {
    supabase
      .from('approval_files')
      .select('id,name,path,size')
      .eq('approval_id', a.id)
      .order('created_at')
      .then(({ data, error }) => setAtts(error ? [] : ((data ?? []) as typeof atts)))
  }, [a.id])
  async function openFile(path: string) {
    const { data, error } = await supabase.storage.from('approval-files').createSignedUrl(path, 60)
    if (error || !data) return alert('파일을 열 수 없습니다: ' + (error?.message ?? ''))
    window.open(data.signedUrl, '_blank')
  }

  const body = a.memo && a.memo !== a.title ? a.memo : ''
  const formDoc = body ? parseFormMemo(body) : null
  const order = body && !formDoc ? parseOrder(body) : null
  const site = body && !order && !formDoc ? parseSite(body) : null
  const fees = body && !order && !site && !formDoc ? parseFees(body) : null
  const pay = body && !order && !site && !fees && !formDoc ? parsePay(body) : null
  const isExp = a.kind === '지출결의서'
  const target = [projName, a.budget_item].filter(Boolean).join(' · ')
  const flow = lines.filter((l) => l.role !== '참조').slice().sort((x, y) => x.seq - y.seq)
  const ccNames = lines.filter((l) => l.role === '참조').map((l) => (l.approver_id ? empName[l.approver_id] ?? '' : '')).filter(Boolean)
  const expBlock = isExp ? (
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
  ) : null

  return (
    <div className="ad">
      <div style={{ float: 'right' }}>
        <button type="button" className="sp-btn b2" onClick={() => printDoc(a, lines, empName, atts, target, titles)}>
          인쇄 · PDF
        </button>
      </div>
      <div className="ad-head">
        <span className="ad-kind">{KIND_LABEL[a.kind] ?? a.kind}</span>
        <h4>{a.title || '(제목 없음)'}</h4>
        <span className="ad-amt tnum">{a.amount ? won(a.amount) + '원' : ''}</span>
      </div>
      <div className="gov-head" style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--line-2, var(--line))' }}>
        <dl className="gov-meta">
          <dt>문서번호</dt>
          <dd>{a.doc_no ?? '—'}</dd>
          <dt>시행일자</dt>
          <dd>{a.req_date ?? '—'}</dd>
          <dt>수 신</dt>
          <dd>내부결재</dd>
          {ccNames.length > 0 && (
            <>
              <dt>참 조</dt>
              <dd>{ccNames.join(', ')}</dd>
            </>
          )}
          <dt>기안자</dt>
          <dd>
            {a.drafter_id ? empName[a.drafter_id] ?? '—' : '—'}
            {a.dept_key ? ` · ${deptLabel(a.dept_key)}` : ''}
            {a.biz_code ? ` · ${bizShort(a.biz_code)}` : ''}
          </dd>
        </dl>
        <ApprStamps items={buildStamps(lines, empName, titles, a.req_date)} />
      </div>
      {formDoc ? (
        <>
          {expBlock}
          <FormView f={formDoc} />
        </>
      ) : order ? (
        <>
          <div className="ad-sec">구매 내역</div>
          <OrderTable o={order} />
        </>
      ) : site ? (
        <>
          <div className="ad-sec">현장 정산 내역 (인원별)</div>
          {site.title && <div className="t-sub" style={{ margin: '0 0 6px' }}>{site.title}</div>}
          <SiteTable f={site} />
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
          {expBlock}
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
      {atts.length > 0 && (
        <>
          <div className="ad-sec">붙임</div>
          <div className="ad-files">
            {atts.map((f) => (
              <button key={f.id} type="button" className="sp-link" onClick={() => openFile(f.path)}>
                📎 {f.name}
                {f.size ? ` (${f.size >= 1048576 ? (f.size / 1048576).toFixed(1) + 'MB' : Math.max(1, Math.round(f.size / 1024)) + 'KB'})` : ''}
              </button>
            ))}
          </div>
        </>
      )}
      <div className="ad-end">끝.</div>
      {flow.some((l) => l.comment) && (
        <>
          <div className="ad-sec">결재 의견</div>
          {flow
            .filter((l) => l.comment)
            .map((l) => (
              <div className="ad-it" key={l.id}>
                <b style={{ minWidth: 'auto' }}>
                  {l.role} {l.approver_id ? empName[l.approver_id] ?? '' : ''}
                </b>
                <span className="v">“{l.comment}”</span>
              </div>
            ))}
        </>
      )}
    </div>
  )
}
