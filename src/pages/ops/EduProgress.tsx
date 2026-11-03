import { useEffect, useMemo, useState } from 'react'
import { PageHead } from '../../components/PageHead'
import { ErrorBanner, LoadingRow, EmptyRow } from '../../components/States'
import { supabase } from '../../lib/supabase'
import { useQuery } from '../../lib/useQuery'
import type { EduStudent, EduProgress as EduProgressRow } from '../../types/db'

// ---- 교육 18과목 기본 커리큘럼 (시안 edu-checklist 그대로) ----
// 이론 8 + 실기 8 + 시험 2 = 18과목. 학생 등록 시 done:false 로 일괄 시딩.
const CURRICULUM: { section: EduProgressRow['section']; subjects: string[] }[] = [
  { section: '이론', subjects: ['건축용어', '건축사', '문양사', '재료', '단청의 원리', '단청학개론', '단청 관련 법', '국가유산법'] },
  { section: '실기', subjects: ['기법', '화문', '휘문', '금문', '회화문', '부재별', '시대별', '현장학습'] },
  { section: '시험', subjects: ['기능자시험준비', '기술자시험준비'] },
]
const SECTIONS: EduProgressRow['section'][] = ['이론', '실기', '시험']
const SEC_TOTAL: Record<EduProgressRow['section'], number> = { 이론: 8, 실기: 8, 시험: 2 }

function pct(done: number, total: number): number {
  return total === 0 ? 0 : Math.round((done / total) * 100)
}

