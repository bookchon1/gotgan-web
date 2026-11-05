import { useEffect, useState } from 'react'
import { PageHead } from '../components/PageHead'
import { supabase, isConfigured } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import type { Employee, HrAssignment } from '../types/db'

/** 인사관리 — 대기업형 상세 인사카드.
 *  명부(검색·필터) → 행 클릭 → 상세 모달(기본정보·인사정보·학력/경력·발령이력) 편집. */

type Emp = Employee

const DEPT_OPTS: [string, string][] = [
  ['art', '미술'],
  ['management', '경영'],
  ['product', '상품'],
  ['promotion', '홍보'],
  ['experience', '체험'],
  ['education', '교육'],
  ['', '소속 없음'],
]
const DEPT_CLS: Record<string, string> = {
  art: 'ar-art',
  management: 'ar-manage',
  product: 'ar-product',
  promotion: 'ar-promo',
  experience: 'ar-exp',
  education: 'ar-edu',
}
const EMP_TYPES = ['정규직', '계약직', '일용직', '파견', '프리랜서']
const STATUS_OPTS: Emp['status'][] = ['재직', '휴직', '퇴직']
const ASSIGN_KINDS = ['입사', '승진', '부서이동', '보직변경', '휴직', '복직', '퇴직', '기타']

function deptLabel(key: string | null): string {
  // 소속이 없거나(대표·임원 등) 매칭 안 되면 공란(빈칸). 드롭다운 라벨('소속 없음')과 별개.
  if (!key) return ''
  const d = DEPT_OPTS.find((x) => x[0] === key)
  return d && d[0] ? d[1] : ''
}
function fmtDate(d: string | null): string {
  if (!d) return '—'
  return d.slice(0, 10)
}
function statusBadge(s: string): string {
  if (s === '재직') return 'green'
  if (s === '휴직') return 'gold'
  return 'gray'
}

/** 직급·직책을 한 명칭으로 묶음. 같으면 한 번만, 다르면 "직급 · 직책", 한쪽만 있으면 그것만. */
function roleLabel(title: string | null | undefined, position: string | null | undefined): string {
  const t = (title ?? '').trim()
  const p = (position ?? '').trim()
  if (t && p) return t === p ? t : `${t} · ${p}`
  return t || p || '—'
}

