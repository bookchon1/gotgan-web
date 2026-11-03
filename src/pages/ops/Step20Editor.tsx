import { useMemo, useState } from 'react'
import { Icon } from '../../components/Icon'
import { supabase } from '../../lib/supabase'
import { dateRange } from '../../lib/format'
import type { ProjectStep, StepComment } from '../../types/db'
import { stepProgress, STEP_LABEL } from './artDetail'

/**
 * 세부 진행 현황 (20공정) — 보기 + 편집. DB(project_steps, step_comments)에 실제 저장.
 * 편집: 이름/상태/날짜 수정, 위치지정 추가, 삭제, 순서이동, 코멘트.
 */
export function Step20Editor({
  projectId,
  steps,
  comments,
  onChanged,
}: {
  projectId: string
  steps: ProjectStep[]
  comments: StepComment[]
  onChanged: () => void
}) {
  const [edit, setEdit] = useState(false)
  const [busy, setBusy] = useState(false)
  const [addPos, setAddPos] = useState(steps.length + 1)
  const [addName, setAddName] = useState('')
  const [cmtDraft, setCmtDraft] = useState<Record<string, string>>({})

  const prog = stepProgress(steps)

  const cmtByStep = useMemo(() => {
    const m: Record<string, StepComment[]> = {}
    for (const c of comments) (m[c.step_id] ??= []).push(c)
    return m
  }, [comments])

  // 전체 재정렬: 현재 배열 순서대로 seq 1..N 재부여
  async function resequence(ordered: ProjectStep[]) {
    const updates = ordered.map((s, i) =>
      supabase.from('project_steps').update({ seq: i + 1 }).eq('id', s.id),
    )
    await Promise.all(updates)
  }

  async function setField(id: string, patch: Partial<ProjectStep>) {
    setBusy(true)
    await supabase.from('project_steps').update(patch).eq('id', id)
    setBusy(false)
    onChanged()
  }

  async function del(step: ProjectStep) {
    setBusy(true)
    await supabase.from('project_steps').delete().eq('id', step.id)
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
    await supabase.from('project_steps').insert({
      project_id: projectId,
      seq: pos,
      title: name,
      status: 'before',
    })
    setAddName('')
    setBusy(false)
    onChanged()
  }

  async function addComment(stepId: string) {
    const txt = (cmtDraft[stepId] || '').trim()
    if (!txt) return
    setBusy(true)
    await supabase.from('step_comments').insert({
      step_id: stepId,
      text: txt,
      date: new Date().toISOString().slice(0, 10),
    })
    setCmtDraft((d) => ({ ...d, [stepId]: '' }))
    setBusy(false)
    onChanged()
  }

  return (
    <div>
      {/* 툴바 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          marginBottom: 10,
          flexWrap: 'wrap',
        }}
      >
        <span className="sec-mini" style={{ margin: 0 }}>
          기본 공정 템플릿 · <b>유물마다 공정을 추가·삭제·수정</b>하세요. 진행률은 현재 공정 수로 자동 계산.
        </span>
        <button
          className={`btn ${edit ? 'pri' : 'sec'}`}
          style={{ padding: '5px 12px', fontSize: 11.5 }}
          onClick={() => setEdit((v) => !v)}
          disabled={busy}
        >
          {edit ? (
            <>
              <Icon name="check" size={13} style={{ marginRight: 4 }} />
              편집 완료
            </>
          ) : (
            '공정 편집'
          )}
        </button>
      </div>

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
                  {edit ? (
                    <select
                      className="s20stsel"
                      value={s.status}
                      onChange={(e) => setField(s.id, { status: e.target.value as ProjectStep['status'] })}
                    >
                      {(['done', 'prog', 'before', 'na'] as const).map((k) => (
                        <option key={k} value={k}>
                          {STEP_LABEL[k][1]}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className={`stt ${STEP_LABEL[s.status][0]}`}>{STEP_LABEL[s.status][1]}</span>
                  )}
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
                  {edit ? (
                    <>
                      <input
                        type="date"
                        defaultValue={s.from_date ?? ''}
                        onChange={(e) => setField(s.id, { from_date: e.target.value || null })}
                      />
                      <span>~</span>
                      <input
                        type="date"
                        defaultValue={s.to_date ?? ''}
                        onChange={(e) => setField(s.id, { to_date: e.target.value || null })}
                      />
                    </>
                  ) : (
                    <span className="dur">
                      {s.from_date ? dateRange(s.from_date, s.to_date) : <span style={{ color: 'var(--muted)' }}>일정 미정</span>}
                    </span>
                  )}
                </div>
              </div>
              {/* 코멘트 (적요) */}
              <div className="s20-cmt">
                {cmts.length > 0 && (
                  <div className="cmt-log">
                    {cmts.map((c) => (
                      <div className="ci" key={c.id}>
                        <b>{c.by_id ? '담당' : '메모'}</b>
                        <span className="dt">{(c.date || '').slice(5)}</span>
                        <div>{c.text}</div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="cmt-add">
                  <textarea
                    placeholder="메모 입력"
                    value={cmtDraft[s.id] || ''}
                    onChange={(e) => setCmtDraft((d) => ({ ...d, [s.id]: e.target.value }))}
                  />
                  <button className="cadd" onClick={() => addComment(s.id)} disabled={busy}>
                    추가
                  </button>
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

      {steps.length > 0 && (
        <p className="sec-mini" style={{ marginTop: 12 }}>
          진행률 <b>{prog.pct}%</b> = (완료 {prog.nDone} + 진행중 {prog.nProg}×0.5) ÷ 유효 {prog.valid}공정
          {prog.nNa > 0 && <span style={{ color: 'var(--muted)' }}> · 해당없음 {prog.nNa}건 제외</span>}
        </p>
      )}
    </div>
  )
}
