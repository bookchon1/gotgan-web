import { useState, type ReactNode } from 'react'
import { imgUrl, statLabel, statOf, type Item } from './lib'

/** 이미지 썸네일 — 없으면 이름 첫 글자 타일 */
export function Thumb({ it, size = 40, quiet }: { it: Pick<Item, 'image_path' | 'name' | 'category'>; size?: number; quiet?: boolean }) {
  const [bad, setBad] = useState(false)
  const u = imgUrl(it.image_path)
  const style = { width: size, height: size, fontSize: Math.round(size * 0.42) }
  if (quiet && (!u || bad)) return null // 이미지가 없으면 자리 표시 타일을 그리지 않음(목록을 깔끔하게)
  if (u && !bad) return <img className="pr-th" style={style} src={u} alt="" onError={() => setBad(true)} loading="lazy" />
  return (
    <span className={`pr-th ph ${it.category === '부자재' ? 'mat' : ''}`} style={style}>
      {(it.name || '·').slice(0, 1)}
    </span>
  )
}

export function StatChip({ it }: { it: Item }) {
  return <span className={`pr-st ${statOf(it)}`}>{statLabel(it)}</span>
}

export function StoreChip({ v }: { v: string | null }) {
  const cls = v === '등록 완료' ? 'done' : v === '등록 준비' ? 'prep' : 'none'
  return <span className={`pr-sc ${cls}`}>{v || '미지정'}</span>
}

/** 칩 필터 줄 */
export function Chips({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { v: string; label: string; n?: number }[] }) {
  return (
    <div className="pr-chips" role="tablist">
      {options.map((o) => (
        <button key={o.v} role="tab" aria-selected={value === o.v} className={value === o.v ? 'on' : ''} onClick={() => onChange(o.v)}>
          {o.label}
          {o.n !== undefined && <i>{o.n}</i>}
        </button>
      ))}
    </div>
  )
}

export function SearchBox({ value, onChange, width }: { value: string; onChange: (v: string) => void; width?: number }) {
  return (
    <label className="pr-search" style={width ? { width } : undefined}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <circle cx="11" cy="11" r="7" />
        <path d="M21 21l-4-4" />
      </svg>
      <input placeholder="검색" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  )
}

/** 우측 슬라이드 패널 */
export function Drawer({ title, sub, onClose, children, footer }: { title: ReactNode; sub?: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="pr-dim" onClick={onClose}>
      <aside className="pr-drawer" onClick={(e) => e.stopPropagation()} role="dialog">
        <header>
          <div>
            {sub && <small>{sub}</small>}
            <h3>{title}</h3>
          </div>
          <button className="x" onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </header>
        <div className="pr-dbody">{children}</div>
        {footer && <footer>{footer}</footer>}
      </aside>
    </div>
  )
}

export function Field({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <label className={`pr-f${wide ? ' wide' : ''}`}>
      <span>{label}</span>
      {children}
    </label>
  )
}

/** 숫자 입력(콤마 허용) */
export function NumIn({ value, onChange, disabled, money, width }: { value: number; onChange: (n: number) => void; disabled?: boolean; money?: boolean; width?: number }) {
  return (
    <input
      className="ctl tnum"
      inputMode="numeric"
      disabled={disabled}
      style={width ? { width } : undefined}
      value={value ? (money ? value.toLocaleString('ko-KR') : String(value)) : ''}
      onChange={(e) => onChange(Number(e.target.value.replace(/[^0-9]/g, '')) || 0)}
    />
  )
}

export function Kpi({ label, value, sub, tone, onClick }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'warn' | 'bad' | 'ok'; onClick?: () => void }) {
  return (
    <div className={`pr-kpi ${tone ?? ''}${onClick ? ' click' : ''}`} onClick={onClick} role={onClick ? 'button' : undefined}>
      <small>{label}</small>
      <b className="tnum">{value}</b>
      {sub && <em>{sub}</em>}
    </div>
  )
}

/** 누적 막대 (비율) */
export function StackBar({ parts }: { parts: { label: string; n: number; cls: string; onClick?: () => void }[] }) {
  const total = parts.reduce((s, p) => s + p.n, 0) || 1
  return (
    <div className="pr-stack">
      <div className="bar">
        {parts.map((p) =>
          p.n > 0 ? <span key={p.label} className={p.cls} style={{ width: `${(p.n / total) * 100}%` }} title={`${p.label} ${p.n}`} /> : null,
        )}
      </div>
      <div className="lg">
        {parts.map((p) => (
          <button key={p.label} className={p.onClick ? 'click' : ''} onClick={p.onClick} disabled={!p.onClick}>
            <i className={p.cls} />
            {p.label}
            <b className="tnum">{p.n}</b>
          </button>
        ))}
      </div>
    </div>
  )
}
