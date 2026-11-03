import { useMemo, useState } from 'react'
import { PageHead } from '../../components/PageHead'
import { Icon } from '../../components/Icon'
import { ErrorBanner, LoadingRow, EmptyRow } from '../../components/States'
import { supabase } from '../../lib/supabase'
import { useQuery } from '../../lib/useQuery'
import { useAuth } from '../../lib/auth'
import type { Employee } from '../../types/db'

type Tab = 'all' | 'admin' | 'user'

const DEPT_LABEL: Record<string, string> = {
  art: '미술',
  management: '경영',
  product: '상품',
  promotion: '홍보',
  experience: '체험',
  education: '교육',
}
function deptLabel(key: string | null): string {
  return key ? DEPT_LABEL[key] ?? '대표' : '대표'
}

export default function Users() {
  const { me } = useAuth()
  const [tab, setTab] = useState<Tab>('all')
  const [q, setQ] = useState('')

  const empQ = useQuery<Employee[]>(
    async () =>
      await supabase
        .from('employees')
        .select('*')
        .eq('status', '재직')
        .order('sort', { ascending: true }),
    [],
  )
  const all = empQ.data ?? []
  const admins = all.filter((e) => e.role === 'admin').length
  const users = all.length - admins

  const list = useMemo(
    () =>
      all
        .filter((e) => tab === 'all' || e.role === tab)
        .filter((e) => !q || e.name.includes(q) || deptLabel(e.dept_key).includes(q)),
    [all, tab, q],
  )

  return (
    <div className="page on">
      <PageHead
        eyebrow="PEOPLE & PERMISSIONS"
        title="사용자관리"
        desc="구성원을 등록하고 역할과 기능별 접근 권한을 설정하세요."
        actions={
          <button className="btn pri">
            <Icon name="approval" className="icon ic" /> 사용자 등록
          </button>
        }
      />
      <section className="panel">
        <ErrorBanner error={empQ.error} table="employees" />
        <div className="toolbar">
          <div className="tabs">
            <button className={tab === 'all' ? 'on' : ''} onClick={() => setTab('all')}>
              전체 <span>{all.length}</span>
            </button>
            <button className={tab === 'admin' ? 'on' : ''} onClick={() => setTab('admin')}>
              관리자 <span>{admins}</span>
            </button>
            <button className={tab === 'user' ? 'on' : ''} onClick={() => setTab('user')}>
              일반 <span>{users}</span>
            </button>
          </div>
          <label className="search" style={{ marginLeft: 'auto' }}>
            <svg className="icon" width="16" height="16" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4-4" />
            </svg>
            <input placeholder="이름·부서 검색" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
        </div>
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>구성원</th>
                <th>부서</th>
                <th>역할</th>
                <th>허용 기능</th>
                <th>상태</th>
                <th>관리</th>
              </tr>
            </thead>
            <tbody>
              {empQ.loading && <LoadingRow cols={6} />}
              {!empQ.loading &&
                list.map((e) => (
                  <tr key={e.id}>
                    <td>
                      <span className="owner">
                        <span className="av-s">{e.name.slice(0, 1)}</span>
                        <div>
                          <div className="t-title">
                            {e.name}
                            {me?.id === e.id && <span className="badge green">나</span>}
                          </div>
                          <div className="t-sub">{e.title}</div>
                        </div>
                      </span>
                    </td>
                    <td>{deptLabel(e.dept_key)}</td>
                    <td>
                      {e.is_root ? (
                        <span className="badge green">최초 관리자</span>
                      ) : e.role === 'admin' ? (
                        <span className="badge green">관리자</span>
                      ) : (
                        <span className="badge">일반 사용자</span>
                      )}
                    </td>
                    <td>
                      <div className="areas">
                        <span className="badge">업무·문서·결재·일정</span>
                        {e.is_mgmt && <span className="badge gold">인사·노무·회계 담당</span>}
                      </div>
                    </td>
                    <td>
                      <span className="chip c-done">
                        <i />
                        활성
                      </span>
                    </td>
                    <td>
                      <button className="btn sec" style={{ padding: '5px 10px' }}>
                        권한 설정
                      </button>
                    </td>
                  </tr>
                ))}
              {!empQ.loading && list.length === 0 && !empQ.error && (
                <EmptyRow cols={6} text="구성원이 없습니다." />
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
