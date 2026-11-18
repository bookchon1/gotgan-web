import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Icon } from '../../components/Icon'
import { supabase } from '../../lib/supabase'
import type { ProjectStep, StepComment } from '../../types/db'
import { STEP_LABEL } from './artDetail'

/**
 * 세부 진행 현황 (20공정) — 보기 + 편집. DB(project_steps, step_comments)에 실제 저장.
 * 편집: 이름/상태/날짜 수정, 위치지정 추가, 삭제, 순서이동, 코멘트.
 */
/** 'MM-DD HH:mm' (로컬 시각). 시각 정보가 없으면 날짜만 */
function fmtDt(iso?: string | null, fallbackDate?: string): string {
  if (iso) {
    const d = new Date(iso)
    if (!isNaN(d.getTime())) {
      const z = (n: number) => String(n).padStart(2, '0')
      return `${z(d.getMonth() + 1)}-${z(d.getDate())} ${z(d.getHours())}:${z(d.getMinutes())}`
    }
  }
  return (fallbackDate || '').slice(5)
}

/** 내용 길이에 맞춰 높이가 자동으로 늘어나는 메모 입력칸 (스크롤바 없음) */
function AutoTextarea({
  value,
  onChange,
  onBlur,
  onEscape,
  autoFocus,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  onBlur?: () => void
  onEscape?: () => void
  autoFocus?: boolean
  placeholder?: string
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const fit = () => {
    const el = ref.current
    if (!el) return
    el.style.height = '0px'
    el.style.height = Math.max(30, el.scrollHeight + 2) + 'px'
  }
  useLayoutEffect(fit, [value])
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    let w = el.clientWidth
    const ro = new ResizeObserver(() => {
      if (el.clientWidth !== w) {
        w = el.clientWidth
        fit()
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return (
    <textarea
      ref={ref}
      rows={1}
      autoFocus={autoFocus}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && onEscape) onEscape()
      }}
    />
  )
}

export function Step20Editor({
  projectId,
  steps,
  comments,
  onChanged,
  onSeed,
  seedBusy,
}: {
  projectId: string
  steps: ProjectStep[]
  comments: StepComment[]
  onChanged: () => void
  onSeed: () => void
  seedBusy?: boolean
}) {
  const [edit, setEdit] = useState(false)
  const [busy, setBusy] = useState(false)
  const [addPos, setAddPos] = useState(steps.length + 1)
  const [addName, setAddName] = useState('')
  // 메모 입력 중 내용(미등록)은 새로고침·재배포 때 사라지지 않도록 이 브라우저에 임시 보관
  const draftKey = `gotgan:stepdraft:${projectId}`
  const [cmtDraft, setCmtDraft] = useState<Record<string, string>>(() => {
    try {
      return JSON.parse(localStorage.getItem(draftKey) || '{}') as Record<string, string>
    } catch {
      return {}
    }
  })
  const draftRef = useRef(cmtDraft)
  draftRef.current = cmtDraft
  useEffect(() => {
    try {
      const clean = Object.fromEntries(Object.entries(cmtDraft).filter(([, v]) => v && v.trim()))
      if (Object.keys(clean).length) localStorage.setItem(draftKey, JSON.stringify(clean))
      else localStorage.removeItem(draftKey)
    } catch {
      /* 저장소 사용 불가 시 무시 */
    }
  }, [cmtDraft, draftKey])


  const cmtByStep = useMemo(() => {
    const m: Record<string, StepComment[]> = {}
    for (const c of comments) (m[c.step_id] ??= []).push(c)
    for (const k of Object.keys(m)) m[k].sort((a, b) => (a.created_at ?? a.date ?? '').localeCompare(b.created_at ?? b.date ?? ''))
    return m
  }, [comments])

  // 전체 재정렬: 현재 배열 순서대로 seq 1..N 재부여
  // 저장 실패(권한·네트워크)가 조용히 넘어가면 입력이 사라진 것처럼 보이므로 반드시 알린다
  const fail = (what: string, msg: string) => alert(`${what} 저장 실패: ${msg}`)

  async function resequence(ordered: ProjectStep[]) {
    const res = await Promise.all(
      ordered.map((s, i) => supabase.from('project_steps').update({ seq: i + 1 }).eq('id', s.id).select('id')),
    )
    const bad = res.find((r) => r.error || !r.data || r.data.length === 0)
    if (bad) fail('순서', bad.error?.message ?? '저장되지 않았습니다 (권한 확인 필요)')
  }

  async function setField(id: string, patch: Partial<ProjectStep>) {
    setBusy(true)
    const { data, error } = await supabase.from('project_steps').update(patch).eq('id', id).select('id')
    setBusy(false)
    if (error || !data || data.length === 0) fail('공정', error?.message ?? '저장되지 않았습니다 (권한 확인 필요)')
    onChanged()
  }

  async function del(step: ProjectStep) {
    setBusy(true)
    const { error: dErr } = await supabase.from('project_steps').delete().eq('id', step.id)
    if (dErr) fail('삭제', dErr.message)
    // 남은 것 재정렬
    const rest = steps.filter((s) => s.id !== step.id)
    await resequence(rest)
    setBusy(false)
    onChanged()
  }

  async function move(idx: number, dir: -1 | 1) {
    const j = idx + dir
    if (j < 0 || j >= steps.length) return
    setBusy(true)
    const arr = [...steps]
    const tmp = arr[idx]
    arr[idx] = arr[j]
    arr[j] = tmp
    await resequence(arr)
    setBusy(false)
    onChanged()
  }

  async function add() {
    const name = addName.trim()
    if (!name) return
    setBusy(true)
    // addPos 위치에 삽입 → 뒤 공정들 seq +1 후 새 공정 insert
    const pos = Math.max(1, Math.min(addPos, steps.length + 1))
    const after = steps.filter((s) => s.seq >= pos)
    // 뒤 공정 seq 밀기 (뒤에서부터)
    for (let i = after.length - 1; i >= 0; i--) {
      await supabase.from('project_steps').update({ seq: after[i].seq + 1 }).eq('id', after[i].id)
    }
    const { error: iErr } = await supabase.from('project_steps').insert({
      project_id: projectId,
      seq: pos,
      title: name,
      status: 'before',
    })
    if (iErr) fail('공정 추가', iErr.message)
    else setAddName('')
    setBusy(false)
    onChanged()
  }

  // 저장된 메모 수정/삭제 — 수정하면 수정 시각(updated_at)이 함께 기록됨
  const [editCmt, setEditCmt] = useState<{ id: string; text: string } | null>(null)
  async function saveCmtEdit(orig: StepComment) {
    const cur = editCmt
    setEditCmt(null)
    if (!cur || cur.id !== orig.id) return
    const txt = cur.text.trim()
    if (!txt || txt === orig.text) return // 비우거나 그대로면 변경 없음 (삭제는 × 버튼)
    const now = new Date().toISOString()
    let { data, error } = await supabase.from('step_comments').update({ text: txt, updated_at: now }).eq('id', orig.id).select('id')
    if (error && /updated_at/.test(error.message)) {
      // SQL 22 미적용: 시각 없이 내용만 저장
      ;({ data, error } = await supabase.from('step_comments').update({ text: txt }).eq('id', orig.id).select('id'))
    }
    if (error || !data || data.length === 0) fail('메모 수정', error?.message ?? '저장되지 않았습니다 (권한 확인 필요)')
    onChanged()
  }
  async function delCmt(c: StepComment) {
    const { error } = await supabase.from('step_comments').delete().eq('id', c.id)
    if (error) fail('메모 삭제', error.message)
    onChanged()
  }

  // 메모 저장: 입력칸을 벗어나거나 [저장]을 누르면 등록. 같은 내용이 두 번 저장되지 않도록 ref 로 즉시 비움
  async function addComment(stepId: string) {
    const txt = (draftRef.current[stepId] || '').trim()
    if (!txt) return
    draftRef.current = { ...draftRef.current, [stepId]: '' }
    setCmtDraft((d) => ({ ...d, [stepId]: '' }))
    const { error } = await supabase.from('step_comments').insert({
      step_id: stepId,
      text: txt,
      date: new Date().toISOString().slice(0, 10),
    })
    if (error) {
      // 실패 시 입력 내용을 되돌려 남겨 둔다
      setCmtDraft((d) => ({ ...d, [stepId]: d[stepId] ? d[stepId] : txt }))
      fail('메모', error.message)
      return
    }
    onChanged()
  }

  // 저장: 아직 등록되지 않은 메모를 모두 저장하고 편집 종료 (상태·날짜·공정 변경은 수정 즉시 저장됨)
  async function saveAll() {
    setBusy(true)
    for (const id of Object.keys(draftRef.current)) await addComment(id)
    setBusy(false)
    setEdit(false)
  }

  return (
    <div>
      {/* 툴바 — 진행 요약 + 편집 / 기본값 */}
      <div className="step-bar">
        <div className="proj-actions">
          <button
            className={`btn ${edit ? 'pri' : 'sec'}`}
            onClick={() => (edit ? saveAll() : setEdit(true))}
            disabled={busy}
            title="공정 추가·삭제·이름·순서 변경 (상태·날짜·메모는 편집 없이 바로 수정·저장)"
          >
            {edit ? '저장' : '편집'}
          </button>
          <button className="btn sec" onClick={onSeed} disabled={busy || seedBusy} title="기본 20단계 공정을 채웁니다 (이미 있는 단계는 건너뜀)">
            기본값
          </button>
        </div>
      </div>

      {steps.length === 0 && (
        <div className="t-sub" style={{ textAlign: 'center', padding: 22, fontSize: 12.5 }}>
          등록된 공정이 없습니다. 우측 위 <b>기본값</b>을 누르면 기본 20단계가 만들어집니다.
        </div>
      )}

      <div className="step20 sched">
        {steps.map((s, i) => {
          const cls = s.status === 'done' ? 'done' : s.status === 'prog' ? 'prog' : s.status === 'na' ? 'na' : ''
          const cmts = cmtByStep[s.id] ?? []
          return (
            <div className={`s20c ${cls}`} key={s.id}>
              <div className="s20-main">
                <div className="top">
                  <span className="num">{i + 1}</span>
                  {edit ? (
                    <input
                      className="s20name"
                      defaultValue={s.title}
                      onBlur={(e) => {
                        if (e.target.value.trim() && e.target.value !== s.title)
                          setField(s.id, { title: e.target.value.trim() })
                      }}
                    />
                  ) : (
                    <span>{s.title}</span>
                  )}
                  {/* 진행 상태 — 편집 모드와 무관하게 항상 수정 가능 */}
                  <select
                    className={`s20stsel st-${s.status}`}
                    value={s.status}
                    disabled={busy}
                    onChange={(e) => setField(s.id, { status: e.target.value as ProjectStep['status'] })}
                  >
                    {(['done', 'prog', 'before', 'na'] as const).map((k) => (
                      <option key={k} value={k}>
                        {STEP_LABEL[k][1]}
                      </option>
                    ))}
                  </select>
                  {edit && (
                    <>
                      <button className="s20mv" title="위로" onClick={() => move(i, -1)} disabled={i === 0 || busy}>
                        <svg className="icon" width="12" height="12" viewBox="0 0 24 24">
                          <path d="M18 15l-6-6-6 6" />
                        </svg>
                      </button>
                      <button
                        className="s20mv"
                        title="아래로"
                        onClick={() => move(i, 1)}
                        disabled={i === steps.length - 1 || busy}
                      >
                        <svg className="icon" width="12" height="12" viewBox="0 0 24 24">
                          <path d="M6 9l6 6 6-6" />
                        </svg>
                      </button>
                      <button className="s20del" title="공정 삭제" onClick={() => del(s)} disabled={busy}>
                        <svg className="icon" width="13" height="13" viewBox="0 0 24 24">
                          <path d="M6 6l12 12M18 6L6 18" />
                        </svg>
                      </button>
                    </>
                  )}
                </div>
                <div className="sch">
                  <Icon name="calendar" size={13} style={{ color: 'var(--muted)', flex: 'none' }} />
                  {/* 일정 — 항상 수정 가능 */}
                  <input
                    type="date" min="1900-01-01" max="9999-12-31"
                    key={`f${s.id}${s.from_date ?? ''}`}
                    defaultValue={s.from_date ?? ''}
                    onChange={(e) => setField(s.id, { from_date: e.target.value || null })}
                  />
                  <span>~</span>
                  <input
                    type="date" min="1900-01-01" max="9999-12-31"
                    key={`t${s.id}${s.to_date ?? ''}`}
                    defaultValue={s.to_date ?? ''}
                    onChange={(e) => setField(s.id, { to_date: e.target.value || null })}
                  />
                </div>
              </div>
              {/* 코멘트 (적요) */}
              <div className="s20-cmt">
                {cmts.length > 0 && (
                  <div className="cmt-log">
                    {cmts.map((c) => {
                      const editingThis = editCmt?.id === c.id
                      return (
                        <div className="ci" key={c.id}>
                          <b>{c.by_id ? '담당' : '메모'}</b>
                          <span className="dt">{fmtDt(c.created_at, c.date)}</span>
                          {c.updated_at && <span className="dt ed">· 수정 {fmtDt(c.updated_at)}</span>}
                          <button className="ci-x" title="메모 삭제" aria-label="메모 삭제" onClick={() => delCmt(c)}>
                            ×
                          </button>
                          {editingThis ? (
                            <div className="ci-edit">
                              <AutoTextarea
                                value={editCmt!.text}
                                autoFocus
                                onChange={(v) => setEditCmt({ id: c.id, text: v })}
                                onBlur={() => saveCmtEdit(c)}
                                onEscape={() => setEditCmt(null)}
                              />
                            </div>
                          ) : (
                            <div className="ci-text" title="클릭하여 수정" onClick={() => setEditCmt({ id: c.id, text: c.text })}>{c.text}</div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
                <div className="cmt-add">
                  <AutoTextarea
                    placeholder="메모 입력"
                    value={cmtDraft[s.id] || ''}
                    onChange={(v) => setCmtDraft((d) => ({ ...d, [s.id]: v }))}
                    onBlur={() => addComment(s.id)}
                  />
                </div>
              </div>
            </div>
          )
        })}

        {/* 편집: 위치 지정 추가 */}
        {edit && (
          <div className="s20addbar">
            <Icon name="home" size={14} style={{ color: 'var(--brand)', flex: 'none', display: 'none' }} />
            <svg className="icon" width="14" height="14" viewBox="0 0 24 24" style={{ color: 'var(--brand)', flex: 'none' }}>
              <path d="M12 5v14M5 12h14" />
            </svg>
            <select
              className="s20addsel"
              value={addPos}
              onChange={(e) => setAddPos(parseInt(e.target.value, 10))}
            >
              {Array.from({ length: steps.length + 1 }, (_, k) => k + 1).map((pz) => (
                <option key={pz} value={pz}>
                  {pz}번째
                </option>
              ))}
            </select>
            <span style={{ color: 'var(--muted)', fontSize: 11.5 }}>에</span>
            <input
              className="s20addname"
              placeholder="새 공정 이름 (예: 2차 자문)"
              value={addName}
              onChange={(e) => setAddName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') add()
              }}
            />
            <button className="btn pri" style={{ padding: '5px 13px', fontSize: 11.5, flex: 'none' }} onClick={add} disabled={busy}>
              추가
            </button>
          </div>
        )}
      </div>

    </div>
  )
}
