import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { PageHead } from '../components/PageHead'
import { ErrorBanner, LoadingRow, EmptyRow } from '../components/States'
import { supabase } from '../lib/supabase'
import { useQuery } from '../lib/useQuery'
import { useAuth } from '../lib/auth'
import { mmdd } from '../lib/format'
import { AREAS } from '../data/areas'
import type { WorkTask, Employee } from '../types/db'

// 상태 4종: 예정 / 진행 / 보류 / 완료
const ST_CHIP: Record<string, [string, string]> = {
  plan: ['c-plan', '예정'],
  prog: ['c-prog', '진행'],
  hold: ['set-hold', '보류'],
  done: ['c-done', '완료'],
}
const ST_OPTS: { v: WorkTask['status']; t: string }[] = [
  { v: 'plan', t: '예정' },
  { v: 'prog', t: '진행' },
  { v: 'hold', t: '보류' },
  { v: 'done', t: '완료' },
]

type Form = { title: string; start: string; due: string; detail: string; status: WorkTask['status'] }
const EMPTY_FORM: Form = { title: '', start: '', due: '', detail: '', status: 'plan' }

// 등록일(reg_date) → 'YYYY-MM' 귀속월
function regMonth(t: WorkTask): string {
  return (t.reg_date ?? '').slice(0, 7)
}