/** 교육 · 수업진도 — 학생별 18과목(이론·실기·시험) 진도 관리 */
export default function EduProgress() {
  const [addOpen, setAddOpen] = useState(false)
  const [selId, setSelId] = useState<string | null>(null)

  const stuQ = useQuery<EduStudent[]>(
    async () =>
      await supabase
        .from('edu_students')
        .select('id,student_no,name,year,class_main,class_sub,active')
        .eq('active', true)
        .order('student_no', { ascending: true }),
    [],
  )
  const progQ = useQuery<EduProgressRow[]>(
    async () =>
      await supabase
        .from('edu_progress')
        .select('id,student_id,section,subject,done,sort')
        .order('sort', { ascending: true }),
    [],
  )

  const students = stuQ.data ?? []
  const progress = progQ.data ?? []

  // 학생별 진도 집계 {student_id: {전체:{done,total}, 이론:…, 실기:…, 시험:…}}
  const stats = useMemo(() => {
    const m: Record<string, Record<string, { done: number; total: number }>> = {}
    for (const p of progress) {
      const s = (m[p.student_id] ??= {
        전체: { done: 0, total: 0 },
        이론: { done: 0, total: 0 },
        실기: { done: 0, total: 0 },
        시험: { done: 0, total: 0 },
      })
      s[p.section].total += 1
      s.전체.total += 1
      if (p.done) {
        s[p.section].done += 1
        s.전체.done += 1
      }
    }
    return m
  }, [progress])

  const [year, setYear] = useState('all')
  const [cls, setCls] = useState('all')
  const [q, setQ] = useState('')

  const years = useMemo(() => {
    const set = new Set<number>()
    for (const s of students) if (s.year != null) set.add(s.year)
    return Array.from(set).sort((a, b) => b - a)
  }, [students])
  const classes = useMemo(() => {
    const set = new Set<string>()
    for (const s of students) if (s.class_main) set.add(s.class_main)
    return Array.from(set).sort()
  }, [students])

  const list = useMemo(
    () =>
      students.filter((s) => {
        if (year !== 'all' && String(s.year) !== year) return false
        if (cls !== 'all' && s.class_main !== cls) return false
        if (q.trim()) {
          const hay = [s.name, s.student_no].filter(Boolean).join(' ').toLowerCase()
          if (!hay.includes(q.trim().toLowerCase())) return false
        }
        return true
      }),
    [students, year, cls, q],
  )

  const topBtn = (
    <button className="btn pri" onClick={() => setAddOpen(true)}>
      + 학생 등록
    </button>
  )

  const sel = students.find((s) => s.id === selId) ?? null

  return (
    <div className="page on">
      <PageHead eyebrow="교육 · 진도" title="수업진도" desc="학생별 18과목 진도(이론·실기·시험)를 관리합니다." actions={topBtn} />
      <section className="panel">
        <ErrorBanner error={stuQ.error ?? progQ.error} table="edu_students" />
        <div className="toolbar">
          <select className="sel" value={year} onChange={(e) => setYear(e.target.value)}>
            <option value="all">전체 년도</option>
            {years.map((y) => (
              <option key={y} value={String(y)}>
                {y}년
              </option>
            ))}
          </select>
          <select className="sel" value={cls} onChange={(e) => setCls(e.target.value)}>
            <option value="all">전체 반</option>
            {classes.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <label className="search" style={{ marginLeft: 'auto' }}>
            <svg className="icon" width="15" height="15" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4-4" />
            </svg>
            <input placeholder="학생 검색" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
        </div>
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>학생 이름 / 번호</th>
                <th>년도</th>
                <th>반 / 세부</th>
                <th>전체 진행률</th>
                <th>이론</th>
                <th>실기</th>
                <th>시험</th>
              </tr>
            </thead>
            <tbody>
              {(stuQ.loading || progQ.loading) && <LoadingRow cols={7} />}
              {!stuQ.loading &&
                !progQ.loading &&
                list.map((s) => {
                  const st = stats[s.id] ?? {
                    전체: { done: 0, total: 18 },
                    이론: { done: 0, total: 8 },
                    실기: { done: 0, total: 8 },
                    시험: { done: 0, total: 2 },
                  }
                  const allPct = pct(st.전체.done, st.전체.total)
                  return (
                    <tr
                      key={s.id}
                      onClick={() => setSelId(s.id)}
                      style={{ cursor: 'pointer', background: selId === s.id ? 'var(--brand-soft)' : undefined }}
                    >
                      <td>
                        <div className="t-title">{s.name}</div>
                        {s.student_no && <div className="t-sub">{s.student_no}</div>}
                      </td>
                      <td className="tnum">{s.year ?? '—'}</td>
                      <td>
                        {s.class_main ?? '—'}
                        {s.class_sub ? ` · ${s.class_sub}` : ''}
                      </td>
                      <td>
                        <div className="pbar">
                          <div className="track">
                            <div className={`fill${allPct === 100 ? ' full' : ''}`} style={{ width: `${allPct}%` }} />
                          </div>
                          <span>
                            {allPct}% · {st.전체.done}/{st.전체.total}
                          </span>
                        </div>
                      </td>
                      {SECTIONS.map((sec) => {
                        const d = st[sec]
                        const p = pct(d.done, d.total)
                        return (
                          <td key={sec}>
                            <div className="pbar">
                              <div className="track">
                                <div className={`fill${p === 100 ? ' full' : ''}`} style={{ width: `${p}%` }} />
                              </div>
                              <span>
                                {d.done}/{d.total}
                              </span>
                            </div>
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              {!stuQ.loading && !progQ.loading && list.length === 0 && !stuQ.error && (
                <EmptyRow cols={7} text="등록된 학생이 없습니다. '학생 등록'으로 추가하세요." />
              )}
            </tbody>
          </table>
        </div>
      </section>

      {sel && (
        <StudentProgressPanel
          student={sel}
          rows={progress.filter((p) => p.student_id === sel.id)}
          onSaved={() => progQ.reload()}
        />
      )}

      {addOpen && (
        <StudentModal
          onClose={() => setAddOpen(false)}
          onSaved={(id) => {
            setAddOpen(false)
            setSelId(id)
            stuQ.reload()
            progQ.reload()
          }}
        />
      )}
    </div>
  )
}

// ===== 학생별 진도 상세 — 18과목 체크리스트 + 진도 저장 =====
function StudentProgressPanel({
  student,
  rows,
  onSaved,
}: {
  student: EduStudent
  rows: EduProgressRow[]
  onSaved: () => void
}) {
  // 로컬 체크 상태 {progress_id: done}
  const [local, setLocal] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  // 학생이 바뀌거나 서버 데이터가 갱신되면 로컬 상태 리셋
  useEffect(() => {
    setLocal(Object.fromEntries(rows.map((r) => [r.id, r.done])))
    setNote(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [student.id, rows.length])

  const doneCount = (sec?: EduProgressRow['section']) =>
    rows.filter((r) => (sec ? r.section === sec : true) && local[r.id]).length
  const total = rows.length || 18
  const allPct = pct(doneCount(), total)

  const dirty = rows.some((r) => local[r.id] !== r.done)

  async function save() {
    const changed = rows.filter((r) => local[r.id] !== r.done)
    if (changed.length === 0) return
    setBusy(true)
    setNote(null)
    // 변경된 행만 개별 update (section·subject 는 변경하지 않음 → done 만 반영)
    for (const r of changed) {
      const { error } = await supabase
        .from('edu_progress')
        .update({ done: local[r.id], updated_at: new Date().toISOString() })
        .eq('id', r.id)
      if (error) {
        setBusy(false)
        setNote(`저장 실패: ${error.message}`)
        return
      }
    }
    setBusy(false)
    setNote(`✓ ${changed.length}개 과목 진도를 저장했습니다.`)
    onSaved()
  }

  return (
    <section className="panel" style={{ marginTop: 14 }}>
      <div className="panel-h">
        <div>
          <h2>{student.name} · 학생별 수업진도</h2>
        </div>
      </div>
      <div className="ops-stats">
        <div className="s">
          <small>전체</small>
          <b className="tnum">{allPct}%</b>
        </div>
        {SECTIONS.map((sec) => (
          <div className="s" key={sec}>
            <small>{sec}</small>
            <b className="tnum">
              {doneCount(sec)}/{SEC_TOTAL[sec]}
            </b>
          </div>
        ))}
      </div>
      <div className="checklist">
        {SECTIONS.map((sec) => {
          const secRows = rows.filter((r) => r.section === sec)
          return (
            <fieldset key={sec}>
              <legend>
                {sec}{' '}
                <span>
                  {doneCount(sec)}/{secRows.length}
                </span>
              </legend>
              {secRows.map((r) => {
                const on = !!local[r.id]
                return (
                  <div
                    key={r.id}
                    className={`it${on ? ' done' : ''}`}
                    style={{ cursor: 'pointer' }}
                    onClick={() => setLocal((p) => ({ ...p, [r.id]: !p[r.id] }))}
                  >
                    <span className="mk">
                      {on && (
                        <svg className="icon" width="10" height="10" viewBox="0 0 24 24" style={{ color: '#fff' }}>
                          <path d="M5 12l4 4 10-10" />
                        </svg>
                      )}
                    </span>
                    <span>{r.subject}</span>
                    <span className="st">{on ? '이수' : '미이수'}</span>
                  </div>
                )
              })}
            </fieldset>
          )
        })}
      </div>
      <div style={{ marginTop: 13, display: 'flex', gap: 10, alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>
          {note ?? '시험 진행률은 시험 준비 2항목의 이수율입니다.'}
        </span>
        <button className="btn sec r" style={{ marginLeft: 'auto' }} onClick={save} disabled={busy || !dirty}>
          {busy ? '저장 중…' : '진도 저장'}
        </button>
      </div>
    </section>
  )
}

// ===== 학생 등록 모달 — 등록 시 18과목 edu_progress 시딩 =====
function StudentModal({ onClose, onSaved }: { onClose: () => void; onSaved: (id: string) => void }) {
  const [name, setName] = useState('')
  const [studentNo, setStudentNo] = useState('')
  const [year, setYear] = useState<number>(new Date().getFullYear())
  const [classMain, setClassMain] = useState('전문반')
  const [classSub, setClassSub] = useState('정규반')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function save() {
    if (!name.trim()) {
      setErr('학생 이름을 입력하세요.')
      return
    }
    setBusy(true)
    setErr(null)

    // 학생번호 미입력 시 자동 생성 (ED-00000NNN)
    let no = studentNo.trim()
    if (!no) {
      no = `ED-${String(Math.floor(Math.random() * 1_000_000_000)).padStart(9, '0')}`
    }

    // 1) 학생 insert → id 확보
    const { data: stu, error } = await supabase
      .from('edu_students')
      .insert({
        student_no: no,
        name: name.trim(),
        year: Number(year) || null,
        class_main: classMain.trim() || null,
        class_sub: classSub.trim() || null,
        active: true,
      })
      .select('id')
      .single()
    if (error || !stu) {
      setBusy(false)
      setErr(error?.message ?? '학생 등록 실패')
      return
    }

    // 2) 18과목 진도 행 일괄 insert (done:false)
    let sort = 0
    const progressRows = CURRICULUM.flatMap((g) =>
      g.subjects.map((subject) => ({
        student_id: stu.id,
        section: g.section,
        subject,
        done: false,
        sort: sort++,
      })),
    )
    const { error: pErr } = await supabase.from('edu_progress').insert(progressRows)
    if (pErr) {
      setBusy(false)
      setErr(`학생은 등록됐으나 진도 과목 생성 실패: ${pErr.message}`)
      return
    }

    setBusy(false)
    onSaved(stu.id)
  }

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
        <div className="mh">
          <div>
            <div className="eyebrow">교육 · 학생</div>
            <h3>학생 등록</h3>
          </div>
          <button className="x" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="mb">
          <div style={{ display: 'flex', gap: 10 }}>
            <div className="mfield" style={{ flex: 1 }}>
              <label>이름</label>
              <input
                className="ctl"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="예: 정한솔"
                autoFocus
              />
            </div>
            <div className="mfield" style={{ flex: 1 }}>
              <label>학생번호</label>
              <input
                className="ctl"
                value={studentNo}
                onChange={(e) => setStudentNo(e.target.value)}
                placeholder="미입력 시 자동 생성"
              />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div className="mfield" style={{ width: 120 }}>
              <label>년도</label>
              <input
                className="ctl"
                type="number"
                value={year || ''}
                onChange={(e) => setYear(parseInt(e.target.value, 10) || 0)}
              />
            </div>
            <div className="mfield" style={{ flex: 1 }}>
              <label>반</label>
              <input
                className="ctl"
                value={classMain}
                onChange={(e) => setClassMain(e.target.value)}
                placeholder="예: 전문반"
              />
            </div>
            <div className="mfield" style={{ flex: 1 }}>
              <label>세부</label>
              <input
                className="ctl"
                value={classSub}
                onChange={(e) => setClassSub(e.target.value)}
                placeholder="예: 정규반"
              />
            </div>
          </div>
          <div className="sec-mini" style={{ display: 'block', margin: 0, color: 'var(--muted)', fontSize: 11.5 }}>
            등록 시 이론 8 · 실기 8 · 시험 2 (총 18과목) 진도 항목이 미이수 상태로 생성됩니다.
          </div>
          {err && (
            <div className="login-alert err" style={{ margin: '8px 0 0' }}>
              {err}
            </div>
          )}
        </div>
        <div className="mf">
          <button className="btn sec" onClick={onClose} disabled={busy}>
            취소
          </button>
          <button className="btn pri" onClick={save} disabled={busy}>
            {busy ? '등록 중…' : '등록'}
          </button>
        </div>
      </div>
    </div>
  )
}
