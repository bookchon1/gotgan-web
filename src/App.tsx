import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth } from './lib/auth'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import HR from './pages/HR'
import { Placeholder } from './pages/Placeholder'
import Tasks from './pages/Tasks'
import ArtList from './pages/ops/ArtList'
import ArtDetail from './pages/ops/ArtDetail'
import Inventory from './pages/ops/Inventory'
import {
  ArtField,
  Promotion,
  Experience,
  EduProgress,
  EduMaterials,
  EduPayments,
} from './pages/ops/DeptScreens'
import Accounting from './pages/accounting/Accounting'
import Labor from './pages/labor/Labor'
import Approvals from './pages/Approvals'
import Calendar from './pages/Calendar'
import Documents from './pages/Documents'
import Users from './pages/admin/Users'
import Security from './pages/admin/Security'
import Activity from './pages/admin/Activity'

/** 로그인 필요 가드 */
function RequireAuth({ children }: { children: JSX.Element }) {
  const { loading, session } = useAuth()
  const loc = useLocation()
  if (loading) return <FullScreen>불러오는 중…</FullScreen>
  if (!session) return <Navigate to="/login" state={{ from: loc }} replace />
  return children
}

/** 관리자 전용 가드 */
function RequireAdmin({ children }: { children: JSX.Element }) {
  const { isAdmin } = useAuth()
  if (!isAdmin)
    return (
      <Placeholder
        title="접근 권한 없음"
        note="이 화면은 관리자만 볼 수 있습니다."
      />
    )
  return children
}

function FullScreen({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        color: 'var(--muted)',
      }}
    >
      {children}
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route path="/" element={<Dashboard />} />

        {/* 업무현황 (영역별) */}
        <Route path="/tasks/:area" element={<Tasks />} />

        {/* 미술 */}
        <Route path="/ops/art" element={<ArtList />} />
        <Route path="/ops/art/:id" element={<ArtDetail />} />
        <Route path="/ops/art-field" element={<ArtField />} />
        {/* 기타 영역 */}
        <Route path="/ops/product" element={<Inventory />} />
        <Route path="/ops/promotion" element={<Promotion />} />
        <Route path="/ops/experience" element={<Experience />} />
        <Route path="/ops/edu-progress" element={<EduProgress />} />
        <Route path="/ops/edu-materials" element={<EduMaterials />} />
        <Route path="/ops/edu-payments" element={<EduPayments />} />

        {/* 경영 (관리자) */}
        <Route
          path="/hr"
          element={
            <RequireAdmin>
              <HR />
            </RequireAdmin>
          }
        />
        <Route
          path="/labor"
          element={
            <RequireAdmin>
              <Labor />
            </RequireAdmin>
          }
        />
        <Route
          path="/accounting"
          element={
            <RequireAdmin>
              <Accounting />
            </RequireAdmin>
          }
        />

        {/* 공통 */}
        <Route path="/approvals" element={<Approvals />} />
        <Route path="/documents" element={<Documents />} />
        <Route path="/calendar" element={<Calendar />} />

        {/* 관리자 */}
        <Route
          path="/users"
          element={
            <RequireAdmin>
              <Users />
            </RequireAdmin>
          }
        />
        <Route
          path="/security"
          element={
            <RequireAdmin>
              <Security />
            </RequireAdmin>
          }
        />
        <Route
          path="/activity"
          element={
            <RequireAdmin>
              <Activity />
            </RequireAdmin>
          }
        />

        <Route path="*" element={<Placeholder title="페이지를 찾을 수 없습니다" />} />
      </Route>
    </Routes>
  )
}