export default function Tasks() {
  const { area } = useParams()
  const { me } = useAuth()
  const a = AREAS.find((x) => x.id === area)
  // 시안과 동일: 제목은 기능명만 ("업무현황"). 부서는 경로·사이드바로 구분.
  const label = '업무현황'

  const taskQ = useQuery<WorkTask[]>(
    async () =>
      await supabase
        .from('work_tasks')
        .select('*')
        .eq('area', area!)
        .order('reg_date', { ascending: false }),
    [area],
  )
  const empQ = useQuery<Pick<Employee, 'id' | 'name'>[]>(
    async () => await supabase.from('employees').select('id,name'),
    [],
  )
  const empName = useMemo(() => {
    const m: Record<string, string> = {}
    for (const e of empQ.data ?? []) m[e.id] = e.name
    return m
  }, [empQ.data])

  const allTasks = taskQ.data ?? []

  // 월 단위 보기: 달력 기준으로 ◀ ▶ 이동 (데이터 없는 달도 이동 가능, 빈 목록 표시).
  // 'all' = 전체 보기. 기본 = 이번 달.
  const THIS_MONTH = new Date().toISOString().slice(0, 7)
  const [month, setMonth] = useState<string>(THIS_MONTH)
  const isAll = month === 'all'
  const curMonth = isAll ? null : month

  const tasks = useMemo(() => {
    if (isAll) return allTasks
    return allTasks.filter((t) => regMonth(t) === curMonth)
  }, [allTasks, curMonth, isAll])

  // 'YYYY-MM' 을 n개월 이동
  function shiftMonth(ym: string, n: number): string {
    const [y, m] = ym.split('-').map(Number)
    const d = new Date(y, m - 1 + n, 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }
  const goPrev = () => setMonth((m) => shiftMonth(m === 'all' ? THIS_MONTH : m, -1)) // 과거로
  const goNext = () => setMonth((m) => shiftMonth(m === 'all' ? THIS_MONTH : m, +1)) // 미래로

  const [busy, setBusy] = useState(false)

  // 등록/수정 모달 — 'new' 이면 신규
  const [modalFor, setModalFor] = useState<null | WorkTask | 'new'>(null)
  const [form, setForm] = useState<Form>(EMPTY_FORM)

  function openNew() {
    setForm(EMPTY_FORM)
    setModalFor('new')
  }
  function openEdit(t: WorkTask) {
    setForm({
      title: t.title,
      start: t.start_date ?? '',
      due: t.due_date ?? '',
      detail: t.detail ?? '',
      status: t.status,
    })
    setModalFor(t)
  }

  async function saveTask() {
    if (!form.title.trim()) return
    setBusy(true)
    if (modalFor === 'new') {
      // 담당자는 무조건 로그인한 작성자
      await supabase.from('work_tasks').insert({
        area: area!,
        title: form.title.trim(),
        dept: a?.label ?? null,
        detail: form.detail || null,
        owner_id: me?.id ?? null,
        reg_date: new Date().toISOString().slice(0, 10),
        start_date: form.start || null,
        due_date: form.due || null,
        status: form.status,
      })
    } else if (modalFor) {
      await supabase
        .from('work_tasks')
        .update({
          title: form.title.trim(),
          detail: form.detail || null,
          start_date: form.start || null,
          due_date: form.due || null,
          status: form.status,
        })
        .eq('id', modalFor.id)
    }
    setBusy(false)
    setModalFor(null)
    setForm(EMPTY_FORM)
    taskQ.reload()
  }

  async function removeTask(t: WorkTask) {
    if (!window.confirm(`업무 "${t.title}" 을(를) 삭제할까요?\n삭제하면 되돌릴 수 없습니다.`)) return
    setBusy(true)
    await supabase.from('work_tasks').delete().eq('id', t.id)
    setBusy(false)
    taskQ.reload()
  }

  return (
    <div className="page on">
      <PageHead
        eyebrow="업무관리"
        title={label}
        desc="부서별 업무를 한눈에 확인하세요."
        actions={
          <button className="btn txt add-txt" onClick={openNew}>
            + 업무 등록
          </button>
        }
      />

      <section className="panel">
        <ErrorBanner error={taskQ.error} table="work_tasks" />
        <div className="panel-h" style={{ alignItems: 'center' }}>
          <div>
            <h2>
              {label} <span className="count">{taskQ.loading ? '…' : tasks.length}</span>
            </h2>
          </div>
          {/* 월 단위 이동 — 데이터는 그대로, 보기만 월별로 나눔 (달력 기준, 빈 달도 이동) */}
          <div className="month-nav" style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
            <button
              className="btn sec"
              style={{ padding: '4px 10px' }}
              onClick={goPrev}
              title="이전 달"
            >
              ‹
            </button>
            <span style={{ fontWeight: 700, minWidth: 96, textAlign: 'center', fontSize: 13 }}>
              {isAll ? '전체 기간' : `${curMonth!.slice(0, 4)}년 ${+curMonth!.slice(5, 7)}월`}
            </span>
            <button
              className="btn sec"
              style={{ padding: '4px 10px' }}
              onClick={goNext}
              disabled={!isAll && curMonth! >= THIS_MONTH}
              title="다음 달"
            >
              ›
            </button>
            <button
              className={`btn ${isAll ? 'pri' : 'sec'}`}
              style={{ padding: '4px 11px', marginLeft: 4 }}
              onClick={() => setMonth(isAll ? THIS_MONTH : 'all')}
            >
              {isAll ? '월별' : '전체'}
            </button>
          </div>
        </div>
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>업무</th>
                <th>담당자</th>
                <th>등록</th>
                <th>시작</th>
                <th>마감</th>
                <th>상태</th>
                <th style={{ textAlign: 'right' }}>관리</th>
              </tr>
            </thead>
            <tbody>
              {taskQ.loading && <LoadingRow cols={7} />}
              {!taskQ.loading &&
                tasks.map((t) => {
                  const chk = t.status === 'done'
                  const sc = ST_CHIP[t.status] ?? ST_CHIP.plan
                  return (
                    <tr key={t.id}>
                      <td>
                        <div className={`t-title${chk ? ' done-txt' : ''}`}>{t.title}</div>
                        {a && (
                          <span className={`area ${a.cls}`} style={{ fontSize: 10, padding: '2px 8px' }}>
                            {a.label}
                            {t.detail ? ` · ${t.detail}` : ''}
                          </span>
                        )}
                        {t.src && (
                          <div className="t-sub" style={{ color: 'var(--brand-ink)' }}>
                            {t.src}
                          </div>
                        )}
                      </td>
                      <td>
                        <span className="owner">
                          <span className="av-s">
                            {(t.owner_id ? empName[t.owner_id] ?? '—' : '—').slice(0, 1)}
                          </span>
                          {t.owner_id ? empName[t.owner_id] ?? '—' : '—'}
                        </span>
                      </td>
                      <td className="tnum" style={{ color: 'var(--muted)' }}>
                        {mmdd(t.reg_date)}
                      </td>
                      <td className="tnum">{mmdd(t.start_date)}</td>
                      <td className="tnum">{mmdd(t.due_date)}</td>
                      <td>
                        <span className={`chip ${sc[0]}`}>
                          <i />
                          {sc[1]}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button
                          className="btn txt"
                          style={{ padding: '2px 6px', fontSize: 11.5 }}
                          onClick={() => openEdit(t)}
                          disabled={busy}
                        >
                          수정
                        </button>
                        <button
                          className="btn txt"
                          style={{ padding: '2px 6px', fontSize: 11.5, color: 'var(--danger)' }}
                          onClick={() => removeTask(t)}
                          disabled={busy}
                        >
                          삭제
                        </button>
                      </td>
                    </tr>
                  )
                })}
              {!taskQ.loading && tasks.length === 0 && !taskQ.error && (
                <EmptyRow
                  cols={7}
                  text={isAll ? '등록된 업무가 없습니다.' : `${curMonth!.slice(0, 4)}년 ${+curMonth!.slice(5, 7)}월에 등록된 업무가 없습니다.`}
                />
              )}
            </tbody>
          </table>
        </div>
      </section>

      {modalFor && (
        <div className="modal-bg" onClick={() => setModalFor(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="mh">
              <div>
                <div className="eyebrow">{modalFor === 'new' ? '업무 등록' : '업무 수정'}</div>
                <h3>{label}</h3>
              </div>
              <button className="x" onClick={() => setModalFor(null)}>
                ✕
              </button>
            </div>
            <div className="mb">
              <div className="mfield">
                <label>업무명</label>
                <input
                  className="ctl"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="예: 보존처리 설계도면 작성"
                  autoFocus
                />
              </div>
              {modalFor === 'new' && (
                <div className="mfield">
                  <label>담당자</label>
                  <input className="ctl" value={me?.name ?? ''} readOnly disabled />
                  <div className="hint" style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                    담당자는 로그인한 작성자로 자동 지정됩니다.
                  </div>
                </div>
              )}
              <div style={{ display: 'flex', gap: 10 }}>
                <div className="mfield" style={{ flex: 1 }}>
                  <label>시작일</label>
                  <input className="ctl" type="date" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} />
                </div>
                <div className="mfield" style={{ flex: 1 }}>
                  <label>마감일</label>
                  <input className="ctl" type="date" value={form.due} onChange={(e) => setForm({ ...form, due: e.target.value })} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <div className="mfield" style={{ flex: 1 }}>
                  <label>세부분류</label>
                  <input className="ctl" value={form.detail} onChange={(e) => setForm({ ...form, detail: e.target.value })} placeholder="예: 설계 / 조사 / 작업" />
                </div>
                <div className="mfield" style={{ width: 130 }}>
                  <label>상태</label>
                  <select className="ctl" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as WorkTask['status'] })}>
                    {ST_OPTS.map((o) => (
                      <option key={o.v} value={o.v}>
                        {o.t}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            <div className="mf">
              <button className="btn sec" onClick={() => setModalFor(null)} disabled={busy}>
                취소
              </button>
              <button className="btn pri" onClick={saveTask} disabled={busy || !form.title.trim()}>
                {busy ? '저장 중…' : modalFor === 'new' ? '등록' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
