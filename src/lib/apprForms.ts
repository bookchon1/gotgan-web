// 전자결재 양식함 — 양식 정의 + 본문(memo) 직렬화/해석
// 본문 형식:
//   [양식:품의서]
//   휴가 종류: …            ← 한 줄 항목 (text/date/select/daterange)
//   ■ 상세 내용             ← 여러 줄 항목 (textarea) / 표(items)
//   …
import type { Approval } from '../types/db'

export type FieldType = 'text' | 'textarea' | 'date' | 'select' | 'daterange' | 'timerange' | 'hours' | 'items'

export interface FormField {
  key: string // 본문에 표시되는 항목 이름
  type: FieldType
  required?: boolean
  placeholder?: string
  options?: string[]
  rows?: number
  /** date: 기본값을 오늘로 */
  today?: boolean
}

export interface FormDef {
  id: string
  name: string // 본문 첫 줄 [양식:이름] — 바꾸면 기존 문서·휴가 자동반영(SQL)이 깨지므로 고정
  label: string // 화면에 보이는 양식 이름
  kind: Approval['kind']
  desc: string
  titleHint: string
  /** 지출결의서: 사업자·부서·계정·금액·사업/예산 입력 표시 */
  expense?: boolean
  fields: FormField[]
}

export const LEAVE_TYPES = ['연차', '반차(오전)', '반차(오후)', '대체휴무', '대체반차(오전)', '대체반차(오후)', '병가', '경조사', '공가', '기타']
/** 연장근무 적립분을 쓰는 휴가 종류 */
export const isCompLeave = (t: string | undefined) => !!t && t.startsWith('대체')

export const FORMS: FormDef[] = [
  {
    id: 'poom',
    name: '품의서',
    label: '업무기안',
    kind: '품의',
    desc: '업무 추진·구매 등 결재를 받기 위한 문서',
    titleHint: '',
    fields: [
      { key: '상세 내용', type: 'textarea', required: true, rows: 8, placeholder: '목적, 배경, 추진 내용·방법, 시행 희망일 등을 적으세요' },
      { key: '소요 예산', type: 'items' },
    ],
  },
  {
    id: 'expense',
    name: '지출결의서',
    label: '지출결의',
    kind: '지출결의서',
    desc: '비용 지출 결의 (승인 후 회계 접수·전표 처리)',
    titleHint: '',
    expense: true,
    fields: [
      { key: '지출 사유', type: 'textarea', rows: 3, placeholder: '지출 목적·사유' },
      { key: '지출 내역', type: 'items' },
    ],
  },
  {
    id: 'trip',
    name: '출장신청서',
    label: '출장신청',
    kind: '일반',
    desc: '출장 일정·목적·경비 신청',
    titleHint: '',
    fields: [
      { key: '출장지', type: 'text', required: true },
      { key: '기간', type: 'daterange', required: true },
      { key: '출장 목적', type: 'textarea', required: true, rows: 3 },
      { key: '동행자', type: 'text' },
      { key: '예상 경비', type: 'items' },
    ],
  },
  {
    id: 'overtime',
    name: '연장근무',
    label: '연장근무',
    kind: '일반',
    desc: '연장근무 적립 신청 (1:1 적립 · 승인되면 대체휴무로 사용)',
    titleHint: '',
    fields: [
      { key: '근무일', type: 'date', required: true, today: true },
      { key: '근무 시간', type: 'timerange', required: true },
      { key: '인정 시간', type: 'hours', required: true },
      { key: '사유', type: 'textarea', required: true, rows: 3, placeholder: '연장근무 내용' },
    ],
  },
  {
    id: 'leave',
    name: '휴가원',
    label: '휴가신청',
    kind: '휴가',
    desc: '연차·반차·대체휴무·병가 등 휴가 신청 (승인되면 일정표에 표시)',
    titleHint: '',
    fields: [
      { key: '휴가 종류', type: 'select', required: true, options: LEAVE_TYPES },
      { key: '기간', type: 'daterange', required: true },
      { key: '휴가 사유', type: 'textarea', required: true, rows: 3 },
      { key: '비상 연락처', type: 'text', placeholder: '휴가 중 연락 가능한 번호' },
    ],
  },
]

export const formById = (id: string) => FORMS.find((f) => f.id === id) ?? FORMS[0]
export const formByName = (name: string) => FORMS.find((f) => f.name === name) ?? (name === '일반 기안' ? FORMS[0] : undefined)

export interface ItemRow {
  name: string
  qty: number
  price: number
}
export const itemsTotal = (rows: ItemRow[]) => rows.reduce((s, r) => s + (Number(r.qty) || 0) * (Number(r.price) || 0), 0)
const fmt = (n: number) => n.toLocaleString('ko-KR')

