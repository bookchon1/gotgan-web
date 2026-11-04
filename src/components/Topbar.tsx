import { useLocation } from 'react-router-dom'
import { Icon } from './Icon'
import { useAuth } from '../lib/auth'
import { breadcrumbFor } from '../data/pages'

const WD = ['일', '월', '화', '수', '목', '금', '토']

function todayLabel(): string {
  const d = new Date()
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${WD[d.getDay()]}요일`
}

export default function Topbar({ onToggleSidebar }: { onToggleSidebar: () => void }) {
  const { me } = useAuth()
  const loc = useLocation()
  const avatar = me?.name?.slice(0, 1) ?? '곳'
  const crumb = breadcrumbFor(loc.pathname)

  return (
    <header className="topbar">
      <button className="hamb" onClick={onToggleSidebar}>
        <Icon name="menu" size={20} />
      </button>
      {/* 상단 위치 표시(브레드크럼): 워크스페이스 › 섹션 › 현재 화면 (시안과 동일) */}
      <div className="bc">
        <span className="ws">워크스페이스</span>
        <span className="sep">›</span>
        <strong>{crumb.main}</strong>
        {crumb.extra && (
          <>
            {' '}
            <span className="sep">›</span> <strong>{crumb.extra}</strong>
          </>
        )}
      </div>
      <div className="tr">
        <span className="pl">
          <Icon name="lock" size={12} /> 비공개
        </span>
        <span className="dt">{todayLabel()}</span>
        <span className="av">{avatar}</span>
      </div>
    </header>
  )
}
