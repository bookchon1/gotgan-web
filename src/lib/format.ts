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

/** YYYY-MM-DD → MM-DD (공정 기간 표기) */
export function mmdd(d: string | null): string {
  return d ? d.slice(5) : ''
}

/** 기간(일수) 포함 표기: from~to (N일) */
export function dateRange(from: string | null, to: string | null): string {
  if (!from) return ''
  if (!to || to === from) return mmdd(from)
  const days = Math.round((+new Date(to) - +new Date(from)) / 86_400_000) + 1
  return `${mmdd(from)}~${mmdd(to)} (${days}일)`
}
