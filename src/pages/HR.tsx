import { useEffect, useState } from 'react'
import { PageHead } from '../components/PageHead'
import { Icon } from '../components/Icon'
import { supabase, isConfigured } from '../lib/supabase'
import { useAuth } from '../lib/auth'

/** 인사관리 — 직원 명부 (조회 + 편집모드 CRUD). 시안 renderHrList 구조 그대로. */

interface Emp {
  id: string
  name: string
  dept_key: string | null
  title: string | null
  join_ym: string | null
  role: 'admin' | 'user'
  is_mgmt: boolean
  status: string
}

const DEPT_OPTS: [string, string][] = [
  ['art', '미술'],
  ['management', '경영'],
  ['product', '상품'],
  ['promotion', '홍보'],
  ['experience', '체험'],
  ['education', '교육'],
  ['', '대표'],
]

const DEPT_CLS: Record<string, string> = {
  art: 'ar-art',
  management: 'ar-manage',
  product: 'ar-product',
  promotion: 'ar-promo',
  experience: 'ar-exp',
  education: 'ar-edu',
}

function deptLabel(key: string | null): string {
  const d = DEPT_OPTS.find((x) => x[0] === (key ?? ''))
  return d ? d[1] : '대표'
}

export default function HR() {
  const { me } = useAuth()
  const [rows, setRows] = useState<Emp[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [edit, setEdit] = useState(false)
  const [saving, setSaving] = useState(false)

  async function load() {
    if (!isConfigured) {
      setLoading(false)
      setError('config')
      return
    }
    setLoading(true)
    const { data, error } = await supabase
      .from('employees')
      .select('id,name,dept_key,title,join_ym,role,is_mgmt,status')
      .eq('status', '재직')
      .order('sort', { ascending: true })
      .order('join_ym', { ascending: true })
    if (error) {
      setError(error.message)
      setRows([])
    } else {
      setError(null)
      setRows((data ?? []) as Emp[])
    }
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // --- 편집 동작 (로컬 상태 즉시 반영 → 저장은 blur/토글 완료 시 upsert) ---
  function setField(id: string, key: keyof Emp, val: string) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, [key]: val } : r)))
  }

  async function saveRow(r: Emp) {
    if (!isConfigured) return
    setSaving(true)
    const { error } = await supabase
      .from('employees')
      .update({
        name: r.name,
        dept_key: r.dept_key || null,
        title: r.title,
        join_ym: r.join_ym,
      })
      .eq('id', r.id)
    setSaving(false)
    if (error) setError(error.message)
  }

  async function delRow(id: string) {
    if (!isConfigured) return
    // 삭제 대신 퇴직 처리 (이력 보존) — 시안의 '재직만 집계'와 동일 효과
    setSaving(true)
    const { error } = await supabase
      .from('employees')
      .update({ status: '퇴직' })
      .eq('id', id)
    setSaving(false)
    if (error) {
      setError(error.message)
      return
    }
    setRows((rs) => rs.filter((r) => r.id !== id))
  }

  async function addEmp() {
    if (!isConfigured) return
    setSaving(true)
    const { data, error } = await supabase
      .from('employees')
      .insert({
        name: '새 직원',
        dept_key: 'art',
        title: '연구원',
        join_ym: new Date().toISOString().slice(0, 7).replace('-', '.'),
        role: 'user',
        is_mgmt: false,
        status: '재직',
      })
      .select('id,name,dept_key,title,join_ym,role,is_mgmt,status')
      .single()
    setSaving(false)
    if (error) {
      setError(error.message)
      return
    }
    setRows((rs) => [...rs, data as Emp])
    setEdit(true)
  }

  const count = rows.length

  return (
    <div className="page on">
      <PageHead
        eyebrow="경영 · 인사"
        title="인사관리"
        desc="재직 중인 구성원 명부입니다. 편집 모드에서 등록·수정·퇴직 처리할 수 있습니다."
        actions={
          <button
            className={`btn ${edit ? 'pri' : 'sec'}`}
            onClick={async () => {
              if (edit) {
                // 편집 완료 시 전체 저장
                for (const r of rows) await saveRow(r)
              }
              setEdit((v) => !v)
            }}
            disabled={saving || !!error}
          >
            {edit ? (
              <>
                <Icon name="check" size={13} style={{ marginRight: 4 }} />
                편집 완료
              </>
            ) : (
              '직원 편집'
            )}
          </button>
        }
      />

      <section className="panel">
        <div className="panel-h">
          <div>
            <h2>
              직원 명부 <span className="count">{loading ? '…' : count}</span>
            </h2>
          </div>
          {edit && (
            <button className="btn txt r" onClick={addEmp} disabled={saving}>
              + 직원 등록
            </button>
          )}
        </div>

        {error === 'config' && (
          <div className="login-alert warn" style={{ margin: '0 0 12px' }}>
            Supabase 연결이 설정되지 않았습니다. <code>.env</code> 설정 후 직원 명부가
            표시됩니다.
          </div>
        )}
        {error && error !== 'config' && (
          <div className="login-alert err" style={{ margin: '0 0 12px' }}>
            직원 정보를 불러오지 못했습니다: {error}
            <div style={{ marginTop: 4, fontSize: 11 }}>
              (employees 테이블·RLS가 아직 생성되지 않았을 수 있습니다.)
            </div>
          </div>
        )}

        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>이름</th>
                <th>소속</th>
                <th>직급</th>
                <th>입사</th>
                {edit && <th style={{ textAlign: 'right' }} />}
              </tr>
            </thead>
            <tbody>
              {!loading &&
                rows.map((e) =>
                  edit ? (
                    <tr key={e.id}>
                      <td>
                        <input
                          className="hr-in"
                          value={e.name}
                          onChange={(ev) => setField(e.id, 'name', ev.target.value)}
                          onBlur={() => saveRow(e)}
                        />
                      </td>
                      <td>
                        <select
                          className="hr-in"
                          value={e.dept_key ?? ''}
                          onChange={(ev) => {
                            setField(e.id, 'dept_key', ev.target.value)
                          }}
                          onBlur={() => saveRow(e)}
                        >
                          {DEPT_OPTS.map((d) => (
                            <option key={d[0]} value={d[0]}>
                              {d[1]}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input
                          className="hr-in"
                          value={e.title ?? ''}
                          onChange={(ev) => setField(e.id, 'title', ev.target.value)}
                          onBlur={() => saveRow(e)}
                        />
                      </td>
                      <td>
                        <input
                          className="hr-in tnum"
                          value={e.join_ym ?? ''}
                          onChange={(ev) => setField(e.id, 'join_ym', ev.target.value)}
                          onBlur={() => saveRow(e)}
                        />
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          className="s20del"
                          title="퇴직 처리"
                          onClick={() => delRow(e.id)}
                        >
                          <svg className="icon" width="14" height="14" viewBox="0 0 24 24">
                            <path d="M6 6l12 12M18 6L6 18" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  ) : (
                    <tr key={e.id}>
                      <td>
                        <span className="owner">
                          <span className="av-s">{e.name.slice(0, 1)}</span>
                          {e.name}
                          {me?.id === e.id && <span className="badge green">나</span>}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`area ${DEPT_CLS[e.dept_key ?? ''] ?? 'ar-manage'}`}
                          style={{ fontSize: 10 }}
                        >
                          {deptLabel(e.dept_key)}
                        </span>
                      </td>
                      <td>{e.title}</td>
                      <td className="tnum" style={{ color: 'var(--muted)' }}>
                        {e.join_ym}
                      </td>
                    </tr>
                  ),
                )}
              {!loading && rows.length === 0 && !error && (
                <tr>
                  <td colSpan={edit ? 5 : 4} style={{ textAlign: 'center', color: 'var(--muted)', padding: 24 }}>
                    재직 중인 직원이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
