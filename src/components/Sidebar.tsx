import { useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { Icon } from './Icon'
import { AREAS } from '../data/areas'
import { useAuth } from '../lib/auth'

/** 업무관리 서브메뉴(영역별) — 아코디언 (한 번에 하나만 열림, 시안과 동일) */
function TaskSubnav({ isAdmin }: { isAdmin: boolean }) {
  // 현재 펼쳐진 영역 id (하나만). 기본 미술.
  const [openArea, setOpenArea] = useState<string | null>('art')
  // 같은 영역 클릭 → 닫기, 다른 영역 클릭 → 그 영역만 열고 나머지는 닫기
  const toggle = (id: string) => setOpenArea((cur) => (cur === id ? null : id))

  return (
    <div className="subnav" id="task-sub">
      {AREAS.map((a) => {
        const isOpen = openArea === a.id
        return (
        <div key={a.id}>
          <button
            className={`dept-toggle${isOpen ? ' on' : ''}`}
            onClick={() => toggle(a.id)}
            id={`dt-${a.id}`}
          >
            <span className="sw" style={{ background: a.color }} />
            <span>{a.label}</span>
            <Icon
              name="chevron"
              className={`icon chev${isOpen ? ' open' : ''}`}
            />
          </button>
          <div className="dept-views" id={`dv-${a.id}`} hidden={!isOpen}>
            {a.views.map((v) => {
              const isPersonal = v.k === 'tasks'
              const showLock = !isPersonal && (a.locked || a.adminOnly)
              // 관리자 전용(경영 hr/labor/accounting)은 일반 사용자에게 숨김
              if (a.adminOnly && !isPersonal && !isAdmin) return null
              const to =
                v.k === 'tasks' ? `/tasks/${a.id}` : `/${stripOps(v.k)}`
              return (
                <NavLink
                  key={v.k}
                  to={to}
                  className={({ isActive }) => (isActive ? 'on' : '')}
                >
                  <span>·</span>
                  {v.t}
                  {showLock && <Icon name="lock" className="icon lk" />}
                </NavLink>
              )
            })}
          </div>
        </div>
        )
      })}
    </div>
  )
}

/** ops-art → ops/art 로 라우트 경로화 */
function stripOps(k: string): string {
  return k.startsWith('ops-') ? k.replace('ops-', 'ops/') : k
}

export default function Sidebar({
  mobileOpen = false,
  onClose,
}: {
  mobileOpen?: boolean
  onClose?: () => void
}) {
  const { me, isAdmin, signOut } = useAuth()
  const loc = useLocation()
  const navigate = useNavigate()
  const [tasksOpen, setTasksOpen] = useState(true)

  const tasksActive = loc.pathname.startsWith('/tasks') || loc.pathname.startsWith('/ops') ||
    ['/hr', '/labor', '/accounting'].includes(loc.pathname)

  async function onLogout() {
    await signOut()
    navigate('/login')
  }

  const avatar = me?.name?.slice(0, 1) ?? '곳'

  return (
    <aside className={`sidebar${mobileOpen ? ' open' : ''}`} id="sb" onClick={onClose}>
      <NavLink className="brand" to="/">
        <span className="logo-mark">
          <i />
          <i />
          <i />
        </span>
        <span>
          <b>곳간</b>
          <small>BOOKCHON WORKSPACE</small>
        </span>
      </NavLink>

      <div className="nav-head">WORKSPACE</div>
      <nav>
        <NavLink
          className={({ isActive }) => `ni${isActive ? ' on' : ''}`}
          to="/"
          end
        >
          <Icon name="home" className="icon ic" />
          <span>홈</span>
        </NavLink>

        {/* 업무관리 (3단) */}
        <button
          className={`ni${tasksActive ? ' on' : ''}`}
          onClick={() => setTasksOpen((v) => !v)}
        >
          <Icon name="tasks" className="icon ic" />
          <span>업무관리</span>
          <Icon
            name="chevron"
            className={`icon chev${tasksOpen ? ' open' : ''}`}
          />
        </button>
        {tasksOpen && <TaskSubnav isAdmin={isAdmin} />}

        <NavLink
          className={({ isActive }) => `ni${isActive ? ' on' : ''}`}
          to="/approvals"
        >
          <Icon name="approval" className="icon ic" />
          <span>전자결재</span>
          <b className="cnt">3</b>
        </NavLink>

        <NavLink
          className={({ isActive }) => `ni${isActive ? ' on' : ''}`}
          to="/documents"
        >
          <Icon name="doc" className="icon ic" />
          <span>문서보관</span>
        </NavLink>

        <NavLink
          className={({ isActive }) => `ni${isActive ? ' on' : ''}`}
          to="/calendar"
        >
          <Icon name="calendar" className="icon ic" />
          <span>일정표</span>
        </NavLink>
      </nav>

      {/* 관리자 전용 */}
      {isAdmin && (
        <>
          <div className="nav-head mgmt">ADMINISTRATION</div>
          <nav>
            <NavLink
              className={({ isActive }) => `ni${isActive ? ' on' : ''}`}
              to="/users"
            >
              <Icon name="users" className="icon ic" />
              <span>사용자관리</span>
            </NavLink>
            <NavLink
              className={({ isActive }) => `ni${isActive ? ' on' : ''}`}
              to="/security"
            >
              <Icon name="shield" className="icon ic" />
              <span>권한 검증</span>
            </NavLink>
            <NavLink
              className={({ isActive }) => `ni${isActive ? ' on' : ''}`}
              to="/activity"
            >
              <Icon name="activity" className="icon ic" />
              <span>활동 기록</span>
            </NavLink>
          </nav>
        </>
      )}

      <div className="sb-foot">
        <div className="priv">
          <div className="r1">
            <Icon name="shield" size={17} />
            안전한 업무 공간
          </div>
          <p>역할에 따라 접근 권한을 관리합니다.</p>
          <span className="tag">
            <i /> 비공개 호스팅
          </span>
        </div>
        <div className="sb-user">
          <span className="av">{avatar}</span>
          <div>
            <strong>{me?.name ?? '게스트'}</strong>
            <small>{isAdmin ? '관리자' : me ? '일반 사용자' : '미로그인'}</small>
          </div>
          <button className="out" title="로그아웃" onClick={onLogout}>
            <Icon name="logout" size={17} />
          </button>
        </div>
      </div>
    </aside>
  )
}
