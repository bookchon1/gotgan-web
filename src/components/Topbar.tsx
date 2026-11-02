import { useLocation } from 'react-router-dom'
import { Icon } from './Icon'
import { breadcrumbFor } from '../data/pages'
import { useAuth } from '../lib/auth'

const WD = ['일', '월', '화', '수', '목', '금', '토']

function todayLabel(): string {
  const d = new Date()
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${WD[d.getDay()]}요일`
}

export default function Topbar({ onToggleSidebar }: { onToggleSidebar: () => void }) {
  const loc = useLocation()
  const { me } = useAuth()
  const bc = breadcrumbFor(loc.pathname)
  const avatar = me?.name?.slice(0, 1) ?? '곳'

  return (
    <header className="topbar">
      <button className="hamb" onClick={onToggleSidebar}>
        <Icon name="menu" size={20} />
      </button>
      <div className="bc">
        <span className="ws">워크스페이스</span>
        <span className="sep">›</span>
        <strong>{bc.main}</strong>
        {bc.extra && (
          <>
            <span className="sep">›</span>
            <span>{bc.extra}</span>
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