export default function HR() {
  const { me } = useAuth()
  const [rows, setRows] = useState<Emp[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // 상세 모달 대상
  const [openId, setOpenId] = useState<string | null>(null)

  async function load() {
    if (!isConfigured) {
      setLoading(false)
      setError('config')
      return
    }
    setLoading(true)
    const { data, error } = await supabase
      .from('employees')
      .select('*')
      // 입사일(입사 순서) 기준 정렬 — 입사일 없는 직원은 뒤로, 같으면 sort 보조
      .order('join_date', { ascending: true, nullsFirst: false })
      .order('sort', { ascending: true })
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

  // 전체 상태(재직·휴직·퇴직) 모두 표시 — 입사일 기준 정렬은 아래 load 에서 수행.
  const filtered = rows

  // 요약 KPI (재직 기준)
  const active = rows.filter((r) => r.status === '재직')
  // 부서 수: 조직 전체 부서(대표 제외) 기준 — 재직자 유무와 무관하게 고정 6개
  const deptCount = DEPT_OPTS.filter(([k]) => k !== '').length
  const regular = active.filter((r) => r.employment_type === '정규직').length
  const nonRegular = active.length - regular

  async function addEmp() {
    if (!isConfigured) return
    const { data, error } = await supabase
      .from('employees')
      .insert({
        name: '새 직원',
        dept_key: 'art',
        title: '연구원',
        employment_type: '정규직',
        join_date: new Date().toISOString().slice(0, 10),
        join_ym: new Date().toISOString().slice(0, 7).replace('-', '.'),
        role: 'user',
        is_mgmt: false,
        status: '재직',
      })
      .select('*')
      .single()
    if (error) {
      setError(error.message)
      return
    }
    setRows((rs) => [...rs, data as Emp])
    setOpenId((data as Emp).id)
  }

  const current = rows.find((r) => r.id === openId) ?? null

  return (
    <div className="page on">
      <PageHead
        eyebrow="경영 · 인사"
        title="인사관리"
        desc="구성원 명부와 상세 인사정보를 관리합니다. 이름을 클릭하면 상세 인사카드가 열립니다."
      />

      {/* 요약 KPI */}
      <div className="stats" style={{ marginBottom: 14 }}>
        <HrStat lbl="전체 인원" n={active.length} sub="재직" />
        <HrStat lbl="부서" n={deptCount} unit="개" sub="운영 중" />
        <HrStat lbl="정규직" n={regular} sub="재직" />
        <HrStat lbl="비정규직" n={nonRegular} sub="계약·일용 등" />
      </div>

      <section className="panel">
        {error === 'config' && (
          <div className="login-alert warn" style={{ margin: '0 0 12px' }}>
            Supabase 연결이 설정되지 않았습니다. <code>.env</code> 설정 후 직원명부가 표시됩니다.
          </div>
        )}
        {error && error !== 'config' && (
          <div className="login-alert err" style={{ margin: '0 0 12px' }}>
            직원 정보를 불러오지 못했습니다: {error}
          </div>
        )}

        {/* 직원명부 헤더: 왼쪽 제목 · 오른쪽 끝 직원등록 */}
        <div className="toolbar hr-roster-bar">
          <h2 style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>
            직원명부 <span className="count">{loading ? '…' : filtered.length}</span>
          </h2>
          <button className="btn txt hr-add-btn" onClick={addEmp} disabled={!!error} style={{ marginLeft: 'auto' }}>
            +직원등록
          </button>
        </div>

        <div className="tbl-wrap">
          <table className="hr-table">
            <thead>
              <tr>
                <th>사번</th>
                <th>이름</th>
                <th>소속</th>
                <th>직급 / 직책</th>
                <th>고용형태</th>
                <th>입사일</th>
                <th>상태</th>
              </tr>
            </thead>
            <tbody>
              {!loading &&
                filtered.map((e) => (
                  <tr
                    key={e.id}
                    className="hr-row"
                    onClick={() => setOpenId(e.id)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td className="tnum" style={{ color: 'var(--muted)' }}>
                      {e.emp_no ?? '—'}
                    </td>
                    <td>
                      <span className="owner">
                        <span className="av-s">{e.name.slice(0, 1)}</span>
                        {e.name}
                        {me?.id === e.id && <span className="badge green">나</span>}
                      </span>
                    </td>
                    <td>
                      <span className="dept-cell">
                        {deptLabel(e.dept_key) && (
                          <span
                            className={`area ${DEPT_CLS[e.dept_key ?? ''] ?? 'ar-manage'}`}
                            style={{ fontSize: 10 }}
                          >
                            {deptLabel(e.dept_key)}
                          </span>
                        )}
                        {(e.extra_depts ?? []).map((dk) => (
                          <span
                            key={dk}
                            className={`area ${DEPT_CLS[dk] ?? 'ar-manage'} area-sub`}
                            style={{ fontSize: 10 }}
                            title="겸소속"
                          >
                            {deptLabel(dk)}
                          </span>
                        ))}
                      </span>
                    </td>
                    <td>{roleLabel(e.title, e.position)}</td>
                    <td>{e.employment_type ?? '—'}</td>
                    <td className="tnum" style={{ color: 'var(--muted)' }}>
                      {fmtDate(e.join_date) !== '—' ? fmtDate(e.join_date) : e.join_ym ?? '—'}
                    </td>
                    <td>
                      <span className={`badge ${statusBadge(e.status)}`}>{e.status}</span>
                    </td>
                  </tr>
                ))}
              {!loading && filtered.length === 0 && !error && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', color: 'var(--muted)', padding: 24 }}>
                    조건에 맞는 직원이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {current && (
        <EmpCardModal
          emp={current}
          onClose={() => setOpenId(null)}
          onSaved={(updated) =>
            setRows((rs) => rs.map((r) => (r.id === updated.id ? updated : r)))
          }
          onRemoved={(id) => {
            setRows((rs) => rs.map((r) => (r.id === id ? { ...r, status: '퇴직' } : r)))
            setOpenId(null)
          }}
          onDeleted={(id) => {
            setRows((rs) => rs.filter((r) => r.id !== id))
            setOpenId(null)
          }}
        />
      )}
    </div>
  )
}

function HrStat({ lbl, n, sub, unit = '명' }: { lbl: string; n: number; sub?: string; unit?: string }) {
  return (
    <div className="stat">
      <div>
        <div className="lbl">{lbl}</div>
        <div className="val tnum">
          {n}
          <small>{unit}</small>
        </div>
        {sub && <div className="stat-sub">{sub}</div>}
      </div>
    </div>
  )
}

/* ========================= 상세 인사카드 모달 ========================= */

type Tab = 'basic' | 'hr' | 'edu' | 'assign'

function EmpCardModal({
  emp,
  onClose,
  onSaved,
  onRemoved,
  onDeleted,
}: {
  emp: Emp
  onClose: () => void
  onSaved: (e: Emp) => void
  onRemoved: (id: string) => void
  onDeleted: (id: string) => void
}) {
  const [tab, setTab] = useState<Tab>('basic')
  const [form, setForm] = useState<Emp>(emp)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => setForm(emp), [emp])

  function set<K extends keyof Emp>(k: K, v: Emp[K]) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  async function save() {
    if (!isConfigured) return
    setSaving(true)
    setMsg(null)
    const { error } = await supabase
      .from('employees')
      .update({
        name: form.name,
        dept_key: form.dept_key || null,
        extra_depts: (form.extra_depts ?? []).filter((x) => x !== (form.dept_key ?? '')),
        title: form.title,
        position: form.position,
        employment_type: form.employment_type,
        status: form.status,
        join_date: form.join_date || null,
        leave_date: form.leave_date || null,
        birth_md: form.birth_md || null,
        gender: form.gender || null,
        phone: form.phone || null,
        email: form.email || null,
        address: form.address || null,
        emergency_name: form.emergency_name || null,
        emergency_phone: form.emergency_phone || null,
        education: form.education || null,
        career: form.career || null,
        certifications: form.certifications || null,
        memo: form.memo || null,
      })
      .eq('id', form.id)
    if (error) {
      setSaving(false)
      setMsg('저장 실패: ' + error.message)
      return
    }

    // 입사일이 바뀌면 발령이력의 '입사' 기록도 함께 맞춘다.
    //  - 기존 입사일과 일치하던 '입사' 발령을 새 입사일로 이동(최초입사 등 다른 입사기록은 보존)
    //  - 일치하는 입사 발령이 없으면 새로 생성
    const oldJoin = emp.join_date || null
    const newJoin = form.join_date || null
    if (newJoin && newJoin !== oldJoin) {
      let moved = false
      if (oldJoin) {
        const { data: upd } = await supabase
          .from('hr_assignments')
          .update({ eff_date: newJoin })
          .eq('employee_id', form.id)
          .eq('kind', '입사')
          .eq('eff_date', oldJoin)
          .select('id')
        moved = !!upd && upd.length > 0
      }
      if (!moved) {
        // 이동할 입사 발령이 없으면, '입사' 발령이 아예 없을 때만 새로 생성(중복 방지)
        const { data: exist } = await supabase
          .from('hr_assignments')
          .select('id')
          .eq('employee_id', form.id)
          .eq('kind', '입사')
          .eq('eff_date', newJoin)
        if (!exist || exist.length === 0) {
          await supabase
            .from('hr_assignments')
            .insert({ employee_id: form.id, eff_date: newJoin, kind: '입사', detail: '입사' })
        }
      }
    }

    setSaving(false)
    setMsg('저장되었습니다.')
    onSaved(form)
  }

  async function retire() {
    if (!isConfigured) return
    setSaving(true)
    const today = new Date().toISOString().slice(0, 10)
    const { error } = await supabase
      .from('employees')
      .update({ status: '퇴직', leave_date: today })
      .eq('id', form.id)
    setSaving(false)
    if (error) {
      setMsg('처리 실패: ' + error.message)
      return
    }
    onRemoved(form.id)
  }

  // 완전 삭제 — DB 행 제거(연관 발령/급여/휴가/근태 기록은 FK on delete cascade 로 함께 정리).
  // 되돌릴 수 없으므로 2단계 확인. 재직 중/기록 있는 직원은 가급적 '퇴직 처리' 권장.
  async function removeEmp() {
    if (!isConfigured) return
    const warn =
      `'${form.name}' 님을 완전히 삭제합니다.\n\n` +
      `· 이 직원의 발령이력·급여·휴가·근태 기록도 함께 삭제됩니다.\n` +
      `· 되돌릴 수 없습니다. (기록을 남기려면 '퇴직 처리'를 사용하세요)\n\n` +
      `정말 삭제하시겠습니까?`
    if (!window.confirm(warn)) return
    setSaving(true)
    setMsg(null)
    const { error } = await supabase.from('employees').delete().eq('id', form.id)
    setSaving(false)
    if (error) {
      setMsg('삭제 실패: ' + error.message)
      return
    }
    onDeleted(form.id)
  }

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal hr-card" onClick={(e) => e.stopPropagation()}>
        {/* 헤더 */}
        <div className="hr-card-head">
          <div className="hr-card-id">
            <div className="hr-card-name">
              <strong>{form.name}</strong>
              <span className={`hr-status ${statusBadge(form.status)}`}>{form.status}</span>
              <span className="hr-card-meta">
                {[form.emp_no ?? '사번 미지정', deptLabel(form.dept_key), roleLabel(form.title, form.position)]
                  .filter((x) => x && x !== '—')
                  .join('  ·  ')}
              </span>
            </div>
          </div>
          <button className="x" onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </div>

        {/* 탭 */}
        <div className="seg hr-tabs">
          <button className={tab === 'basic' ? 'on' : ''} onClick={() => setTab('basic')}>
            기본정보
          </button>
          <button className={tab === 'hr' ? 'on' : ''} onClick={() => setTab('hr')}>
            인사정보
          </button>
          <button className={tab === 'edu' ? 'on' : ''} onClick={() => setTab('edu')}>
            학력·경력
          </button>
          <button className={tab === 'assign' ? 'on' : ''} onClick={() => setTab('assign')}>
            발령이력
          </button>
        </div>

        <div className="mb hr-card-body">
          {tab === 'basic' && (
            <div className="hr-grid">
              <Field label="이름">
                <input className="ctl" value={form.name} onChange={(e) => set('name', e.target.value)} />
              </Field>
              <Field label="생일 (월-일)">
                <input
                  className="ctl"
                  placeholder="예: 03-15"
                  value={form.birth_md ?? ''}
                  onChange={(e) => set('birth_md', e.target.value)}
                />
              </Field>
              <Field label="성별">
                <select className="ctl" value={form.gender ?? ''} onChange={(e) => set('gender', e.target.value)}>
                  <option value="">선택</option>
                  <option value="남">남</option>
                  <option value="여">여</option>
                  <option value="기타">기타</option>
                </select>
              </Field>
              <Field label="휴대폰">
                <input className="ctl" placeholder="010-0000-0000" value={form.phone ?? ''} onChange={(e) => set('phone', e.target.value)} />
              </Field>
              <Field label="이메일">
                <input className="ctl" value={form.email ?? ''} onChange={(e) => set('email', e.target.value)} />
              </Field>
              <Field label="주소" full>
                <input className="ctl" value={form.address ?? ''} onChange={(e) => set('address', e.target.value)} />
              </Field>
              <Field label="비상연락처 (이름/관계)">
                <input className="ctl" placeholder="예: 홍길동 (배우자)" value={form.emergency_name ?? ''} onChange={(e) => set('emergency_name', e.target.value)} />
              </Field>
              <Field label="비상연락처 (번호)">
                <input className="ctl" placeholder="010-0000-0000" value={form.emergency_phone ?? ''} onChange={(e) => set('emergency_phone', e.target.value)} />
              </Field>
            </div>
          )}

          {tab === 'hr' && (
            <div className="hr-grid">
              <Field label="주소속">
                <select className="ctl" value={form.dept_key ?? ''} onChange={(e) => set('dept_key', e.target.value)}>
                  {DEPT_OPTS.map((d) => (
                    <option key={d[0]} value={d[0]}>
                      {d[1]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="겸소속 (복수 선택 가능)">
                <select
                  className="ctl"
                  value=""
                  onChange={(e) => {
                    const v = e.target.value
                    if (!v) return
                    const cur = form.extra_depts ?? []
                    if (!cur.includes(v)) set('extra_depts', [...cur, v])
                  }}
                >
                  <option value="">+ 겸소속 추가</option>
                  {DEPT_OPTS.filter(
                    (d) => d[0] !== '' && d[0] !== (form.dept_key ?? '') && !(form.extra_depts ?? []).includes(d[0]),
                  ).map((d) => (
                    <option key={d[0]} value={d[0]}>
                      {d[1]}
                    </option>
                  ))}
                </select>
                {(form.extra_depts ?? []).length > 0 && (
                  <div className="dept-chips" style={{ marginTop: 7 }}>
                    {(form.extra_depts ?? []).map((dk) => (
                      <button
                        type="button"
                        key={dk}
                        className="dept-chip on"
                        title="클릭하면 제거"
                        onClick={() => set('extra_depts', (form.extra_depts ?? []).filter((x) => x !== dk))}
                      >
                        <span className={`sw-dot ${DEPT_CLS[dk] ?? ''}`} />
                        {deptLabel(dk)}
                        <span style={{ marginLeft: 4, opacity: 0.6 }}>✕</span>
                      </button>
                    ))}
                  </div>
                )}
              </Field>
              <Field label="직급">
                <input className="ctl" placeholder="예: 선임연구원" value={form.title ?? ''} onChange={(e) => set('title', e.target.value)} />
              </Field>
              <Field label="직책">
                <input className="ctl" placeholder="예: 팀장 (없으면 비움)" value={form.position ?? ''} onChange={(e) => set('position', e.target.value)} />
              </Field>
              <Field label="고용형태">
                <select className="ctl" value={form.employment_type ?? ''} onChange={(e) => set('employment_type', e.target.value)}>
                  <option value="">선택</option>
                  {EMP_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="입사일">
                <input className="ctl" type="date" value={form.join_date ?? ''} onChange={(e) => set('join_date', e.target.value)} />
              </Field>
              <Field label="재직상태">
                <select className="ctl" value={form.status} onChange={(e) => set('status', e.target.value as Emp['status'])}>
                  {STATUS_OPTS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </Field>
              {form.status === '퇴직' && (
                <Field label="퇴사일">
                  <input className="ctl" type="date" value={form.leave_date ?? ''} onChange={(e) => set('leave_date', e.target.value)} />
                </Field>
              )}
              <Field label="인사 메모" full>
                <textarea className="ctl" rows={2} value={form.memo ?? ''} onChange={(e) => set('memo', e.target.value)} />
              </Field>
            </div>
          )}

          {tab === 'edu' && (
            <div className="hr-grid">
              <Field label="최종학력" full>
                <input className="ctl" placeholder="예: OO대학교 미술사학과 졸업" value={form.education ?? ''} onChange={(e) => set('education', e.target.value)} />
              </Field>
              <Field label="현재 담당업무" full>
                <textarea className="ctl" rows={3} placeholder="현재 담당업무" value={form.career ?? ''} onChange={(e) => set('career', e.target.value)} />
              </Field>
              <Field label="자격증" full>
                <textarea className="ctl" rows={2} placeholder="예: 문화재수리기술자(보존과학), 박물관 1급 정학예사" value={form.certifications ?? ''} onChange={(e) => set('certifications', e.target.value)} />
              </Field>
            </div>
          )}

          {tab === 'assign' && <AssignTab empId={form.id} />}
        </div>

        {/* 푸터 */}
        {tab !== 'assign' && (
          <div className="mf hr-card-foot">
            <button className="btn danger-txt" onClick={retire} disabled={saving || form.status === '퇴직'}>
              퇴직 처리
            </button>
            <button className="btn danger-txt" onClick={removeEmp} disabled={saving}>
              삭제
            </button>
            <div style={{ flex: 1 }} />
            {msg && <span className="hr-msg">{msg}</span>}
            <button className="btn sec" onClick={onClose} disabled={saving}>
              닫기
            </button>
            <button className="btn pri" onClick={save} disabled={saving}>
              {saving ? '저장 중…' : '저장'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className="mfield" style={full ? { gridColumn: '1 / -1' } : undefined}>
      <label>{label}</label>
      {children}
    </div>
  )
}

/* ---- 발령이력 탭 ---- */
function AssignTab({ empId }: { empId: string }) {
  const [rows, setRows] = useState<HrAssignment[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ eff_date: '', kind: '승진', detail: '', note: '' })
  const [busy, setBusy] = useState(false)

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('hr_assignments')
      .select('*')
      .eq('employee_id', empId)
      .order('eff_date', { ascending: false })
    setRows((data ?? []) as HrAssignment[])
    setLoading(false)
  }
  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empId])

  async function add() {
    if (!form.eff_date) return
    setBusy(true)
    const { error } = await supabase.from('hr_assignments').insert({
      employee_id: empId,
      eff_date: form.eff_date,
      kind: form.kind,
      detail: form.detail || null,
      note: form.note || null,
    })
    setBusy(false)
    if (!error) {
      setAdding(false)
      setForm({ eff_date: '', kind: '승진', detail: '', note: '' })
      load()
    }
  }

  return (
    <div>
      <div className="assign-head">
        <span className="hr-sub">인사발령이력 (최신순)</span>
        <button className="btn txt" onClick={() => setAdding((v) => !v)}>
          {adding ? '취소' : '+ 발령 추가'}
        </button>
      </div>

      {adding && (
        <div className="assign-add">
          <input className="ctl" type="date" value={form.eff_date} onChange={(e) => setForm({ ...form, eff_date: e.target.value })} />
          <select className="ctl" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
            {ASSIGN_KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
          <input className="ctl" placeholder="내용 (예: 연구원 → 선임연구원)" value={form.detail} onChange={(e) => setForm({ ...form, detail: e.target.value })} />
          <button className="btn pri" onClick={add} disabled={busy || !form.eff_date}>
            {busy ? '…' : '등록'}
          </button>
        </div>
      )}

      <div className="timeline">
        {loading && <div className="hr-sub">불러오는 중…</div>}
        {!loading && rows.length === 0 && <div className="hr-sub">등록된 발령이력이 없습니다.</div>}
        {!loading &&
          rows.map((r) => (
            <div className="tl-item" key={r.id}>
              <div className="tl-dot" />
              <div className="tl-body">
                <div className="tl-top">
                  <span className="tl-kind">{r.kind}</span>
                  <span className="tl-date tnum">{fmtDate(r.eff_date)}</span>
                </div>
                {r.detail && <div className="tl-detail">{r.detail}</div>}
                {r.note && <div className="tl-note">{r.note}</div>}
              </div>
            </div>
          ))}
      </div>
    </div>
  )
}
