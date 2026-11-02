// 시안에서 쓰던 라인 아이콘들. stroke 기반 (CSS .icon 이 stroke:currentColor).
import type { CSSProperties } from 'react'

const PATHS: Record<string, string> = {
  home: 'M3 12l9-9 9 9M5 10v10h14V10',
  tasks: 'M9 11l3 3 8-8M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0',
  approval: 'M9 12l2 2 4-4M7.8 3h8.4L21 7.8v8.4L16.2 21H7.8L3 16.2V7.8z',
  doc: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  users:
    'M17 20v-2a4 4 0 0 0-3-3.87M9 20v-2a4 4 0 0 1 3-3.87M12 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 8a2.5 2.5 0 1 0 0-5',
  shield: 'M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z',
  activity: 'M3 12h4l3 8 4-16 3 8h4',
  chevron: 'M6 9l6 6 6-6',
  calendar: 'M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM4 9h16M8 3v4M16 3v4',
  clock: 'M12 7v5l3 2M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0',
  lock: 'M5 11V8a7 7 0 0 1 14 0v3M4 11h16v10H4z',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  menu: 'M3 6h18M3 12h18M3 18h18',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z',
  check: 'M5 12l4 4 10-10',
}

interface IconProps {
  name: keyof typeof PATHS | string
  size?: number
  className?: string
  style?: CSSProperties
}

export function Icon({ name, size = 18, className = 'icon', style }: IconProps) {
  const d = PATHS[name]
  const extra = name === 'eye' // eye 는 원 + 경로
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      style={style}
      aria-hidden="true"
    >
      {d && <path d={d} />}
      {extra && <circle cx="12" cy="12" r="3" />}
    </svg>
  )
}
