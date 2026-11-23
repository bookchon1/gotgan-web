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
  const [agreeId, setAgreeId] = useState(dl.find((l) => l.role === '합의')?.approver_id ?? '')
  const [approverId, setApproverId] = useState(dl.find((l) => l.role === '승인')?.approver_id ?? '')
  // 저장된 결재선 (자주 쓰는 검토·승인·참조 묶음)
  interface Preset { id: string; name: string; reviewer_id: string | null; agree_id?: string | null; approver_id: string | null; cc_ids: string[] }
  const [presets, setPresets] = useState<Preset[]>([])
  const [presetName, setPresetName] = useState<string | null>(null) // null=입력 닫힘
  const [presetMsg, setPresetMsg] = useState<string | null>(null)
  const loadPresets = () =>
    supabase
      .from('approval_line_presets')
      .select('*')
      .order('created_at', { ascending: true })
      .then(({ data }) => setPresets((data ?? []) as Preset[]))
  useEffect(() => {
    loadPresets()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [showAgree, setShowAgree] = useState(false)
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
      role: '기안' | '검토' | '합의' | '승인' | '회계접수' | '참조'
      decided: string
    }[] = [{ approval_id: apprId, seq: 1, approver_id: me?.id ?? null, role: '기안', decided: '승인' }]
    if (reviewerId) lines.push({ approval_id: apprId, seq: lines.length + 1, approver_id: reviewerId, role: '검토', decided: '대기' })
    if (agreeId) lines.push({ approval_id: apprId, seq: lines.length + 1, approver_id: agreeId, role: '합의', decided: '대기' })
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

  function applyPreset(id: string) {
    const p = presets.find((x) => x.id === id)
    if (!p) return
    const ok = (v: string | null) => (v && admins.some((a) => a.id === v) ? v : '')
    setReviewerId(ok(p.reviewer_id))
    setAgreeId(ok(p.agree_id ?? null))
    setApproverId(ok(p.approver_id))
    setCcIds((p.cc_ids ?? []).filter((c) => admins.some((a) => a.id === c)))
  }
  async function savePreset() {
    const name = (presetName ?? '').trim()
    if (!name) return setPresetMsg('결재선 이름을 입력하세요.')
    if (!reviewerId && !approverId) return setPresetMsg('검토·승인 중 하나는 선택한 뒤 저장하세요.')
    const { error } = await supabase.from('approval_line_presets').insert({
      owner_id: me?.id,
      name,
      reviewer_id: reviewerId || null,
      ...(agreeId ? { agree_id: agreeId } : {}),
      approver_id: approverId || null,
      cc_ids: ccIds,
    })
    if (error) return setPresetMsg(error.message.includes('approval_line_presets') ? '결재선 저장에 필요한 SQL 39번을 먼저 실행해 주세요.' : error.message)
    setPresetName(null)
    setPresetMsg('저장했습니다.')
    loadPresets()
  }
  async function deletePreset(id: string) {
    await supabase.from('approval_line_presets').delete().eq('id', id)
    loadPresets()
  }


  const numOf = (s: string) => parseInt(s.replace(/[^0-9]/g, ''), 10) || 0
  const [mgr, setMgr] = useState(false)
  const agreeOpen = showAgree || !!agreeId

  const personSel = (value: string, set: (v: string) => void, ph: string) => (
    <select className="ctl" value={value} onChange={(e) => set(e.target.value)}>
      <option value="">{ph}</option>
      {admins.map((e) => (
        <option key={e.id} value={e.id}>
          {approverLabel(e)}
        </option>
      ))}
    </select>
  )

  const itemsEditor = (f: FormField) => {
    const rows = itemsMap[f.key] ?? []
    const set = (next: ItemRow[]) => setItemsMap((p) => ({ ...p, [f.key]: next }))
    const upd = (i: number, patch: Partial<ItemRow>) => set(rows.map((x, j) => (j === i ? { ...x, ...patch } : x)))
    const add = () => set([...rows, { name: '', qty: 1, price: 0 }])
    return (
      <div className="adm-f full" key={f.key}>
        <div className="adm-l">
          {f.key} <span className="adm-sub">선택</span>
        </div>
        {rows.length === 0 ? (
          <button type="button" className="adm-empty" onClick={add}>
            + 항목 추가
          </button>
        ) : (
          <div className="adm-items">
            <div className="adm-ih">
              <span>항목</span>
              <span>수량</span>
              <span>단가</span>
              <span>금액</span>
              <span />
            </div>
            {rows.map((r, i) => (
              <div className="adm-ir" key={i}>
                <input className="ctl nm" value={r.name} onChange={(e) => upd(i, { name: e.target.value })} placeholder="항목명" />
                <input className="ctl num" inputMode="numeric" value={r.qty || ''} onChange={(e) => upd(i, { qty: numOf(e.target.value) })} placeholder="수량" />
                <input className="ctl num" inputMode="numeric" value={r.price ? won(r.price) : ''} onChange={(e) => upd(i, { price: numOf(e.target.value) })} placeholder="단가" />
                <span className="amt">{won((Number(r.qty) || 0) * (Number(r.price) || 0))}</span>
                <button type="button" className="adm-del" title="삭제" onClick={() => set(rows.filter((_, j) => j !== i))}>
                  ✕
                </button>
              </div>
            ))}
            <div className="adm-if">
              <button type="button" className="adm-lnk" onClick={add}>
                + 항목 추가
              </button>
              <span>
                합계 <b>{won(itemsTotal(rows))}원</b>
              </span>
            </div>
          </div>
        )}
      </div>
    )
  }

  const renderField = (f: FormField) => {
    if (f.type === 'items') return itemsEditor(f)
    const half = f.type === 'select' || f.type === 'date' || f.type === 'daterange'
    const days = f.type === 'daterange' && def.id === 'leave' ? leaveDays(values['휴가 종류'] ?? '연차', val(f)) : 0
    let input: JSX.Element
    if (f.type === 'textarea')
      input = <textarea className="ctl" rows={f.rows ?? 4} value={values[f.key] ?? ''} onChange={(e) => setVal(f.key, e.target.value)} placeholder={f.placeholder} />
    else if (f.type === 'select')
      input = (
        <select className="ctl" value={val(f)} onChange={(e) => setVal(f.key, e.target.value)}>
          {f.options?.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      )
    else if (f.type === 'date') input = <input className="ctl" type="date" value={values[f.key] ?? ''} onChange={(e) => setVal(f.key, e.target.value)} />
    else if (f.type === 'daterange') {
      const [s, e] = val(f).split(' ~ ')
      input = (
        <div className="adm-range">
          <input className="ctl" type="date" value={s} onChange={(ev) => setVal(f.key, `${ev.target.value} ~ ${e}`)} />
          <span>~</span>
          <input className="ctl" type="date" value={e} onChange={(ev) => setVal(f.key, `${s} ~ ${ev.target.value}`)} />
        </div>
      )
    } else input = <input className="ctl" value={values[f.key] ?? ''} onChange={(e) => setVal(f.key, e.target.value)} placeholder={f.placeholder} />
    return (
      <div className={`adm-f${half ? '' : ' full'}`} key={f.key}>
        <div className="adm-l">
          {f.key}
          {f.required && <span className="req">*</span>}
          {days > 0 && <span className="adm-days">{days}일</span>}
        </div>
        {input}
      </div>
    )
  }

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal adm" onClick={(e) => e.stopPropagation()}>
        <header className="adm-head">
          <div className="adm-top">
            <span className="adm-kicker">{reuse ? '재기안' : draft ? '임시보관 문서' : '새 기안'}</span>
            <button className="adm-x" onClick={onClose} title="닫기">
              ✕
            </button>
          </div>
          <div className="adm-seg" role="tablist">
            {FORMS.map((f) => (
              <button key={f.id} type="button" role="tab" aria-selected={formId === f.id} className={formId === f.id ? 'on' : ''} onClick={() => setFormId(f.id)}>
                {f.name}
              </button>
            ))}
          </div>
          <p className="adm-desc">{def.desc}</p>
        </header>

        <div className="adm-body">
          <div className="adm-main">
            <input className="adm-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={def.titleHint} autoFocus />

            {def.expense && (
              <div className="adm-grid">
                <div className="adm-f">
                  <div className="adm-l">사업자</div>
                  <select className="ctl" value={biz} onChange={(e) => setBiz(e.target.value)}>
                    <option value="법인">법인</option>
                    <option value="개인">개인(도래헌)</option>
                    <option value="더북촌">더북촌</option>
                  </select>
                </div>
                <div className="adm-f">
                  <div className="adm-l">부서</div>
                  <select className="ctl" value={dept} onChange={(e) => setDept(e.target.value)}>
                    <option value="management">경영</option>
                    <option value="art">미술</option>
                    <option value="product">상품</option>
                    <option value="promotion">홍보</option>
                    <option value="experience">체험</option>
                    <option value="education">교육</option>
                  </select>
                </div>
                <div className="adm-f">
                  <div className="adm-l">계정과목</div>
                  <input className="ctl" value={account} onChange={(e) => setAccount(e.target.value)} placeholder="예: 외주용역비" />
                </div>
                <div className="adm-f">
                  <div className="adm-l">
                    금액 {itemsSum > 0 && <span className="adm-sub">내역 합계</span>}
                  </div>
                  <input
                    className="ctl num"
                    style={{ textAlign: 'right', fontWeight: 700 }}
                    disabled={itemsSum > 0}
                    value={itemsSum > 0 ? won(itemsSum) : amount ? won(amount) : ''}
                    onChange={(e) => setAmount(numOf(e.target.value))}
                    placeholder="0"
                  />
                </div>
                {isArt && (
                  <>
                    <div className="adm-f">
                      <div className="adm-l">사업</div>
                      <select className="ctl" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                        <option value="">선택</option>
                        {projects.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="adm-f">
                      <div className="adm-l">예산 항목</div>
                      <select className="ctl" value={budgetItem} onChange={(e) => setBudgetItem(e.target.value)} disabled={!projectId}>
                        <option value="">선택</option>
                        {budgets.map((b) => (
                          <option key={b.id} value={b.item}>
                            {b.item}
                          </option>
                        ))}
                      </select>
                    </div>
                  </>
                )}
              </div>
            )}

            <div className="adm-grid">{def.fields.map(renderField)}</div>
          </div>

          <aside className="adm-side">
            <section>
              <div className="adm-sl">
                <span>결재선</span>
                {presets.length > 0 && (
                  <select
                    className="adm-pick"
                    value=""
                    onChange={(e) => {
                      applyPreset(e.target.value)
                      setPresetMsg(null)
                    }}
                  >
                    <option value="">저장된 결재선</option>
                    {presets.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div className="adm-rows">
                <div className="adm-row">
                  <span className="adm-rn">기안</span>
                  <span className="adm-me">
                    <i>{me?.name?.slice(0, 1) ?? '·'}</i>
                    {me?.name ?? '—'}
                  </span>
                </div>
                <div className="adm-row">
                  <span className="adm-rn">검토</span>
                  {personSel(reviewerId, setReviewerId, '선택 안 함')}
                </div>
                {agreeOpen && (
                  <div className="adm-row">
                    <span className="adm-rn">합의</span>
                    <div className="adm-with">
                      {personSel(agreeId, setAgreeId, '선택')}
                      <button
                        type="button"
                        className="adm-del"
                        title="합의 빼기"
                        onClick={() => {
                          setAgreeId('')
                          setShowAgree(false)
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                )}
                <div className="adm-row">
                  <span className="adm-rn">
                    승인<b>*</b>
                  </span>
                  {personSel(approverId, setApproverId, '승인자 선택')}
                </div>
                {needsAcct && (
                  <div className="adm-row">
                    <span className="adm-rn">회계</span>
                    <span className="adm-auto">승인 후 회계 담당자가 접수합니다</span>
                  </div>
                )}
              </div>
              <div className="adm-tools">
                {!agreeOpen && (
                  <button type="button" className="adm-lnk" onClick={() => setShowAgree(true)} title="다른 부서의 확인·협조가 필요할 때">
                    + 합의자 추가
                  </button>
                )}
                {presetName === null ? (
                  <>
                    <button
                      type="button"
                      className="adm-lnk"
                      onClick={() => {
                        setPresetName('')
                        setPresetMsg(null)
                      }}
                    >
                      결재선 저장
                    </button>
                    {presets.length > 0 && (
                      <button type="button" className="adm-lnk mu" onClick={() => setMgr(!mgr)}>
                        {mgr ? '관리 닫기' : '관리'}
                      </button>
                    )}
                  </>
                ) : (
                  <div className="adm-save">
                    <input className="ctl" value={presetName} onChange={(e) => setPresetName(e.target.value)} placeholder="결재선 이름" autoFocus />
                    <button type="button" className="adm-lnk" onClick={savePreset}>
                      저장
                    </button>
                    <button type="button" className="adm-lnk mu" onClick={() => setPresetName(null)}>
                      취소
                    </button>
                  </div>
                )}
              </div>
              {mgr && presets.length > 0 && (
                <div className="adm-mgr">
                  {presets.map((p) => (
                    <span key={p.id} className="badge" title="누르면 삭제" onClick={() => deletePreset(p.id)}>
                      {p.name} ✕
                    </span>
                  ))}
                </div>
              )}
              {presetMsg && <div className="adm-note">{presetMsg}</div>}
            </section>

            <section>
              <div className="adm-sl">
                <span>참조</span>
              </div>
              <CcPicker value={ccIds} onChange={setCcIds} className="adm-emb" />
            </section>

            <section>
              <div className="adm-sl">
                <span>첨부</span>
              </div>
              <AttachPicker files={files} onChange={setFiles} className="adm-emb" />
            </section>
          </aside>
        </div>

        <footer className="adm-foot">
          {err ? <div className="adm-err">{err}</div> : <span className="adm-fhint">임시보관한 문서는 나에게만 보입니다</span>}
          <button className="adm-b ghost" onClick={onClose} disabled={busy}>
            취소
          </button>
          <button className="adm-b" onClick={() => persist(true)} disabled={busy}>
            임시보관
          </button>
          <button className="adm-b pri" onClick={submit} disabled={busy}>
            {busy ? '처리 중…' : '상신'}
          </button>
        </footer>
      </div>
    </div>
  )
}
