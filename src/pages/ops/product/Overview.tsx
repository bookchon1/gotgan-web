import { useMemo } from 'react'
import { won, invShort } from '../../../lib/format'
import { Kpi, StackBar, Thumb, StatChip } from './parts'
import { isProduct, statOf, type Item, type Sale } from './lib'
import type { ItemFilter } from './Items'

export type Go = (tab: string, f?: ItemFilter, openId?: string) => void

/** 한눈에 보기 — 숫자는 눌러서 해당 목록으로 이동 */
export function Overview({ items, sales, go }: { items: Item[]; sales: Sale[]; go: Go }) {
  const d = useMemo(() => {
    const P = items.filter(isProduct)
    const M = items.filter((x) => !isProduct(x))
    const by = (a: Item[], s: string) => a.filter((x) => statOf(x) === s).length
    const sc = (s: string) => P.filter((x) => (x.store_status ?? '미지정') === s).length
    const ym = new Date().toISOString().slice(0, 7)
    const ms = sales.filter((s) => s.sold_at.startsWith(ym))
    const byMajor = new Map<string, Item[]>()
    for (const x of P) byMajor.set(x.major ?? '미분류', [...(byMajor.get(x.major ?? '미분류') ?? []), x])
    const asset = items.reduce((s, x) => s + Math.max(x.avail, 0) * x.unit_price, 0)
    // 확인 필요: 안전재고 이하 + 스토어에 등록돼 있는데 재고가 없는 상품(판매 기회 손실)
    const attention = [...items.filter((x) => statOf(x) === 'low'), ...P.filter((x) => statOf(x) === 'out' && x.store_status === '등록 완료')]
    return {
      P, M, pOk: by(P, 'ok'), pLow: by(P, 'low'), pOut: by(P, 'out'), mOk: by(M, 'ok'), mLow: by(M, 'low'), mOut: by(M, 'out'),
      sDone: sc('등록 완료'), sPrep: sc('등록 준비'), sNone: sc('미등록') + sc('미지정'),
      monthAmt: ms.reduce((s, x) => s + x.qty * x.unit_price, 0), monthQty: ms.reduce((s, x) => s + x.qty, 0), monthN: ms.length,
      byMajor, asset, attention,
      noCost: items.filter((x) => x.unit_price === 0).length,
      noSafe: items.filter((x) => x.min_qty === 0).length,
      noSell: P.filter((x) => x.sell_price === 0).length,
      incoming: items.filter((x) => x.incoming > 0),
      doneNoUrl: P.filter((x) => x.store_status === '등록 완료' && !x.store_url).length,
    }
  }, [items, sales])

  return (
    <div className="pr-pane">
      <div className="pr-kpis">
        <Kpi label="판매상품" value={d.P.length} sub={`스토어 등록 완료 ${d.sDone}`} onClick={() => go('products')} />
        <Kpi label="부자재" value={d.M.length} sub="제작·포장·기타" onClick={() => go('materials')} />
        <Kpi label="발주 검토" value={d.pLow + d.mLow} tone={d.pLow + d.mLow ? 'warn' : undefined} sub="안전재고 이하" onClick={() => go(d.pLow >= d.mLow ? 'products' : 'materials', { stat: 'low' })} />
        <Kpi label="품절·소진" value={d.pOut + d.mOut} tone={d.pOut + d.mOut ? 'bad' : undefined} sub={`상품 ${d.pOut} · 자재 ${d.mOut}`} onClick={() => go('products', { stat: 'out' })} />
        <Kpi label="이번 달 판매" value={`₩${invShort(d.monthAmt)}`} sub={`${d.monthN}건 · ${d.monthQty}개`} onClick={() => go('sales')} />
        <Kpi label="재고 자산" value={`₩${invShort(d.asset)}`} sub="가용재고 × 매입단가" />
      </div>

      <div className="pr-cols">
        <section className="pr-card pad">
          <h3>재고 상태</h3>
          <div className="pr-sub">판매상품 <b>{d.P.length}</b></div>
          <StackBar parts={[
            { label: '정상', n: d.pOk, cls: 'ok', onClick: () => go('products', { stat: 'ok' }) },
            { label: '발주 검토', n: d.pLow, cls: 'low', onClick: () => go('products', { stat: 'low' }) },
            { label: '품절', n: d.pOut, cls: 'out', onClick: () => go('products', { stat: 'out' }) },
          ]} />
          <div className="pr-sub" style={{ marginTop: 18 }}>부자재 <b>{d.M.length}</b></div>
          <StackBar parts={[
            { label: '정상', n: d.mOk, cls: 'ok', onClick: () => go('materials', { stat: 'ok' }) },
            { label: '발주 검토', n: d.mLow, cls: 'low', onClick: () => go('materials', { stat: 'low' }) },
            { label: '소진', n: d.mOut, cls: 'out', onClick: () => go('materials', { stat: 'out' }) },
          ]} />
        </section>

        <section className="pr-card pad">
          <h3>스마트스토어 등록</h3>
          <div className="pr-sub">판매상품 {d.P.length}개 중 <b>{d.sDone}</b>개 등록 완료</div>
          <StackBar parts={[
            { label: '등록 완료', n: d.sDone, cls: 'ok', onClick: () => go('store', { store: '등록 완료' }) },
            { label: '등록 준비', n: d.sPrep, cls: 'low', onClick: () => go('store', { store: '등록 준비' }) },
            { label: '미등록', n: d.sNone, cls: 'none', onClick: () => go('store', { store: '미등록' }) },
          ]} />
          <div className="pr-sub" style={{ marginTop: 18 }}>대분류별</div>
          <div className="pr-majors">
            {[...d.byMajor.entries()].map(([m, a]) => {
              const done = a.filter((x) => x.store_status === '등록 완료').length
              return (
                <button key={m} onClick={() => go('products', { major: m })}>
                  <span>{m}</span>
                  <i><u style={{ width: `${(done / a.length) * 100}%` }} /></i>
                  <b className="tnum">{done}<small>/{a.length}</small></b>
                </button>
              )
            })}
          </div>
        </section>
      </div>

      <div className="pr-cols">
        <section className="pr-card pad">
          <h3>확인이 필요한 품목 <small>{d.attention.length}</small></h3>
          {d.attention.length === 0 ? (
            <div className="pr-empty">지금 확인할 품목이 없습니다.</div>
          ) : (
            <ul className="pr-list">
              {d.attention.slice(0, 8).map((it) => (
                <li key={it.id} onClick={() => go(isProduct(it) ? 'products' : 'materials', undefined, it.id)}>
                  <Thumb it={it} size={32} />
                  <div><b>{it.name}</b><small>{it.option_spec ?? ''}</small></div>
                  <span className="tnum q">{it.avail}</span>
                  <StatChip it={it} />
                </li>
              ))}
            </ul>
          )}
          {d.attention.length > 8 && <button className="pr-more" onClick={() => go('products', { stat: 'low' })}>전체 보기</button>}
        </section>

        <section className="pr-card pad">
          <h3>입고 예정 <small>{d.incoming.length}</small></h3>
          {d.incoming.length === 0 ? (
            <div className="pr-empty">입고 예정 품목이 없습니다.</div>
          ) : (
            <ul className="pr-list">
              {d.incoming.slice(0, 6).map((it) => (
                <li key={it.id} onClick={() => go(isProduct(it) ? 'products' : 'materials', undefined, it.id)}>
                  <Thumb it={it} size={32} />
                  <div><b>{it.name}</b><small>{it.option_spec ?? ''}</small></div>
                  <span className="tnum q in">+{it.incoming}</span>
                </li>
              ))}
            </ul>
          )}
          <h3 style={{ marginTop: 20 }}>최근 판매</h3>
          {sales.length === 0 ? (
            <div className="pr-empty">판매 기록이 없습니다.</div>
          ) : (
            <ul className="pr-list plain">
              {sales.slice(0, 5).map((s) => {
                const it = items.find((x) => x.id === s.inventory_id)
                return (
                  <li key={s.id}>
                    <small className="d">{s.sold_at.slice(5).replace('-', '/')}</small>
                    <div><b>{it?.name ?? '삭제된 품목'}</b><small>{it?.option_spec ?? ''}</small></div>
                    <span className="tnum q">{s.qty}개</span>
                    <span className="tnum amt">₩{won(s.qty * s.unit_price)}</span>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>

      <section className="pr-card pad">
        <h3>입력 점검</h3>
        <div className="pr-checks">
          <button onClick={() => go('products')}><b className="tnum">{d.noSafe}</b><span>안전재고 미설정 품목</span></button>
          <button onClick={() => go('products')}><b className="tnum">{d.noCost}</b><span>매입단가 미입력 품목</span></button>
          <button onClick={() => go('products')}><b className="tnum">{d.noSell}</b><span>판매가 미입력 상품</span></button>
          <button onClick={() => go('store', { store: '등록 완료' })}><b className="tnum">{d.doneNoUrl}</b><span>등록 완료인데 URL 없음</span></button>
        </div>
      </section>
    </div>
  )
}
