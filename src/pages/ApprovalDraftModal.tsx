import { useEffect, useMemo, useState } from 'react'
import { CcPicker, ccLines } from '../components/CcPicker'
import { AttachPicker, uploadAttachments } from '../components/AttachPicker'
import { supabase } from '../lib/supabase'
import { won, approverLabel, sortApprovers } from '../lib/format'
import { useAuth } from '../lib/auth'
import { FORMS, formById, formOfApproval, itemsTotal, restoreForm, serializeForm, leaveDays, type FormField, type ItemRow } from '../lib/apprForms'
import { notifyApprovalsChanged } from '../lib/pendingApprovals'
import type { ArtProject, ArtBudget, Employee, Approval, ApprovalLine } from '../types/db'

const DEPTS = ['management', 'art', 'product', 'promotion', 'experience', 'education']
const today = () => new Date().toISOString().slice(0, 10)

/** 전자결재 기안 작성 — 양식함(품의서·지출결의서·휴가원·출장신청서·일반 기안). 미술 지출결의서는 사업·예산 연동. */
export function ApprovalDraftModal({
  onClose,
  onCreated,
  draft,
  draftLines,
  reuse,
}: {
  onClose: () => void
  onCreated: () => void
  /** 임시보관 문서를 이어서 작성할 때 */
  draft?: Approval
  draftLines?: ApprovalLine[]
  /** true: 반려·회수 문서를 내용만 불러와 새 문서로 재기안 */
  reuse?: boolean
}) {
  const { me } = useAuth()
  const dl = draftLines ?? []
  const initDef = draft ? formOfApproval(draft) : formById('poom')
  const restored = useMemo(
    () => (draft ? restoreForm(initDef, draft.memo && draft.memo !== draft.title ? draft.memo : '') : { values: {}, items: {} }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )
  const [formId, setFormId] = useState(initDef.id)
  const def = formById(formId)
  const [values, setValues] = useState<Record<string, string>>(restored.values)
  const [itemsMap, setItemsMap] = useState<Record<string, ItemRow[]>>(restored.items)
  const [title, setTitle] = useState(draft?.title ?? '')
  const [biz, setBiz] = useState(draft?.biz_code ?? '법인')
  const [dept, setDept] = useState(draft?.dept_key ?? (DEPTS.includes(me?.dept_key ?? '') ? (me?.dept_key as string) : 'management'))
  const [account, setAccount] = useState(draft?.account ?? '')
  const [amount, setAmount] = useState(draft?.amount ?? 0)
  const [projectId, setProjectId] = useState(draft?.project_id ?? '')
  const [budgetItem, setBudgetItem] = useState(draft?.budget_item ?? '')
  const [reviewerId, setReviewerId] = useState(dl.find((l) => l.role === '검토')?.approver_id ?? '')
  const [ccIds, setCcIds] = useState<string[]>(dl.filter((l) => l.role === '참조').map((l) => l.approver_id as string).filter(Boolean))
  const [files, setFiles] = useState<File[]>([])
  const [approverId, setApproverId] = useState(dl.find((l) => l.role === '승인')?.approver_id ?? '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const itemsField = def.fields.find((f) => f.type === 'items')
  const itemsSum = itemsField ? itemsTotal(itemsMap[itemsField.key] ?? []) : 0
  const isArt = !!def.expense && dept === 'art'
  const needsAcct = !!def.expense || (def.id === 'poom' && itemsSum > 0)

  // 승인자 후보 (본인 제외, 전 직원)
  const [admins, setAdmins] = useState<Pick<Employee, 'id' | 'name' | 'title'>[]>([])
  const [projects, setProjects] = useState<Pick<ArtProject, 'id' | 'name'>[]>([])
  const [budgets, setBudgets] = useState<ArtBudget[]>([])

  useEffect(() => {
    supabase
      .from('employees')
      .select('id,name,title')
      .eq('status', '재직')
      .then(({ data }) => setAdmins(sortApprovers((data ?? []).filter((e) => e.id !== me?.id))))
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

  const val = (f: FormField) => values[f.key] ?? (f.type === 'select' ? f.options?.[0] ?? '' : f.type === 'daterange' ? `${today()} ~ ${today()}` : '')
  const setVal = (k: string, v: string) => setValues((p) => ({ ...p, [k]: v }))

  /** asDraft=true: 임시보관(본인에게만 보임) / false: 상신 */
  async function persist(asDraft: boolean) {
    if (!title.trim()) {
      setErr('제목을 입력하세요.')
      return
    }
    // 기본값 채우기(선택·기간)
    const filled: Record<string, string> = { ...values }
    for (const f of def.fields) if (f.type === 'select' || f.type === 'daterange') filled[f.key] = val(f)
    if (!asDraft) {
      for (const f of def.fields) {
        if (f.required && !(filled[f.key] ?? '').trim()) {
          setErr(`${f.key}을(를) 입력하세요.`)
          return
        }
      }
      if (def.id === 'leave' || def.id === 'trip') {
        const m = (filled['기간'] ?? '').match(/^(\d{4}-\d{2}-\d{2})\s~\s(\d{4}-\d{2}-\d{2})$/)
        if (!m || m[2] < m[1]) {
          setErr('기간의 종료일이 시작일보다 빠릅니다.')
          return
        }
        if (def.id === 'leave' && (filled['휴가 종류'] ?? '').startsWith('반차') && m[1] !== m[2]) {
          setErr('반차는 하루만 선택하세요. (시작일과 종료일을 같게)')
          return
        }
        if (def.id === 'leave' && leaveDays(filled['휴가 종류'], filled['기간']) <= 0) {
          setErr('선택한 기간에 평일이 없습니다.')
          return
        }
      }
      if (!approverId) {
        setErr('승인할 사람을 선택하세요.')
        return
      }
    }
    const total = def.expense ? itemsSum || amount : itemsSum
    if (!asDraft && def.expense && total <= 0) {
      setErr('금액을 입력하세요.')
      return
    }
    setBusy(true)
    setErr(null)
    const memoStr = serializeForm(def, filled, itemsMap)
    const row = {
      kind: def.kind,
      drafter_id: me?.id ?? null,
      biz_code: def.expense ? biz : '법인',
      dept_key: def.expense ? dept : DEPTS.includes(me?.dept_key ?? '') ? me?.dept_key : 'management',
      title: title.trim(),
      memo: memoStr,
      amount: total > 0 ? total : null,
      account: def.expense ? account || null : null,
      project_id: isArt && projectId ? projectId : null,
      budget_item: isArt && budgetItem ? budgetItem : null,
      req_date: today(),
      status: asDraft ? '기안' : '진행',
    }
    let apprId = draft?.id ?? ''
    if (draft && !reuse) {
      const { data, error } = await supabase.from('approvals').update(row).eq('id', draft.id).select('id')
      if (error || !data || data.length === 0) {
        setBusy(false)
        setErr(error?.message ?? '저장되지 않았습니다. 권한을 확인하세요.')
        return
      }
      await supabase.from('approval_lines').delete().eq('approval_id', draft.id)
    } else {
      const docNo = `제${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000)}호`
      const { data: appr, error } = await supabase.from('approvals').insert({ doc_no: docNo, ...row }).select('id').single()
      if (error || !appr) {
        setBusy(false)
        setErr(error?.message ?? '생성 실패')
        return
      }
      apprId = appr.id
    }
    // 결재선: 기안(본인 승인됨) → 검토(지정) → 승인(지정) → 회계접수(지출·금액 있는 품의) → 참조
    const lines: {
      approval_id: string
      seq: number
      approver_id: string | null
      role: '기안' | '검토' | '승인' | '회계접수' | '참조'
      decided: string
    }[] = [{ approval_id: apprId, seq: 1, approver_id: me?.id ?? null, role: '기안', decided: '승인' }]
    if (reviewerId) lines.push({ approval_id: apprId, seq: lines.length + 1, approver_id: reviewerId, role: '검토', decided: '대기' })
    if (approverId) lines.push({ approval_id: apprId, seq: lines.length + 1, approver_id: approverId, role: '승인', decided: '대기' })
    if (needsAcct) lines.push({ approval_id: apprId, seq: lines.length + 1, approver_id: me?.id ?? null, role: '회계접수', decided: '대기' })
    lines.push(...ccLines(apprId, lines.length + 1, ccIds))
    await supabase.from('approval_lines').insert(lines)
    if (files.length) {
      const bad = await uploadAttachments(apprId, files, me?.id ?? null)
      if (bad.length) alert(`첨부 실패: ${bad.join(', ')}\n문서는 ${asDraft ? '임시보관' : '상신'}되었습니다.`)
    }

    setBusy(false)
    notifyApprovalsChanged()
    onCreated()
  }
  const submit = () => persist(false)

  const itemsEditor = (f: FormField) => {
    const rows = itemsMap[f.key] ?? []
    const set = (next: ItemRow[]) => setItemsMap((p) => ({ ...p, [f.key]: next }))
    return (
      <div className="mfield" key={f.key}>
        <label>
          {f.key} <span style={{ fontWeight: 400, color: 'var(--muted)' }}>(선택 · 합계가 금액이 됩니다)</span>
        </label>
        {rows.length > 0 && (
          <table className="rowtbl" style={{ fontSize: 12, marginBottom: 6 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>항목</th>
                <th style={{ width: 70 }}>수량</th>
                <th style={{ width: 110 }}>단가(원)</th>
                <th style={{ width: 100 }}>금액</th>
                <th style={{ width: 28 }} />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td>
                    <input className="ctl" value={r.name} onChange={(e) => set(rows.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} placeholder="항목명" />
                  </td>
                  <td>
                    <input
                      className="ctl"
                      style={{ textAlign: 'right' }}
                      inputMode="numeric"
                      value={r.qty || ''}
                      onChange={(e) => set(rows.map((x, j) => (j === i ? { ...x, qty: parseInt(e.target.value.replace(/[^0-9]/g, ''), 10) || 0 } : x)))}
                    />
                  </td>
                  <td>
                    <input
                      className="ctl"
                      style={{ textAlign: 'right' }}
                      inputMode="numeric"
                      value={r.price ? won(r.price) : ''}
                      onChange={(e) => set(rows.map((x, j) => (j === i ? { ...x, price: parseInt(e.target.value.replace(/[^0-9]/g, ''), 10) || 0 } : x)))}
                    />
                  </td>
                  <td className="tnum" style={{ textAlign: 'right' }}>{won((Number(r.qty) || 0) * (Number(r.price) || 0))}</td>
                  <td>
                    <button type="button" className="sp-btn b2" title="삭제" onClick={() => set(rows.filter((_, j) => j !== i))}>
                      −
                    </button>
                  </td>
                </tr>
              ))}
              <tr style={{ fontWeight: 800 }}>
                <td colSpan={3}>합계</td>
                <td className="tnum" style={{ textAlign: 'right' }}>{won(itemsTotal(rows))}원</td>
                <td />
              </tr>
            </tbody>
          </table>
        )}
        <button type="button" className="sp-btn b1" onClick={() => set([...rows, { name: '', qty: 1, price: 0 }])}>
          + 항목 추가
        </button>
      </div>
    )
  }

  const renderField = (f: FormField) => {
    if (f.type === 'items') return itemsEditor(f)
    const label = (
      <label>
        {f.key}
        {f.required && <span style={{ color: 'var(--danger)' }}> *</span>}
      </label>
    )
    if (f.type === 'textarea')
      return (
        <div className="mfield" key={f.key}>
          {label}
          <textarea className="ctl" rows={f.rows ?? 4} value={values[f.key] ?? ''} onChange={(e) => setVal(f.key, e.target.value)} placeholder={f.placeholder} />
        </div>
      )
    if (f.type === 'select')
      return (
        <div className="mfield" key={f.key}>
          {label}
          <select className="ctl" value={val(f)} onChange={(e) => setVal(f.key, e.target.value)}>
            {f.options?.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </div>
      )
    if (f.type === 'date')
      return (
        <div className="mfield" key={f.key} style={{ maxWidth: 220 }}>
          {label}
          <input className="ctl" type="date" value={values[f.key] ?? ''} onChange={(e) => setVal(f.key, e.target.value)} />
        </div>
      )
    if (f.type === 'daterange') {
      const [s, e] = val(f).split(' ~ ')
      const days = def.id === 'leave' ? leaveDays(values['휴가 종류'] ?? '연차', val(f)) : 0
      return (
        <div className="mfield" key={f.key}>
          {label}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input className="ctl" style={{ width: 170 }} type="date" value={s} onChange={(ev) => setVal(f.key, `${ev.target.value} ~ ${e}`)} />
            <span>~</span>
            <input className="ctl" style={{ width: 170 }} type="date" value={e} onChange={(ev) => setVal(f.key, `${s} ~ ${ev.target.value}`)} />
            {def.id === 'leave' && days > 0 && <b className="tnum">{days}일</b>}
          </div>
        </div>
      )
    }
    return (
      <div className="mfield" key={f.key}>
        {label}
        <input className="ctl" value={values[f.key] ?? ''} onChange={(e) => setVal(f.key, e.target.value)} placeholder={f.placeholder} />
      </div>
    )
  }

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 680 }}>
        <div className="mh">
          <div>
            <div className="eyebrow">{reuse ? '재기안' : draft ? '임시보관 문서' : '기안 작성'}</div>
            <h3>{def.name}</h3>
          </div>
          <button className="x" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="mb">
          {/* 양식함 */}
          <div className="mfield">
            <label>양식</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {FORMS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className={`btn ${formId === f.id ? 'pri' : 'sec'}`}
                  style={{ padding: '6px 12px' }}
                  title={f.desc}
                  onClick={() => setFormId(f.id)}
                >
                  {f.name}
                </button>
              ))}
            </div>
            <div className="t-sub" style={{ fontSize: 11.5, marginTop: 5 }}>{def.desc}</div>
          </div>

          <div className="mfield">
            <label>
              제목 <span style={{ color: 'var(--danger)' }}>*</span>
            </label>
            <input className="ctl" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={def.titleHint} autoFocus />
          </div>

          {def.expense && (
            <>
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
              <div style={{ display: 'flex', gap: 10 }}>
                <div className="mfield" style={{ flex: 1 }}>
                  <label>계정과목</label>
                  <input className="ctl" value={account} onChange={(e) => setAccount(e.target.value)} placeholder="예: 외주용역비" />
                </div>
                <div className="mfield" style={{ flex: 1 }}>
                  <label>금액 {itemsSum > 0 && <span style={{ fontWeight: 400, color: 'var(--muted)' }}>(내역 합계)</span>}</label>
                  <input
                    className="ctl"
                    type="text"
                    disabled={itemsSum > 0}
                    value={itemsSum > 0 ? won(itemsSum) : amount ? won(amount) : ''}
                    onChange={(e) => setAmount(parseInt(e.target.value.replace(/[^0-9]/g, ''), 10) || 0)}
                    placeholder="0"
                  />
                </div>
              </div>
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
            </>
          )}

          {def.fields.map(renderField)}

          {/* 결재선 */}
          <div className="mfield">
            <label>결재선</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <select className="ctl" value={reviewerId} onChange={(e) => setReviewerId(e.target.value)} style={{ flex: 1 }}>
                <option value="">검토</option>
                {admins.map((e) => (
                  <option key={e.id} value={e.id}>
                    {approverLabel(e)}
                  </option>
                ))}
              </select>
              <select className="ctl" value={approverId} onChange={(e) => setApproverId(e.target.value)} style={{ flex: 1 }}>
                <option value="">승인</option>
                {admins.map((e) => (
                  <option key={e.id} value={e.id}>
                    {approverLabel(e)}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 11.5, marginTop: 8 }}>
              <span className="badge">기안 {me?.name ?? '—'}</span>
              {reviewerId && (
                <>
                  <span style={{ color: 'var(--muted)' }}>›</span>
                  <span className="badge">검토 {admins.find((a) => a.id === reviewerId)?.name ?? ''}</span>
                </>
              )}
              {approverId && (
                <>
                  <span style={{ color: 'var(--muted)' }}>›</span>
                  <span className="badge">승인 {admins.find((a) => a.id === approverId)?.name ?? ''}</span>
                </>
              )}
              {needsAcct && (
                <>
                  <span style={{ color: 'var(--muted)' }}>›</span>
                  <span className="badge green">회계접수 담당</span>
                </>
              )}
            </div>
          </div>

          <CcPicker value={ccIds} onChange={setCcIds} className="mfield" />

          <AttachPicker files={files} onChange={setFiles} className="mfield" />
          {err && <div className="login-alert err" style={{ margin: 0 }}>{err}</div>}
        </div>
        <div className="mf">
          <button className="btn sec" onClick={onClose} disabled={busy}>
            취소
          </button>
          <button className="btn sec" onClick={() => persist(true)} disabled={busy}>
            임시보관
          </button>
          <button className="btn pri" onClick={submit} disabled={busy}>
            {busy ? '처리 중…' : '상신'}
          </button>
        </div>
      </div>
    </div>
  )
}
