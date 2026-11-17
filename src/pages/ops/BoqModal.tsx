import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { won } from '../../lib/format'
import type { ArtBudget } from '../../types/db'

/** 곳간 9대 예산 항목 (원가계산서 → 예산 자동입력 대상) */
export const BUDGET_9 = ['재료비', '노무비', '경비', '기타경비', '일반관리비', '이윤', '보존처리계획', '훈증', '자문회비']
/** 내역서 엑셀에서 보여줄 시트 (공백 무시하고 이름으로 찾음) */
const SHEETS = ['원가계산서', '공종별집계표', '공종별내역서', '일위대가목록', '일위대가']

const squash = (v: unknown) => String(v ?? '').replace(/\s+/g, '')
const MAX_ROWS = 4000
const MAX_COLS = 24

interface SheetData {
  name: string
  rows: string[][]
  merges: number[][] // [r1,c1,r2,c2]
  widths: number[] // 글자수 기준
}
interface Parsed {
  file: string
  items: Record<string, number>
  sheets: SheetData[]
}
interface Saved {
  file_name: string | null
  sheets: SheetData[]
  updated_at: string
}

/** 원가계산서 시트 → 9대 항목 (셀 위치 고정 X, 항목 이름으로 찾음) */
function parseItems(rows: unknown[][]): Record<string, number> {
  const num = (v: unknown) => {
    const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/,/g, ''))
    return Number.isFinite(n) ? Math.round(n) : 0
  }
  const out: Record<string, number> = Object.fromEntries(BUDGET_9.map((k) => [k, 0]))
  let cur = ''
  let mat = 0, lab = 0, exp = 0, etc = 0
  for (const row of rows) {
    const a = squash(row[0]), b = squash(row[1]), c = squash(row[2]), d = row[3]
    if (b === '재료비') cur = '재료비'
    else if (b === '노무비') cur = '노무비'
    else if (b === '경비') cur = '경비'
    if (c === '[소계]') {
      if (cur === '재료비') mat = num(d)
      else if (cur === '노무비') lab = num(d)
      else if (cur === '경비') exp = num(d)
    }
    if (c === '기타경비') etc = num(d)
    if (a === '일반관리비') out['일반관리비'] = num(d)
    else if (a === '이윤') out['이윤'] = num(d)
    else if (a === '보존처리계획') out['보존처리계획'] = num(d)
    else if (a === '훈증') out['훈증'] = num(d)
    else if (a === '자문회비') out['자문회비'] = num(d)
  }
  out['재료비'] = mat
  out['노무비'] = lab
  out['기타경비'] = etc
  out['경비'] = exp - etc // 경비 = 경비 소계 − 기타경비
  return out
}

async function parseWorkbook(file: File): Promise<Parsed> {
  const XLSX = await import('xlsx')
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' })
  const sheets: SheetData[] = []
  let items: Record<string, number> | null = null

  for (const target of SHEETS) {
    const sn = wb.SheetNames.find((n) => squash(n) === target)
    if (!sn) continue
    const ws = wb.Sheets[sn]
    if (!ws['!ref']) continue
    // 범위를 A1부터 시작하도록 맞춤 (열/행 위치 고정)
    const rg = XLSX.utils.decode_range(ws['!ref'])
    rg.s.r = 0
    rg.s.c = 0
    ws['!ref'] = XLSX.utils.encode_range(rg)

    const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: '', blankrows: true })
    if (target === '원가계산서') items = parseItems(raw)
    const shown = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, raw: false, defval: '', blankrows: true })

    let rowsOut = shown.slice(0, MAX_ROWS).map((r) => r.slice(0, MAX_COLS).map((x) => String(x ?? '')))
    // 뒤쪽 빈 행 제거
    while (rowsOut.length && rowsOut[rowsOut.length - 1].every((x) => !x.trim())) rowsOut.pop()
    const nCols = Math.min(MAX_COLS, Math.max(1, ...rowsOut.map((r) => r.length)))
    rowsOut = rowsOut.map((r) => Array.from({ length: nCols }, (_, i) => r[i] ?? ''))

    const merges = (ws['!merges'] ?? [])
      .filter((m) => m.s.r < rowsOut.length && m.s.c < nCols)
      .map((m) => [m.s.r, m.s.c, Math.min(m.e.r, rowsOut.length - 1), Math.min(m.e.c, nCols - 1)])
    const widths = Array.from({ length: nCols }, (_, i) => Math.max(3, Math.min(60, ws['!cols']?.[i]?.wch ?? 10)))
    sheets.push({ name: target, rows: rowsOut, merges, widths })
  }
  if (!items) throw new Error('"원가계산서" 시트를 찾을 수 없습니다. 시트 이름을 확인해 주세요.')
  return { file: file.name, items, sheets }
}

