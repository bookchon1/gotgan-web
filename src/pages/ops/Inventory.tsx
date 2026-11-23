import { useCallback, useState } from 'react'
import { ErrorBanner } from '../../components/States'
import { supabase } from '../../lib/supabase'
import { useQuery } from '../../lib/useQuery'
import { useAuth } from '../../lib/auth'
import { Overview, type Go } from './product/Overview'
import { ItemsTab, type ItemFilter } from './product/Items'
import { BomTab } from './product/Bom'
import { SalesTab } from './product/Sales'
import { StoreTab } from './product/Store'
import { isProduct, statOf, type Bom, type Item, type Listing, type Sale } from './product/lib'
import './product/product.css'

type Tab = 'overview' | 'products' | 'materials' | 'bom' | 'sales' | 'store'

/** 상품실 — 재고·판매 관리 (한눈에 보기 / 판매상품 / 부자재 / 구성표 / 판매기록 / 스토어 등록) */
export default function ProductRoom() {
  const { me } = useAuth()
  const isAdmin = me?.role === 'admin'
  const [tab, setTab] = useState<Tab>('overview')
  const [preset, setPreset] = useState<ItemFilter | undefined>()
  const [openId, setOpenId] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)

  const itemQ = useQuery<Item[]>(async () => await supabase.from('inventory_v').select('*').order('item_id', { ascending: true }), [])
  const saleQ = useQuery<Sale[]>(async () => await supabase.from('product_sales').select('*').order('sold_at', { ascending: false }).order('created_at', { ascending: false }).limit(2000), [])
  const bomQ = useQuery<Bom[]>(async () => await supabase.from('product_bom').select('*'), [])
  const listQ = useQuery<Listing[]>(async () => await supabase.from('store_listings').select('*'), [])
  const items = itemQ.data ?? []
  const sales = saleQ.data ?? []

  const reload = useCallback(() => { itemQ.reload(); saleQ.reload(); bomQ.reload(); listQ.reload() }, [itemQ, saleQ, bomQ, listQ])

  const go: Go = (t, f, id) => {
    setPreset(f)
    setOpenId(id ?? null)
    setNonce((n) => n + 1)
    setTab(t as Tab)
  }

  const P = items.filter(isProduct)
  const M = items.filter((x) => !isProduct(x))
  const alertN = items.filter((x) => statOf(x) === 'low').length
  const tabs: { k: Tab; label: string; n?: number; warn?: boolean }[] = [
    { k: 'overview', label: '한눈에 보기', n: alertN || undefined, warn: true },
    { k: 'products', label: '판매상품', n: P.length },
    { k: 'materials', label: '부자재', n: M.length },
    { k: 'bom', label: '구성표' },
    { k: 'sales', label: '판매기록' },
    { k: 'store', label: '스토어 등록' },
  ]
  const missing = itemQ.error && itemQ.error !== 'config'

  return (
    <div className="page on pr">
      <header className="pr-head">
        <h1>상품실</h1>
        <nav className="pr-tabs" role="tablist">
          {tabs.map((t) => (
            <button key={t.k} role="tab" aria-selected={tab === t.k} className={tab === t.k ? 'on' : ''} onClick={() => go(t.k)}>
              {t.label}
              {t.n !== undefined && <i className={t.warn ? 'warn' : ''}>{t.n}</i>}
            </button>
          ))}
        </nav>
      </header>

      <ErrorBanner error={itemQ.error} table="inventory_v" />
      {missing && <div className="pr-note warn">상품실 데이터 구조가 아직 준비되지 않았습니다. Supabase에서 SQL 46, 47을 실행해 주세요.</div>}

      {tab === 'overview' && <Overview items={items} sales={sales} go={go} />}
      {tab === 'products' && <ItemsTab key={`p${nonce}`} kind="product" items={items} loading={itemQ.loading} isAdmin={isAdmin} reload={reload} preset={preset} openId={openId} clearOpen={() => setOpenId(null)} />}
      {tab === 'materials' && <ItemsTab key={`m${nonce}`} kind="material" items={items} loading={itemQ.loading} isAdmin={isAdmin} reload={reload} preset={preset} openId={openId} clearOpen={() => setOpenId(null)} />}
      {tab === 'bom' && <BomTab items={items} bom={bomQ.data ?? []} isAdmin={isAdmin} reload={reload} />}
      {tab === 'sales' && <SalesTab items={items} sales={sales} loading={saleQ.loading} isAdmin={isAdmin} reload={reload} />}
      {tab === 'store' && <StoreTab key={`s${nonce}`} items={items} listings={listQ.data ?? []} loading={itemQ.loading} isAdmin={isAdmin} reload={reload} preset={preset?.store} />}
    </div>
  )
}