/** 양식 입력값 → memo 문자열 */
export function serializeForm(def: FormDef, values: Record<string, string>, items: Record<string, ItemRow[]>): string {
  const head: string[] = [`[양식:${def.name}]`]
  const sections: string[] = []
  for (const f of def.fields) {
    if (f.type === 'items') {
      const rows = (items[f.key] ?? []).filter((r) => r.name.trim() && Number(r.qty) > 0)
      if (!rows.length) continue
      const lines = rows.map((r, i) => `${i + 1}. ${r.name.trim()} · ${fmt(Number(r.qty))}개 × ${fmt(Number(r.price) || 0)}원 = ${fmt(Number(r.qty) * (Number(r.price) || 0))}원`)
      sections.push(`■ ${f.key}\n${lines.join('\n')}\n합계 ${fmt(itemsTotal(rows))}원`)
      continue
    }
    const v = (values[f.key] ?? '').trim()
    if (!v) continue
    if (f.type === 'textarea') sections.push(`■ ${f.key}\n${v.replace(/^■ /gm, '· ')}`)
    else head.push(`${f.key}: ${v.replace(/\n/g, ' ')}`)
  }
  if (def.id === 'leave') {
    const d = leaveDays(values['휴가 종류'], values['기간'])
    if (d > 0) head.push(`일수: ${d}일`)
  }
  return [head.join('\n'), ...sections].join('\n')
}

export interface ParsedForm {
  form: string
  kv: { label: string; value: string }[]
  sections: { label: string; body: string }[]
}
/** memo → 양식 항목 (양식 본문이 아니면 null) */
export function parseFormMemo(memo: string | null | undefined): ParsedForm | null {
  if (!memo) return null
  const lines = memo.split('\n')
  const m = lines[0].match(/^\[양식:(.+)\]$/)
  if (!m) return null
  const kv: ParsedForm['kv'] = []
  const sections: ParsedForm['sections'] = []
  let cur: { label: string; body: string[] } | null = null
  for (const raw of lines.slice(1)) {
    const s = raw.match(/^■ (.+)$/)
    if (s) {
      if (cur) sections.push({ label: cur.label, body: cur.body.join('\n').trim() })
      cur = { label: s[1], body: [] }
      continue
    }
    if (cur) {
      cur.body.push(raw)
      continue
    }
    const k = raw.match(/^([^:]+):\s?(.*)$/)
    if (k) kv.push({ label: k[1].trim(), value: k[2].trim() })
  }
  if (cur) sections.push({ label: cur.label, body: cur.body.join('\n').trim() })
  return { form: m[1], kv, sections }
}

/** 저장된 memo → 입력값 복원 (임시보관 이어쓰기·재기안) */
export function restoreForm(def: FormDef, memo: string | null | undefined): { values: Record<string, string>; items: Record<string, ItemRow[]> } {
  const values: Record<string, string> = {}
  const items: Record<string, ItemRow[]> = {}
  const p = parseFormMemo(memo)
  if (!p) {
    // 옛 자유 형식 본문 → 첫 번째 여러 줄 항목에 넣는다
    const ta = def.fields.find((f) => f.type === 'textarea')
    if (ta && memo) values[ta.key] = memo
    return { values, items }
  }
  for (const f of def.fields) {
    if (f.type === 'items') {
      const sec = p.sections.find((s) => s.label === f.key)
      if (!sec) continue
      const rows: ItemRow[] = []
      for (const ln of sec.body.split('\n')) {
        const r = ln.trim().match(/^\d+\.\s+(.+?)\s·\s([\d,]+)\S*\s×\s([\d,]+)원\s=\s[\d,]+원$/)
        if (r) rows.push({ name: r[1], qty: Number(r[2].replace(/,/g, '')), price: Number(r[3].replace(/,/g, '')) })
      }
      items[f.key] = rows
    } else if (f.type === 'textarea') {
      const sec = p.sections.find((s) => s.label === f.key)
      if (sec) values[f.key] = sec.body
    } else {
      const k = p.kv.find((x) => x.label === f.key)
      if (k) values[f.key] = k.value
    }
  }
  return { values, items }
}

/** 휴가 일수: 평일(월~금) 기준, 반차는 0.5 */
export function leaveDays(type: string | undefined, range: string | undefined): number {
  const m = (range ?? '').match(/^(\d{4}-\d{2}-\d{2})\s~\s(\d{4}-\d{2}-\d{2})$/)
  if (!m) return 0
  if (type?.includes('반차')) return 0.5
  let n = 0
  const end = new Date(m[2] + 'T00:00:00')
  for (let d = new Date(m[1] + 'T00:00:00'); d <= end; d.setDate(d.getDate() + 1)) {
    const w = d.getDay()
    if (w !== 0 && w !== 6) n++
  }
  return n
}

/** 문서가 어떤 양식으로 작성됐는지 (양식 표시 없는 옛 문서는 종류로 추정) */
export function formOfApproval(a: Pick<Approval, 'kind' | 'memo'>): FormDef {
  const p = parseFormMemo(a.memo)
  if (p) return formByName(p.form) ?? FORMS[0]
  return a.kind === '지출결의서' ? formById('expense') : a.kind === '휴가' ? formById('leave') : FORMS[0]
}

/** 연장근무 인정 시간: "HH:MM ~ HH:MM" → 시간(자정을 넘기면 다음 날로 계산) */
export function overtimeHours(range: string | undefined): number {
  const m = (range ?? '').match(/^(\d{2}):(\d{2})\s~\s(\d{2}):(\d{2})$/)
  if (!m) return 0
  let min = Number(m[3]) * 60 + Number(m[4]) - (Number(m[1]) * 60 + Number(m[2]))
  if (min <= 0) min += 24 * 60
  return Math.round((min / 60) * 100) / 100
}
