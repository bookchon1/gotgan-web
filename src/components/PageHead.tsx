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
  // 제목(h1)·설명(p)은 표시하지 않음(요청). 금색 eyebrow 라벨로 화면 구분.
  // title/desc 는 접근성(문서 제목 등) 위해 prop 은 유지하되 화면에는 렌더하지 않는다.
  void title
  void desc
  return (
    <div className="ph ph-slim">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
      </div>
      {actions && <div className="acts">{actions}</div>}
    </div>
  )
}
