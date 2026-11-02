import type { ReactNode } from 'react'

/** 시안의 .ph (페이지 헤더) — eyebrow + h1 + 설명 + 우측 액션 */
export function PageHead({
  eyebrow,
  title,
  desc,
  actions,
}: {
  eyebrow?: string
  title: ReactNode
  desc?: string
  actions?: ReactNode
}) {
  return (
    <div className="ph">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {desc && <p>{desc}</p>}
      </div>
      {actions && <div className="acts">{actions}</div>}
    </div>
  )
}
