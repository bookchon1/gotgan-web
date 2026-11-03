import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth } from './lib/auth'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import HR from './pages/HR'
import { Placeholder } from './pages/Placeholder'
import Tasks from './pages/Tasks'
import ArtList from './pages/ops/ArtList'
import Accounting from './pages/accounting/Accounting'

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
        <Route path="/ops/art/:id" element={<Placeholder title="사업 상세" />} />
        <Route path="/ops/art-field" element={<Placeholder title="현장관리" />} />
        {/* 기타 영역 */}
        <Route path="/ops/product" element={<Placeholder title="재고현황" />} />
        <Route path="/ops/promotion" element={<Placeholder title="홍보현황" />} />
        <Route path="/ops/experience" element={<Placeholder title="체험현황" />} />
        <Route path="/ops/edu-progress" element={<Placeholder title="수업진도" />} />
        <Route path="/ops/edu-materials" element={<Placeholder title="수업자료" />} />
        <Route path="/ops/edu-payments" element={<Placeholder title="납부현황" />} />

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
              <Placeholder title="노무관리" />
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
        <Route path="/approvals" element={<Placeholder title="전자결재" />} />
        <Route path="/documents" element={<Placeholder title="문서보관" />} />
        <Route path="/calendar" element={<Placeholder title="일정표" />} />

        {/* 관리자 */}
        <Route
          path="/users"
          element={
            <RequireAdmin>
              <Placeholder title="사용자관리" />
            </RequireAdmin>
          }
        />
        <Route
          path="/security"
          element={
            <RequireAdmin>
              <Placeholder title="권한 검증" />
            </RequireAdmin>
          }
        />
        <Route
          path="/activity"
          element={
            <RequireAdmin>
              <Placeholder title="활동 기록" />
            </RequireAdmin>
          }
        />

        <Route path="*" element={<Placeholder title="페이지를 찾을 수 없습니다" />} />
      </Route>
    </Routes>
  )
}
