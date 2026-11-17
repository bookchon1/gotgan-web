import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'

export type ContactHit = {
  id: string
  name: string // 업체(소속)명
  person: string | null
  title: string | null
  kind: string | null
  phone1: string | null
  email: string | null
}

/** 업체정보(partners)에서 검색해 채우는 입력칸. 직접 입력도 가능. */
export function ContactSearch({
  value,
  onChange,
  onPick,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  onPick: (h: ContactHit) => void
  placeholder?: string
}) {
  const [hits, setHits] = useState<ContactHit[]>([])
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ left: number; top: number; width: number } | null>(null)
  const ref = useRef<HTMLInputElement>(null)
  const seq = useRef(0)
  const typed = useRef(false) // 사용자가 직접 입력했을 때만 검색

  useEffect(() => {
    if (!typed.current) return
    const q = value.trim()
    if (!q) {
      setHits([])
      return
    }
    const my = ++seq.current
    const t = setTimeout(async () => {
      const { data, error } = await supabase.rpc('partner_search', { p_q: q })
      if (my !== seq.current) return
      setHits(error ? [] : ((data ?? []) as ContactHit[]))
    }, 180)
    return () => clearTimeout(t)
  }, [value])

  function place() {
    const r = ref.current?.getBoundingClientRect()
    if (r) setPos({ left: r.left, top: r.bottom + 2, width: Math.max(r.width, 280) })
  }

  return (
    <>
      <input
        ref={ref}
        className="hr-in"
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(e) => {
          typed.current = true
          onChange(e.target.value)
          place()
          setOpen(true)
        }}
        onFocus={() => {
          place()
          setOpen(true)
        }}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
      />
      {open && hits.length > 0 && pos && (
        <div className="csug" style={{ left: pos.left, top: pos.top, width: pos.width }}>
          <div className="csug-h">업체정보에서 검색 · 선택하면 자동 입력</div>
          {hits.map((h) => (
            <button
              key={h.id}
              type="button"
              className="csug-i"
              onMouseDown={(e) => {
                e.preventDefault()
                typed.current = false
                onPick(h)
                setOpen(false)
              }}
            >
              <span className="n">
                <b>{h.person || h.name}</b>
                {h.person && h.name !== h.person && <span className="o"> · {h.name}</span>}
                {h.kind && <span className="k">{h.kind}</span>}
              </span>
              <span className="c">{[h.phone1, h.email].filter(Boolean).join(' · ') || '연락처 없음'}</span>
            </button>
          ))}
        </div>
      )}
    </>
  )
}

/** 업체정보 한 건 → 관계자/자문위원 행에 채울 값 */
export function hitToRow(h: ContactHit) {
  const org = h.person && h.name === h.person ? '' : h.name
  return { name: h.person || '', org, phone: h.phone1 ?? '', email: h.email ?? '' }
}
