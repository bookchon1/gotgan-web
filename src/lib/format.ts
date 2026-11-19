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

/** 만원 단위 표기: 54,000,000 → 5,400만, 192,000,000 → 19,200만 (억 환산 없음) */
export function man(n: number): string {
  if (!n) return '0'
  return Math.round(n / 10_000).toLocaleString('ko-KR') + '만'
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

/** 결재 선택 목록 표기: 대표·실장(김도래·김성헌)만 직책을 붙이고, 나머지는 이름만 */
export function approverLabel(e: { name: string; title?: string | null }): string {
  return e.name === '김도래' || e.name === '김성헌' ? `${e.name} ${e.title ?? ''}`.trim() : e.name
}

/** 결재선 후보 정렬: 김도래·김성헌 먼저, 나머지는 가나다순 */
export function sortApprovers<T extends { name: string }>(list: T[]): T[] {
  const top = ['김도래', '김성헌']
  const rank = (n: string) => {
    const i = top.indexOf(n)
    return i < 0 ? top.length : i
  }
  return [...list].sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name, 'ko'))
}
