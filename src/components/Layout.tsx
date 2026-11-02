import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Topbar from './Topbar'

export default function Layout() {
  // 모바일에서 사이드바 열림 (시안: #sb.open)
  const [sbOpen, setSbOpen] = useState(false)

  return (
    <div className="shell">
      <Sidebar mobileOpen={sbOpen} onClose={() => setSbOpen(false)} />
      <div className="main-wrap">
        <Topbar onToggleSidebar={() => setSbOpen((v) => !v)} />
        <main>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
