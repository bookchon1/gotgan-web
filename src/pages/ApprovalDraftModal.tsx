import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { won } from '../lib/format'
import { useAuth } from '../lib/auth'
import type { ArtProject, ArtBudget, Employee } from '../types/db'

/** 전자결재 기안 작성 — 지출결의서/품의/일반. 지출결의서+미술이면 사업·예산 연동. */
export function ApprovalDraftModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { me } = useAuth()
  const [kind, setKind] = useState<'지출결의서' | '품의' | '일반'>('지출결의서')
  const [title, setTitle] = useState('')
  const [biz, setBiz] = useState('법인')
  const [dept, setDept] = useState('management')
  const [account, setAccount] = useState('')
  const [amount, setAmount] = useState(0)
  const [projectId, setProjectId] = useState('')
  const [budgetItem, setBudgetItem] = useState('')
  const [approverId, setApproverId] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const isArt = kind === '지출결의서' && dept === 'art'

  // 승인자 후보 (관리자, 본인 제외)
  const [admins, setAdmins] = useState<Pick<Employee, 'id' | 'name' | 'title'>[]>([])
  const [projects, setProjects] = useState<Pick<ArtProject, 'id' | 'name'>[]>([])
  const [budgets, setBudgets] = useState<ArtBudget[]>([])

  useEffect(() => {
    supabase
      .from('employees')
      .select('id,name,title')
      .eq('role', 'admin')
      .eq('status', '재직')
      .then(({ data }) => setAdmins((data ?? []).filter((e) => e.id !== me?.id)))
    supabase
      .from('art_projects')
      .select('id,name')
      .then(({ data }) => setProjects(data ?? []))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 사업 선택 시 예산 항목 로드
  useEffect(() => {
    if (!projectId) {
      setBudgets([])
      return
    }
    supabase
      .from('art_budget')
      .select('*')
      .eq('project_id', projectId)
      .then(({ data }) => setBudgets(data ?? []))
  }, [projectId])

  async function submit() {
    if (!title.trim()) {
      setErr('제목을 입력하세요.')
      return
    }
    if (kind === '지출결의서' && amount <= 0) {
      setErr('금액을 입력하세요.')
      return
    }
    setBusy(true)
    setErr(null)
    const docNo = `제${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000)}호`
    const { data: appr, error } = await supabase
      .from('approvals')
      .insert({
        doc_no: docNo,
        kind,
        drafter_id: me?.id ?? null,
        biz_code: biz,
        dept_key: dept,
        title: title.trim(),
        amount: kind === '지출결의서' ? amount : null,
        account: account || null,
        project_id: isArt && projectId ? projectId : null,
        budget_item: isArt && budgetItem ? budgetItem : null,
        req_date: new Date().toISOString().slice(0, 10),
        status: '진행',
      })
      .select('id')
      .single()
    if (error || !appr) {
      setBusy(false)
      setErr(error?.message ?? '생성 실패')
      return
    }
    // 결재선: 기안(본인 승인됨) → 승인(선택) → 회계접수(지출결의서만)
    const lines: {
      approval_id: string
      seq: number
      approver_id: string | null
      role: '기안' | '승인' | '회계접수'
      decided: string
    }[] = [{ approval_id: appr.id, seq: 1, approver_id: me?.id ?? null, role: '기안', decided: '승인' }]
    if (approverId) lines.push({ approval_id: appr.id, seq: 2, approver_id: approverId, role: '승인', decided: '대기' })
    if (kind === '지출결의서')
      lines.push({ approval_id: appr.id, seq: lines.length + 1, approver_id: me?.id ?? null, role: '회계접수', decided: '대기' })
    await supabase.from('approval_lines').insert(lines)

    setBusy(false)
    onCreated()
  }

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="mh">
          <div>
            <div className="eyebrow">기안 작성</div>
            <h3>전자결재</h3>
          </div>
          <button className="x" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="mb">
          <div style={{ display: 'flex', gap: 10 }}>
            <div className="mfield" style={{ width: 130 }}>
              <label>종류</label>
              <select className="ctl" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
                <option value="지출결의서">지출결의서</option>
                <option value="품의">품의서</option>
                <option value="일반">일반</option>
              </select>
            </div>
            <div className="mfield" style={{ flex: 1 }}>
              <label>제목</label>
              <input className="ctl" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 삼국유사 목판 외주비 지출결의" autoFocus />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <div className="mfield" style={{ flex: 1 }}>
              <label>사업자</label>
              <select className="ctl" value={biz} onChange={(e) => setBiz(e.target.value)}>
                <option value="법인">법인</option>
                <option value="개인">개인(도래헌)</option>
                <option value="더북촌">더북촌</option>
              </select>
            </div>
            <div className="mfield" style={{ flex: 1 }}>
              <label>부서</label>
              <select className="ctl" value={dept} onChange={(e) => setDept(e.target.value)}>
                <option value="management">경영</option>
                <option value="art">미술</option>
                <option value="product">상품</option>
                <option value="promotion">홍보</option>
                <option value="experience">체험</option>
                <option value="education">교육</option>
              </select>
            </div>
          </div>

          {kind === '지출결의서' && (
            <div style={{ display: 'flex', gap: 10 }}>
              <div className="mfield" style={{ flex: 1 }}>
                <label>계정과목</label>
                <input className="ctl" value={account} onChange={(e) => setAccount(e.target.value)} placeholder="예: 외주용역비" />
              </div>
              <div className="mfield" style={{ flex: 1 }}>
                <label>금액</label>
                <input
                  className="ctl"
                  type="text"
                  value={amount ? won(amount) : ''}
                  onChange={(e) => setAmount(parseInt(e.target.value.replace(/[^0-9]/g, ''), 10) || 0)}
                  placeholder="0"
                />
              </div>
            </div>
          )}

          {/* 미술 지출결의서 → 사업·예산 연동 */}
          {isArt && (
            <div style={{ display: 'flex', gap: 10 }}>
              <div className="mfield" style={{ flex: 1 }}>
                <label>사업</label>
                <select className="ctl" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                  <option value="">선택</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="mfield" style={{ flex: 1 }}>
                <label>예산 항목</label>
                <select className="ctl" value={budgetItem} onChange={(e) => setBudgetItem(e.target.value)} disabled={!projectId}>
                  <option value="">선택</option>
                  {budgets.map((b) => (
                    <option key={b.id} value={b.item}>
                      {b.item}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* 결재선 */}
          <div className="mfield">
            <label>승인자</label>
            <select className="ctl" value={approverId} onChange={(e) => setApproverId(e.target.value)}>
              <option value="">선택 (없으면 바로 회계접수)</option>
              {admins.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name} {e.title}
                </option>
              ))}
            </select>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 11.5, marginTop: 8 }}>
              <span className="badge">기안 {me?.name ?? '—'}</span>
              {approverId && (
                <>
                  <span style={{ color: 'var(--muted)' }}>›</span>
                  <span className="badge">승인 {admins.find((a) => a.id === approverId)?.name ?? ''}</span>
                </>
              )}
              {kind === '지출결의서' && (
                <>
                  <span style={{ color: 'var(--muted)' }}>›</span>
                  <span className="badge green">회계접수 담당</span>
                </>
              )}
            </div>
          </div>

          {err && <div className="login-alert err" style={{ margin: 0 }}>{err}</div>}
        </div>
        <div className="mf">
          <button className="btn sec" onClick={onClose} disabled={busy}>
            취소
          </button>
          <button className="btn pri" onClick={submit} disabled={busy}>
            {busy ? '상신 중…' : '상신'}
          </button>
        </div>
      </div>
    </div>
  )
}