const isNum = (s: string) => /^-?[\d,]+(\.\d+)?%?$/.test(s.trim()) && s.trim() !== ''

/** 글자 폭 추정(px, 12px 글꼴 기준) — 한글/전각은 넓게 */
const textPx = (t: string) => {
  let best = 0
  for (const line of t.split('\n')) {
    let w = 0
    for (const ch of line) {
      const code = ch.codePointAt(0) ?? 0
      w += code > 0x2e7f ? 12.5 : code === 32 ? 3.6 : 7.4
    }
    best = Math.max(best, w)
  }
  return Math.ceil(best) + 14
}

/**
 * 엑셀처럼 보이게: 병합 그대로 + 글자가 칸보다 길면 오른쪽 빈 칸으로 넘쳐 보이게(엑셀의 텍스트 넘침) +
 * 그래도 모자라면 열 너비를 글자에 맞게 늘려서 글씨가 잘리지 않게 한다.
 */
function SheetGrid({ s }: { s: SheetData }) {
  const { span, skip, colPx } = useMemo(() => {
    const nCols = s.widths.length
    const span = new Map<string, [number, number]>()
    const skip = new Set<string>()
    for (const [r1, c1, r2, c2] of s.merges) {
      span.set(`${r1},${c1}`, [r2 - r1 + 1, c2 - c1 + 1])
      for (let r = r1; r <= r2; r++)
        for (let c = c1; c <= c2; c++) if (r !== r1 || c !== c1) skip.add(`${r},${c}`)
    }
    const colPx = s.widths.map((w) => Math.round(w * 7 + 5))
    // 1) 텍스트 넘침: 오른쪽이 비어 있으면 그 칸까지 합쳐서 보여줌
    s.rows.forEach((row, r) => {
      for (let c = 0; c < nCols; c++) {
        const v = row[c]
        if (!v || !v.trim() || skip.has(`${r},${c}`) || isNum(v) || span.has(`${r},${c}`)) continue
        const need = textPx(v)
        let acc = colPx[c]
        let k = c
        while (
          acc < need &&
          k + 1 < nCols &&
          !(row[k + 1] ?? '').trim() &&
          !skip.has(`${r},${k + 1}`) &&
          !span.has(`${r},${k + 1}`)
        ) {
          k++
          acc += colPx[k]
          skip.add(`${r},${k}`)
        }
        if (k > c) span.set(`${r},${c}`, [1, k - c + 1])
      }
    })
    // 2) 한 칸짜리 글자는 열 너비를 늘려 잘리지 않게 (너무 긴 글은 280px에서 줄바꿈)
    s.rows.forEach((row, r) => {
      for (let c = 0; c < nCols; c++) {
        const v = row[c]
        if (!v || !v.trim() || skip.has(`${r},${c}`)) continue
        const sp = span.get(`${r},${c}`)
        if (sp && sp[1] > 1) continue
        colPx[c] = Math.max(colPx[c], Math.min(textPx(v), 280))
      }
    })
    return { span, skip, colPx }
  }, [s])

  const totalW = colPx.reduce((a, b) => a + b, 0)
  return (
    <div className="boq-scroll">
      <table className="boq-grid" style={{ width: totalW }}>
        <colgroup>
          {colPx.map((w, i) => (
            <col key={i} style={{ width: w + 'px' }} />
          ))}
        </colgroup>
        <tbody>
          {s.rows.map((row, r) => {
            const blank = row.every((x) => !x.trim())
            return (
              <tr key={r} className={blank ? 'blank' : undefined}>
                {row.map((v, c) => {
                  if (skip.has(`${r},${c}`)) return null
                  const sp = span.get(`${r},${c}`)
                  const w = colPx.slice(c, c + (sp?.[1] ?? 1)).reduce((a, b) => a + b, 0)
                  const fits = textPx(v) <= w && !v.includes('\n')
                  return (
                    <td
                      key={c}
                      rowSpan={sp?.[0] && sp[0] > 1 ? sp[0] : undefined}
                      colSpan={sp?.[1] && sp[1] > 1 ? sp[1] : undefined}
                      className={(isNum(v) ? 'num ' : '') + (fits ? 'nw' : '')}
                    >
                      {v}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/** 내역서(엑셀) 불러오기 → 원가계산서에서 9대 예산 항목 자동 입력 + 5개 시트 보관·조회 */
export function BoqModal({
  projectId,
  projectName,
  budget,
  onClose,
  onApplied,
  onAddItem,
}: {
  projectId: string
  projectName: string
  budget: ArtBudget[]
  onClose: () => void
  onApplied: () => void
  onAddItem: () => void
}) {
  const { me } = useAuth()
  const [saved, setSaved] = useState<Saved | null>(null)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [parsed, setParsed] = useState<Parsed | null>(null)
  const [tab, setTab] = useState(SHEETS[0])
  const [truncUnit, setTruncUnit] = useState(10000) // 절삭 단위(원). 1이면 절삭 없음
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    supabase
      .from('art_boq')
      .select('file_name,sheets,updated_at')
      .eq('project_id', projectId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) setLoadErr(error.message)
        else if (data) setSaved(data as Saved)
      })
  }, [projectId])

  const sheets = parsed?.sheets ?? saved?.sheets ?? []
  const fileName = parsed?.file ?? saved?.file_name ?? null
  const active = sheets.find((s) => s.name === tab) ?? sheets[0]
  const items = parsed?.items
  const curAlloc = Object.fromEntries(budget.map((b) => [b.item, Number(b.alloc) || 0]))

  // 절삭: (공급가액 + 부가세)를 절삭 단위로 내리고, 줄어드는 금액은 노무비에서 차감 (곳간 기존 방식)
  const calc = useMemo(() => {
    if (!items) return null
    const rawTotal = BUDGET_9.reduce((s, k) => s + (items[k] || 0), 0)
    const rawSupply = rawTotal - (items['자문회비'] || 0) // 공급가액 (자문회비 제외)
    const vatOf = (x: number) => Math.round(x * 0.1)
    let supply = rawSupply
    if (truncUnit > 1) {
      const target = Math.floor((rawSupply + vatOf(rawSupply)) / truncUnit) * truncUnit
      let x = Math.floor(target / 1.1)
      while (x + vatOf(x) > target) x--
      while (x + 1 + vatOf(x + 1) <= target) x++
      supply = Math.min(rawSupply, x)
    }
    const cut = rawSupply - supply
    const applied: Record<string, number> = { ...items, 노무비: Math.max(0, (items['노무비'] || 0) - cut) }
    const total = BUDGET_9.reduce((s, k) => s + (applied[k] || 0), 0)
    return { rawSupply, supply, vat: vatOf(supply), cut, applied, total }
  }, [items, truncUnit])

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setBusy(true)
    setErr(null)
    setMsg(null)
    try {
      const p = await parseWorkbook(f)
      setParsed(p)
      setTab(SHEETS.find((n) => p.sheets.some((s) => s.name === n)) ?? SHEETS[0])
    } catch (ex) {
      setParsed(null)
      setErr('엑셀 열기 실패: ' + (ex instanceof Error ? ex.message : String(ex)))
    }
    setBusy(false)
  }

  async function apply() {
    if (!parsed || !items || !calc) return
    setBusy(true)
    setErr(null)
    const rows = BUDGET_9.map((item, i) => ({ project_id: projectId, item, alloc: calc.applied[item] || 0, sort: i })).filter(
      (r) => r.alloc > 0,
    )
    if (rows.length === 0) {
      setBusy(false)
      setErr('원가계산서에서 읽은 금액이 없습니다.')
      return
    }
    const { error } = await supabase.from('art_budget').upsert(rows, { onConflict: 'project_id,item' })
    if (error) {
      setBusy(false)
      setErr('예산 반영 실패: ' + error.message)
      return
    }
    const { error: e2 } = await supabase.from('art_boq').upsert({
      project_id: projectId,
      file_name: parsed.file,
      sheets: parsed.sheets,
      uploaded_by: me?.id ?? null,
      updated_at: new Date().toISOString(),
    })
    setBusy(false)
    onApplied()
    const sum = rows.reduce((s, r) => s + r.alloc, 0)
    setMsg(`${rows.length}개 항목 자동 입력 (합계 ${won(sum)}원${calc.cut ? ` · 절삭 ${won(calc.cut)}원 노무비 차감` : ''})`)
    if (e2) {
      setErr('예산은 반영됐지만 내역서 보관에 실패했습니다 (SQL 19 실행 필요): ' + e2.message)
      return
    }
    setSaved({ file_name: parsed.file, sheets: parsed.sheets, updated_at: new Date().toISOString() })
    setParsed(null)
  }

  async function download() {
    if (!sheets.length) return
    const XLSX = await import('xlsx')
    const wb = XLSX.utils.book_new()
    for (const s of sheets) {
      const ws = XLSX.utils.aoa_to_sheet(s.rows)
      ws['!merges'] = s.merges.map(([r1, c1, r2, c2]) => ({ s: { r: r1, c: c1 }, e: { r: r2, c: c2 } }))
      ws['!cols'] = s.widths.map((w) => ({ wch: w }))
      XLSX.utils.book_append_sheet(wb, ws, s.name)
    }
    XLSX.writeFile(wb, fileName || `내역서_${projectName}.xlsx`)
  }

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 1040, width: '96vw' }} onClick={(e) => e.stopPropagation()}>
        <div className="mh">
          <div>
            <div className="eyebrow">예산 집행 현황 · 세부내역</div>
            <h3>{projectName}</h3>
          </div>
          <div className="boq-actions">
            <label className="btn pri" title="내역서 엑셀 업로드">
              업로드
              <input type="file" accept=".xlsx,.xlsm,.xls" style={{ display: 'none' }} onChange={onFile} disabled={busy} />
            </label>
            
            {sheets.length > 0 && (
              <button className="btn sec" onClick={download}>다운로드</button>
            )}
            <button className="btn sec" onClick={onAddItem} title="예산 항목 직접 추가">추가</button>
            <button className="x" onClick={onClose}>✕</button>
          </div>
        </div>
        <div className="mb">
          <div className="t-sub" style={{ fontSize: 12 }}>
            {fileName ? `📄 ${fileName}` : '착공내역서 엑셀을 올리면 원가계산서에서 9대 예산 항목이 자동으로 채워집니다.'}
          </div>
          {loadErr && (
            <div className="login-alert err" style={{ margin: '8px 0 0' }}>
              보관된 내역서를 불러오지 못했습니다 (SQL 19 실행 필요): {loadErr}
            </div>
          )}
          {err && <div className="login-alert err" style={{ margin: '8px 0 0' }}>{err}</div>}
          {msg && <div className="login-alert" style={{ margin: '8px 0 0', color: 'var(--brand-ink)' }}>✓ {msg}</div>}

          {/* 자동 파악 결과 */}
          {items && calc && (
            <div style={{ marginTop: 12 }}>
              <div className="bud-h" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <div className="t">원가계산서에서 자동 파악한 예산</div>
                <label className="t-sub" style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 5, marginLeft: 'auto' }}>
                  절삭 단위
                  <select className="hr-in" style={{ width: 110 }} value={truncUnit} onChange={(e) => setTruncUnit(Number(e.target.value))}>
                    <option value={1}>절삭 안 함</option>
                    <option value={10}>10원</option>
                    <option value={100}>100원</option>
                    <option value={1000}>1,000원</option>
                    <option value={10000}>10,000원</option>
                    <option value={100000}>100,000원</option>
                  </select>
                </label>
                <button className="btn pri" style={{ padding: '4px 10px', fontSize: 12 }} onClick={apply} disabled={busy}>
                  {busy ? '반영 중…' : '예산에 반영'}
                </button>
              </div>
              <table className="rowtbl">
                <thead>
                  <tr>
                    <th>항목</th>
                    <th style={{ textAlign: 'right' }}>내역서 금액</th>
                    <th style={{ textAlign: 'right' }}>절삭 반영 예산</th>
                    <th style={{ textAlign: 'right' }}>현재 예산</th>
                  </tr>
                </thead>
                <tbody>
                  {BUDGET_9.map((k) => {
                    const changed = (calc.applied[k] || 0) !== (items[k] || 0)
                    return (
                      <tr key={k}>
                        <td>{k}</td>
                        <td className="tnum" style={{ textAlign: 'right', color: changed ? 'var(--muted)' : undefined, fontWeight: changed ? 400 : 700 }}>
                          {items[k] ? won(items[k]) : '—'}
                        </td>
                        <td className="tnum" style={{ textAlign: 'right', fontWeight: 700, color: changed ? 'var(--danger)' : undefined }}>
                          {calc.applied[k] ? won(calc.applied[k]) : '—'}
                          {changed && <span style={{ fontSize: 10.5, fontWeight: 500, marginLeft: 4 }}>(−{won(calc.cut)} 절삭)</span>}
                        </td>
                        <td className="tnum" style={{ textAlign: 'right', color: 'var(--muted)' }}>{curAlloc[k] ? won(curAlloc[k]) : '—'}</td>
                      </tr>
                    )
                  })}
                  <tr>
                    <td><b>합계</b></td>
                    <td className="tnum" style={{ textAlign: 'right', color: 'var(--muted)' }}>{won(BUDGET_9.reduce((s, k) => s + (items[k] || 0), 0))}</td>
                    <td className="tnum" style={{ textAlign: 'right', fontWeight: 800 }}>{won(calc.total)}</td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
              <div className="boq-sum">
                <span>공급가액(자문회비 제외) <b className="tnum">{won(calc.supply)}</b></span>
                <span>부가세(10%) <b className="tnum">{won(calc.vat)}</b></span>
                <span>공급가액+부가세 <b className="tnum">{won(calc.supply + calc.vat)}</b></span>
                <span>절삭액 <b className="tnum" style={{ color: calc.cut ? 'var(--danger)' : undefined }}>{calc.cut ? '−' + won(calc.cut) : '0'}</b></span>
              </div>
              <p className="t-sub" style={{ fontSize: 11.5, margin: '6px 0 0' }}>
                경비 = 경비 소계 − 기타경비. 절삭되는 금액은 노무비에서 차감해 공급가액+부가세가 절삭 단위에 딱 맞도록 반영합니다. 반영하면 기존 같은 항목은 덮어쓰고 내역서가 사업에 보관됩니다.
              </p>
            </div>
          )}

          {/* 시트 보기 */}
          {sheets.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div className="boq-tabs">
                {sheets.map((s) => (
                  <button key={s.name} className={s.name === active?.name ? 'on' : ''} onClick={() => setTab(s.name)}>
                    {s.name}
                  </button>
                ))}
              </div>
              {active && <SheetGrid s={active} />}
            </div>
          )}
          {sheets.length === 0 && !items && (
            <div className="t-sub" style={{ textAlign: 'center', padding: 30 }}>
              올려둔 내역서가 없습니다.
            </div>
          )}
        </div>
        <div className="mf">
          <button className="btn sec" onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  )
}
