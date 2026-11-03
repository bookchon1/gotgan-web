// 금액·숫자 포맷 — 시안의 won / eok / invShort 그대로.

/** 원 단위 콤마: 12,345,678 */
export function won(n: number | null | undefined): string {
  return (n || 0).toLocaleString('ko-KR')
}

/** 큰 금액 축약: 억/만 (예: 2.4억, 3,200만, 8,500) */
export function eok(n: number): string {
  if (Math.abs(n) >= 100_000_000)
    return (n / 100_000_000).toFixed(2).replace(/\.?0+$/, '') + '억'
  if (Math.abs(n) >= 10_000)
    return Math.round(n / 10_000).toLocaleString('ko-KR') + '만'
  return won(n)
}

/** 만원 단위 숫자 (차트 라벨용): 6000 → 600 */
export function toMan(n: number): number {
  return Math.round(n / 10_000)
}

/** 재고 등 간단 축약: 10,000 이상은 '만' */
export function invShort(n: number): string {
  if (n >= 10_000)
    return (n / 10_000).toFixed(n % 10_000 ? 1 : 0).replace(/\.0$/, '') + '만'
  return won(n)
}

/** 어떤 형태로 와도 YYYY-MM-DD 로 (date 컬럼이 ISO 타임스탬프로 와도 안전) */
export function dateOnly(d: string | null | undefined): string {
  if (!d) return ''
  return d.length >= 10 ? d.slice(0, 10) : d
}

/** YYYY-MM-DD → MM-DD (공정 기간 표기) */
export function mmdd(d: string | null): string {
  const s = dateOnly(d)
  return s ? s.slice(5) : ''
}

/** 기간(일수) 포함 표기: from~to (N일) */
export function dateRange(from: string | null, to: string | null): string {
  const f = dateOnly(from)
  const t = dateOnly(to)
  if (!f) return ''
  if (!t || t === f) return mmdd(f)
  const days = Math.round((+new Date(t) - +new Date(f)) / 86_400_000) + 1
  return `${mmdd(f)}~${mmdd(t)} (${days}일)`
}
