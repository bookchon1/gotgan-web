import { supabase } from '../../../lib/supabase'
import type { Inventory } from '../../../types/db'

/** 상품실 품목 (inventory_v 뷰: 가용재고·판매누계 포함) */
export interface Item extends Inventory {
  item_id: string | null
  major: string | null
  minor: string | null
  mat_type: string | null
  option_spec: string | null
  stock_form: string | null
  prep_status: string | null
  unit: string | null
  used_qty: number
  sell_price: number
  store_status: string | null
  store_url: string | null
  usage_note: string | null
  image_path: string | null
  sold_qty: number
  avail: number
}
export interface Sale {
  id: string
  sold_at: string
  channel: string | null
  inventory_id: string | null
  qty: number
  unit_price: number
  order_no: string | null
  memo: string | null
  created_at: string
}
export interface Bom {
  id: string
  product_id: string
  material_id: string
  qty_per: number
  memo: string | null
  sort: number
}
export interface Listing {
  inventory_id: string
  store_category: string | null
  display_name: string | null
  keywords: string | null
  summary: string | null
  detail: string | null
  main_image: string | null
  detail_images: string | null
  shipping: string | null
  registered_on: string | null
  check_note: string | null
}

export const isProduct = (it: Item) => it.category !== '부자재'

export type Stat = 'ok' | 'low' | 'out'
/** 재고상태: 가용재고 ≤ 0 → 품절(소진), ≤ 안전재고 → 발주 검토, 그 외 정상 */
export function statOf(it: Item): Stat {
  if (it.avail <= 0) return 'out'
  if (it.avail <= it.min_qty) return 'low'
  return 'ok'
}
export function statLabel(it: Item): string {
  const s = statOf(it)
  return s === 'ok' ? '정상' : s === 'low' ? '발주 검토' : isProduct(it) ? '품절' : '소진'
}

export const MAJORS = ['체험&키트', '단청화구', '도서&디자인 굿즈', '전통공예']
export const MINORS: Record<string, string[]> = {
  '체험&키트': ['단청안료', '마커펜', '채색 도안', '체험키트'],
  단청화구: [],
  '도서&디자인 굿즈': ['도서', '디자인 굿즈'],
  전통공예: ['공예품', '수공예품'],
}
export const MAT_TYPES = ['제작 부자재', '포장 부자재', '기타']
export const STORE_STATES = ['등록 완료', '등록 준비', '미등록']
export const PREP_STATES = ['즉시출고', '출고준비 필요']
export const STOCK_FORMS = ['완제품', '벌크', '낱개', '세트']
export const CHANNELS = ['스마트스토어', '오프라인 판매', '체험·행사', '직접 판매', '기타']

export function imgUrl(path: string | null | undefined): string | null {
  if (!path) return null
  if (/^https?:\/\//.test(path)) return path
  return supabase.storage.from('product-images').getPublicUrl(path).data.publicUrl
}

export function nextItemId(items: Item[], kind: 'S' | 'M'): string {
  let max = 0
  for (const it of items) {
    const m = it.item_id?.match(/^([SMB])-(\d+)$/)
    if (m && (kind === 'S' ? m[1] === 'S' : m[1] !== 'S')) max = Math.max(max, Number(m[2]))
  }
  return `${kind}-${String(max + 1).padStart(4, '0')}`
}

/** 이름 + 옵션을 한 줄로 */
export function fullName(it: Pick<Item, 'name' | 'option_spec'>): string {
  return it.option_spec ? `${it.name} · ${it.option_spec}` : it.name
}

export function csvDownload(filename: string, head: string[], rows: (string | number | null | undefined)[][]) {
  const esc = (v: string | number | null | undefined) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const csv = '﻿' + [head, ...rows].map((r) => r.map(esc).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
