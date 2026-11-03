import { Icon } from './Icon'
import { useAuth } from '../lib/auth'

const WD = ['일', '월', '화', '수', '목', '금', '토']

function todayLabel(): string {
  const d = new Date()
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${WD[d.getDay()]}요일`
}

export default function Topbar({ onToggleSidebar }: { onToggleSidebar: () => void }) {
  const { me } = useAuth()
  const avatar = me?.name?.slice(0, 1) ?? '곳'

  return (
    <header className="topbar">
      <button className="hamb" onClick={onToggleSidebar}>
        <Icon name="menu" size={20} />
      </button>
      {/* 상단 브레드크럼 제거: 현재 위치는 왼쪽 메뉴의 선택 표시로 구분(중복 제거) */}
      <div className="bc" />
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
