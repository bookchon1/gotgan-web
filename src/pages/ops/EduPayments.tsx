import { useMemo, useState } from 'react'
import { PageHead } from '../../components/PageHead'
import { ErrorBanner, LoadingRow, EmptyRow } from '../../components/States'
import { supabase } from '../../lib/supabase'
import { useQuery } from '../../lib/useQuery'
import { eok, won } from '../../lib/format'
import type { EduPayment, EduStudent } from '../../types/db'

const METHODS = ['계좌이체', '카드', '현금', '기타']
const THIS_MONTH = new Date().toISOString().slice(0, 7) // 'YYYY-MM'

/** 교육 · 납부현황 — 월별 수강료 청구·납부·미납 관리 */
export default function EduPayments() {
  const [ym, setYm] = useState(THIS_MONTH)
  const [stuFilter, setStuFilter] = useState('all')
  const [payOpenFor, setPayOpenFor] = useState<EduStudent | null>(null)

  const stuQ = useQuery<EduStudent[]>(
    async () =>
      await supabase
        .from('edu_students')
        .select('id,student_no,name,year,class_main,class_sub,active')
        .eq('active', true)
        .order('student_no', { ascending: true }),
    [],
  )
  // 선택한 청구월의 납부 레코드
  const payQ = useQuery<EduPayment[]>(
    async () =>
      await supabase
        .from('edu_payments')
        .select('id,student_id,charge_ym,charged,paid,method,paid_date,memo')
        .eq('charge_ym', ym),
    [ym],
  )

  const students = stuQ.data ?? []
  const payments = payQ.data ?? []
  const payByStudent = useMemo(
    () => Object.fromEntries(payments.map((p) => [p.student_id, p])),
    [payments],
  )

  const visibleStudents = useMemo(
    () => (stuFilter === 'all' ? students : students.filter((s) => s.id === stuFilter)),
    [students, stuFilter],
  )

  // 상단 합계 (표시 중인 학생 기준)
  const totals = useMemo(() => {
    let charged = 0
    let paid = 0
    for (const s of visibleStudents) {
      const p = payByStudent[s.id]
      charged += p?.charged ?? 0
      paid += p?.paid ?? 0
    }
    return { charged, paid, unpaid: charged - paid }
  }, [visibleStudents, payByStudent])

  return (
    <div className="page on">
      <PageHead eyebrow="교육 · 납부" title="납부현황" desc="월별 수강료 청구·납부·미납을 관리합니다." />

      <div className="ops-stats">
        <div className="s">
          <small>청구액 ({ym})</small>
          <b className="tnum">{eok(totals.charged)}</b>
        </div>
        <div className="s">
          <small>납부액</small>
          <b className="tnum" style={{ color: 'var(--ok)' }}>
            {eok(totals.paid)}
          </b>
        </div>
        <div className="s">
          <small>미납액</small>
          <b className="tnum" style={{ color: 'var(--danger)' }}>
            {eok(totals.unpaid)}
          </b>
        </div>
      </div>

      <section className="panel">
        <ErrorBanner error={stuQ.error ?? payQ.error} table="edu_payments" />
        <div className="toolbar">
          <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>청구월</span>
          <input className="sel" type="month" value={ym} onChange={(e) => setYm(e.target.value)} style={{ width: 150 }} />
          <select className="sel" value={stuFilter} onChange={(e) => setStuFilter(e.target.value)}>
            <option value="all">전체 학생</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>학생</th>
                <th>반</th>
                <th style={{ textAlign: 'right' }}>청구액</th>
                <th style={{ textAlign: 'right' }}>납부액</th>
                <th style={{ textAlign: 'right' }}>미납액</th>
                <th>관리</th>
              </tr>
            </thead>
            <tbody>
              {(stuQ.loading || payQ.loading) && <LoadingRow cols={6} />}
              {!stuQ.loading &&
                !payQ.loading &&
                visibleStudents.map((s) => {
                  const p = payByStudent[s.id]
                  const charged = p?.charged ?? 0
                  const paid = p?.paid ?? 0
                  const unpaid = charged - paid
                  return (
                    <tr key={s.id}>
                      <td>
                        <span className="owner">
                          <span className="av-s">{s.name.slice(0, 1)}</span>
                          <div>
                            <div className="t-title">{s.name}</div>
                            {s.student_no && <div className="t-sub">{s.student_no}</div>}
                          </div>
                        </span>
                      </td>
                      <td>
                        {s.class_main ?? '—'}
                        {s.class_sub ? ` · ${s.class_sub}` : ''}
                      </td>
                      <td className="tnum" style={{ textAlign: 'right' }}>
                        {p ? eok(charged) : '—'}
                      </td>
                      <td className="tnum" style={{ textAlign: 'right' }}>
                        {p ? eok(paid) : '—'}
                      </td>
                      <td
                        className="tnum"
                        style={{
                          textAlign: 'right',
                          ...(unpaid > 0 ? { color: 'var(--danger)', fontWeight: 700 } : {}),
                        }}
                      >
                        {p ? eok(unpaid) : '—'}
                      </td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button
                          className={p ? 'btn sec' : 'btn pri'}
                          style={{ padding: '5px 10px' }}
                          onClick={() => setPayOpenFor(s)}
                        >
                          {p ? '납부 내역' : '납부 등록'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              {!stuQ.loading && !payQ.loading && visibleStudents.length === 0 && !stuQ.error && (
                <EmptyRow cols={6} text="활성 학생이 없습니다. 수업진도 화면에서 학생을 등록하세요." />
              )}
            </tbody>
          </table>
        </div>
      </section>

      {payOpenFor && (
        <PaymentModal
          student={payOpenFor}
          ym={ym}
          existing={payByStudent[payOpenFor.id] ?? null}
          onClose={() => setPayOpenFor(null)}
          onSaved={() => {
            setPayOpenFor(null)
            payQ.reload()
          }}
        />
      )}
    </div>
  )
}

// 납부 등록/수정 모달 — (student_id, charge_ym) upsert
function PaymentModal({
  student,
  ym,
  existing,
  onClose,
  onSaved,
}: {
  student: EduStudent
  ym: string
  existing: EduPayment | null
  onClose: () => void
  onSaved: () => void
}) {
  const [chargeYm, setChargeYm] = useState(existing?.charge_ym ?? ym)
  const [charged, setCharged] = useState<number>(existing?.charged ?? 0)
  const [paid, setPaid] = useState<number>(existing?.paid ?? 0)
  const [method, setMethod] = useState(existing?.method ?? METHODS[0])
  const [paidDate, setPaidDate] = useState(existing?.paid_date?.slice(0, 10) ?? '')
  const [memo, setMemo] = useState(existing?.memo ?? '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const unpaid = (Number(charged) || 0) - (Number(paid) || 0)

  async function save() {
    if (!/^\d{4}-\d{2}$/.test(chargeYm)) {
      setErr('청구월을 YYYY-MM 형식으로 입력하세요.')
      return
    }
    setBusy(true)
    setErr(null)
    const { error } = await supabase.from('edu_payments').upsert(
      {
        student_id: student.id,
        charge_ym: chargeYm,
        charged: Number(charged) || 0,
        paid: Number(paid) || 0,
        method,
        paid_date: paidDate || null,
        memo: memo.trim() || null,
      },
      { onConflict: 'student_id,charge_ym' },
    )
    setBusy(false)
    if (error) {
      setErr(error.message)
      return
    }
    onSaved()
  }

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
        <div className="mh">
          <div>
            <div className="eyebrow">교육 · 납부</div>
            <h3>
              {student.name} · {existing ? '납부 내역' : '납부 등록'}
            </h3>
          </div>
          <button className="x" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="mb">
          <div style={{ display: 'flex', gap: 10 }}>
            <div className="mfield" style={{ width: 140 }}>
              <label>청구월</label>
              <input className="ctl" type="month" value={chargeYm} onChange={(e) => setChargeYm(e.target.value)} />
            </div>
            <div className="mfield" style={{ flex: 1 }}>
              <label>납부 방법</label>
              <select className="ctl" value={method} onChange={(e) => setMethod(e.target.value)}>
                {METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div className="mfield" style={{ flex: 1 }}>
              <label>청구액 (원)</label>
              <input
                className="ctl"
                type="number"
                min={0}
                step={10000}
                value={charged || ''}
                onChange={(e) => setCharged(parseInt(e.target.value, 10) || 0)}
                placeholder="0"
              />
            </div>
            <div className="mfield" style={{ flex: 1 }}>
              <label>납부액 (원)</label>
              <input
                className="ctl"
                type="number"
                min={0}
                step={10000}
                value={paid || ''}
                onChange={(e) => setPaid(parseInt(e.target.value, 10) || 0)}
                placeholder="0"
              />
            </div>
          </div>
          <div className="mfield">
            <label>납부일</label>
            <input className="ctl" type="date" value={paidDate} onChange={(e) => setPaidDate(e.target.value)} />
          </div>
          <div className="mfield">
            <label>메모</label>
            <input className="ctl" value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="(선택)" />
          </div>
          <div className="ops-stats" style={{ marginBottom: 0 }}>
            <div className="s">
              <small>청구액</small>
              <b className="tnum">{won(Number(charged) || 0)}원</b>
            </div>
            <div className="s">
              <small>납부액</small>
              <b className="tnum" style={{ color: 'var(--ok)' }}>
                {won(Number(paid) || 0)}원
              </b>
            </div>
            <div className="s">
              <small>미납액</small>
              <b className="tnum" style={{ color: unpaid > 0 ? 'var(--danger)' : 'var(--ink)' }}>
                {won(unpaid)}원
              </b>
            </div>
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
            {busy ? '저장 중…' : existing ? '저장' : '등록'}
          </button>
        </div>
      </div>
    </div>
  )
}
