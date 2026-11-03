import { useMemo, useState } from 'react'
import { PageHead } from '../../components/PageHead'
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
  const [addOpen, setAddOpen] = useState(false)
  const [permOf, setPermOf] = useState<Employee | null>(null)
  const [busy, setBusy] = useState(false)
  const [addForm, setAddForm] = useState({ name: '', title: '연구원', dept: 'art', role: 'user' as 'admin' | 'user' })

  async function createUser() {
    if (!addForm.name.trim()) return
    setBusy(true)
    await supabase.from('employees').insert({
      name: addForm.name.trim(),
      dept_key: addForm.dept || null,
      title: addForm.title,
      join_ym: new Date().toISOString().slice(0, 7).replace('-', '.'),
      role: addForm.role,
      is_mgmt: false,
      status: '재직',
    })
    setBusy(false)
    setAddOpen(false)
    setAddForm({ name: '', title: '연구원', dept: 'art', role: 'user' })
    empQ.reload()
  }
  async function savePerm(role: 'admin' | 'user', mgmt: boolean) {
    if (!permOf) return
    setBusy(true)
    await supabase.from('employees').update({ role, is_mgmt: mgmt }).eq('id', permOf.id)
    // admin_grants: mgmt 면 전 영역 부여, 아니면 제거
    await supabase.from('admin_grants').delete().eq('employee_id', permOf.id)
    if (mgmt) {
      await supabase.from('admin_grants').insert(
        (['hr', 'labor', 'accounting'] as const).map((area) => ({ employee_id: permOf.id, area })),
      )
    }
    setBusy(false)
    setPermOf(null)
    empQ.reload()
  }

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
          <button className="btn pri" onClick={() => setAddOpen(true)}>
            사용자 등록
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
                      <button className="btn sec" style={{ padding: '5px 10px' }} onClick={() => setPermOf(e)} disabled={e.is_root}>
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

      {/* 사용자 등록 */}
      {addOpen && (
        <div className="modal-bg" onClick={() => setAddOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="mh">
              <div>
                <div className="eyebrow">사용자 등록</div>
                <h3>새 구성원</h3>
              </div>
              <button className="x" onClick={() => setAddOpen(false)}>
                ✕
              </button>
            </div>
            <div className="mb">
              <div className="mfield">
                <label>이름</label>
                <input className="ctl" value={addForm.name} onChange={(e) => setAddForm({ ...addForm, name: e.target.value })} autoFocus />
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <div className="mfield" style={{ flex: 1 }}>
                  <label>소속</label>
                  <select className="ctl" value={addForm.dept} onChange={(e) => setAddForm({ ...addForm, dept: e.target.value })}>
                    <option value="art">미술</option>
                    <option value="management">경영</option>
                    <option value="product">상품</option>
                    <option value="promotion">홍보</option>
                    <option value="experience">체험</option>
                    <option value="education">교육</option>
                    <option value="">대표</option>
                  </select>
                </div>
                <div className="mfield" style={{ flex: 1 }}>
                  <label>직급</label>
                  <input className="ctl" value={addForm.title} onChange={(e) => setAddForm({ ...addForm, title: e.target.value })} />
                </div>
              </div>
              <div className="mfield">
                <label>역할</label>
                <select className="ctl" value={addForm.role} onChange={(e) => setAddForm({ ...addForm, role: e.target.value as 'admin' | 'user' })}>
                  <option value="user">일반 사용자</option>
                  <option value="admin">관리자</option>
                </select>
              </div>
              <div className="login-alert warn" style={{ margin: 0 }}>
                등록 후 로그인하려면 Supabase Authentication에서 계정을 만들고 연결해야 합니다.
              </div>
            </div>
            <div className="mf">
              <button className="btn sec" onClick={() => setAddOpen(false)} disabled={busy}>
                취소
              </button>
              <button className="btn pri" onClick={createUser} disabled={busy || !addForm.name.trim()}>
                {busy ? '등록 중…' : '등록'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 권한 설정 */}
      {permOf && <PermModal emp={permOf} busy={busy} onClose={() => setPermOf(null)} onSave={savePerm} />}
    </div>
  )
}

function PermModal({
  emp,
  busy,
  onClose,
  onSave,
}: {
  emp: Employee
  busy: boolean
  onClose: () => void
  onSave: (role: 'admin' | 'user', mgmt: boolean) => void
}) {
  const [role, setRole] = useState<'admin' | 'user'>(emp.role)
  const [mgmt, setMgmt] = useState(emp.is_mgmt)
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="mh">
          <div>
            <div className="eyebrow">권한 설정</div>
            <h3>{emp.name}</h3>
          </div>
          <button className="x" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="mb">
          <div className="mfield">
            <label>역할</label>
            <select className="ctl" value={role} onChange={(e) => setRole(e.target.value as 'admin' | 'user')}>
              <option value="user">일반 사용자</option>
              <option value="admin">관리자</option>
            </select>
          </div>
          <label className="mfield" style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={mgmt} onChange={(e) => setMgmt(e.target.checked)} />
            <span style={{ fontSize: 13 }}>인사·노무·회계 담당 (급여·회계 전표 열람/처리)</span>
          </label>
        </div>
        <div className="mf">
          <button className="btn sec" onClick={onClose} disabled={busy}>
            취소
          </button>
          <button className="btn pri" onClick={() => onSave(role, mgmt)} disabled={busy}>
            {busy ? '저장 중…' : '저장'}
          </button>
        </div>
      </div>
    </div>
  )
}
