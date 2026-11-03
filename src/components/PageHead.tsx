import type { ReactNode } from 'react'

/** 페이지 헤더 — 제목·설명·금색 라벨(eyebrow) 모두 표시하지 않음(중복 제거).
 *  현재 위치는 왼쪽 메뉴의 선택 표시로 구분한다. 우측 액션(검색·버튼)만 표시. */
export function PageHead({
  title,
  desc,
  actions,
}: {
  eyebrow?: string
  title: ReactNode
  desc?: string
  actions?: ReactNode
}) {
  void title
  void desc
  // 액션이 없으면 아무것도 렌더하지 않음(빈 헤더 공간 제거)
  if (!actions) return null
  return (
    <div className="ph ph-slim ph-actions-only">
      <div />
      <div className="acts">{actions}</div>
    </div>
  )
}
