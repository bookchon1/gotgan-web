// 업무관리 영역(부서) 정의 — 시안의 AREAS 그대로.
// 사이드바 서브메뉴 + 업무현황 라우팅의 단일 소스.

export interface AreaView {
  /** 라우트 키 (hr, ops-art, tasks ...) */
  k: string
  /** 표시 라벨 */
  t: string
}

export interface Area {
  id: string
  label: string
  /** 색상 CSS 변수 클래스 (ar-manage 등) */
  cls: string
  color: string
  /** 경영: 관리자 전용 메뉴 */
  adminOnly?: boolean
  /** 상품·홍보·체험·교육: 잠금 표시 */
  locked?: boolean
  views: AreaView[]
}

export const AREAS: Area[] = [
  {
    id: 'management',
    label: '경영',
    cls: 'ar-manage',
    color: 'var(--ar-manage)',
    adminOnly: true,
    views: [
      { k: 'hr', t: '인사관리' },
      { k: 'labor', t: '노무관리' },
      { k: 'accounting', t: '회계관리' },
      { k: 'tasks', t: '업무현황' },
    ],
  },
  {
    id: 'art',
    label: '미술',
    cls: 'ar-art',
    color: 'var(--ar-art)',
    views: [
      { k: 'ops-art', t: '사업관리' },
      { k: 'ops-art-field', t: '현장관리' },
      { k: 'tasks', t: '업무현황' },
    ],
  },
  {
    id: 'product',
    label: '상품',
    cls: 'ar-product',
    color: 'var(--ar-product)',
    locked: true,
    views: [
      { k: 'ops-product', t: '재고현황' },
      { k: 'tasks', t: '업무현황' },
    ],
  },
  {
    id: 'promotion',
    label: '홍보',
    cls: 'ar-promo',
    color: 'var(--ar-promo)',
    locked: true,
    views: [
      { k: 'ops-promotion', t: '홍보현황' },
      { k: 'tasks', t: '업무현황' },
    ],
  },
  {
    id: 'experience',
    label: '체험',
    cls: 'ar-exp',
    color: 'var(--ar-exp)',
    locked: true,
    views: [
      { k: 'ops-experience', t: '체험현황' },
      { k: 'tasks', t: '업무현황' },
    ],
  },
  {
    id: 'education',
    label: '교육',
    cls: 'ar-edu',
    color: 'var(--ar-edu)',
    locked: true,
    views: [
      { k: 'ops-edu-progress', t: '수업진도' },
      { k: 'ops-edu-materials', t: '수업자료' },
      { k: 'ops-edu-payments', t: '납부현황' },
      { k: 'tasks', t: '업무현황' },
    ],
  },
]

/** 사업자(법인/개인/더북촌) — 시안 BIZ_NAME / BIZ_KIND */
export const BIZ: Record<string, { name: string; kind: string }> = {
  법인: { name: '(주)북촌불교미술연구소', kind: '법인' },
  개인: { name: '도래헌', kind: '개인' },
  더북촌: { name: '더북촌', kind: '개인' },
}

/** 표기: 회사명 (구분) */
export function bizLabel(biz: string): string {
  const b = BIZ[biz]
  return b ? `${b.name} (${b.kind})` : biz
}

/** 사업자 코드 → 짧은 한글명 (법인/개인/더북촌). 미지정은 공란. */
export function bizShort(biz: string | null | undefined): string {
  if (!biz) return ''
  return BIZ[biz]?.kind ?? biz
}

/** 부서 키 → 한글 라벨 (art→미술 …). 매칭 없으면 키 그대로, 없으면 공란. */
const DEPT_LABEL: Record<string, string> = Object.fromEntries(
  AREAS.map((a) => [a.id, a.label]),
)
export function deptLabel(key: string | null | undefined): string {
  if (!key) return ''
  return DEPT_LABEL[key] ?? key
}

/** 사업자별 소속 부서 — 시안 ACCT_ORG */
export const ACCT_ORG: Record<string, string[]> = {
  법인: ['경영', '미술'],
  개인: ['상품', '홍보', '경영', '교육', '체험'],
  더북촌: ['경영'],
}
