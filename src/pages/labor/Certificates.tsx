import { useMemo, useState } from 'react'
import { ErrorBanner } from '../../components/States'
import { supabase } from '../../lib/supabase'
import { useQuery } from '../../lib/useQuery'
import { dateOnly } from '../../lib/format'
import type { Employee } from '../../types/db'

/** 증명서 발급 — 재직증명서 / 경력증명서.
 *  서버 저장 없이 화면에서 생성 → 브라우저 인쇄(window.print)로 PDF 저장.
 *  @media print 로 .cert-print 영역만 인쇄된다(index.css). */

const COMPANY = '북촌불교미술보존연구소'
const COMPANY_FORMAL = '북촌불교미술보존연구소 (법인)'

const DEPT_LABEL: Record<string, string> = {
  art: '미술', management: '경영', product: '상품', promotion: '홍보', experience: '체험', education: '교육',
}
function deptLabel(key: string | null): string {
  return key ? DEPT_LABEL[key] ?? '대표' : '대표'
}

type CertKind = '재직증명서' | '경력증명서'

type EmpRow = Pick<
  Employee,
  'id' | 'name' | 'emp_no' | 'dept_key' | 'title' | 'position' | 'join_date' | 'join_ym' | 'leave_date' | 'status' | 'employment_type' | 'career' | 'is_root'
>

function resolveJoin(e: EmpRow): string | null {
  return (
    e.join_date ??
    (e.join_ym && /^\d{4}\.\d{2}$/.test(e.join_ym) ? e.join_ym.replace('.', '-') + '-01' : null)
  )
}

/** 두 날짜 사이 근속기간(년·개월). to 없으면 오늘 기준. */
function tenure(fromISO: string | null, toISO: string | null): string {
  if (!fromISO) return '—'
  const from = new Date(fromISO)
  const to = toISO ? new Date(toISO) : new Date()
  if (isNaN(+from) || isNaN(+to) || to < from) return '—'
  let months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth())
  if (to.getDate() < from.getDate()) months -= 1
  if (months < 0) months = 0
  const y = Math.floor(months / 12)
  const m = months % 12
  if (y === 0 && m === 0) return '1개월 미만'
  return `${y > 0 ? `${y}년 ` : ''}${m > 0 ? `${m}개월` : ''}`.trim()
}

/** 한국어 날짜 표기: 2026년 11월 4일 */
function krDate(iso: string): string {
  const s = dateOnly(iso)
  if (!s) return ''
  const [y, m, d] = s.split('-')
  return `${y}년 ${parseInt(m, 10)}월 ${parseInt(d, 10)}일`
}

export default function Certificates() {
  const today = new Date().toISOString().slice(0, 10)
  const [kind, setKind] = useState<CertKind>('재직증명서')
  const [purpose, setPurpose] = useState('제출용')
  const [issueDate, setIssueDate] = useState(today)
  const [includeLeft, setIncludeLeft] = useState(false) // 퇴직자 포함 토글
  const [empId, setEmpId] = useState<string>('')

  // 재직자 기본, 토글 시 전체(퇴직 포함)
  const empQ = useQuery<EmpRow[]>(
    async () => {
      const base = supabase
        .from('employees')
        .select('id,name,emp_no,dept_key,title,position,join_date,join_ym,leave_date,status,employment_type,career,is_root')
        .order('join_date', { ascending: true, nullsFirst: false })
        .order('sort', { ascending: true })
      return includeLeft ? await base : await base.eq('status', '재직')
    },
    [includeLeft],
  )

  const emps = empQ.data ?? []
  // 선택 직원 (목록 바뀌면 첫 직원으로)
  const selected = useMemo(() => {
    if (emps.length === 0) return null
    return emps.find((e) => e.id === empId) ?? emps[0]
  }, [emps, empId])

  // 대표이사 (is_root 또는 title='대표')
  const repQ = useQuery<Pick<Employee, 'name'>[]>(
    async () =>
      await supabase.from('employees').select('name').eq('is_root', true).eq('status', '재직').limit(1),
    [],
  )
  const repName = repQ.data?.[0]?.name ?? '대표이사'

  // 증명서 번호 — 제{연도}-{종류코드}{일련(날짜기반)}
  const certNo = useMemo(() => {
    const y = issueDate.slice(0, 4)
    const code = kind === '재직증명서' ? '재' : '경'
    const seq = issueDate.slice(5).replace('-', '') // MMDD
    return `제${y}-${code}${seq}호`
  }, [issueDate, kind])

  function print() {
    window.print()
  }

  const join = selected ? resolveJoin(selected) : null
  const isActive = selected?.status === '재직'
  const periodTo = isActive ? null : selected?.leave_date ?? null
  const dutyParts = selected
    ? [deptLabel(selected.dept_key), selected.title, selected.position].filter(Boolean)
    : []

  return (
    <>
      <ErrorBanner error={empQ.error} table="employees" />

      {/* 발급 설정 (화면 전용 — 인쇄 시 숨김) */}
      <section className="panel cert-controls">
        <div className="panel-h">
          <div>
            <h2>증명서 발급 <span className="count">{kind}</span></h2>
          </div>
        </div>
        <div className="cert-form">
          <div className="mfield">
            <label>직원</label>
            <select className="ctl" value={selected?.id ?? ''} onChange={(e) => setEmpId(e.target.value)}>
              {emps.length === 0 && <option value="">직원이 없습니다</option>}
              {emps.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                  {e.emp_no ? ` (${e.emp_no})` : ''} · {deptLabel(e.dept_key)}
                  {e.status !== '재직' ? ` · ${e.status}` : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="mfield">
            <label>증명서 종류</label>
            <select className="ctl" value={kind} onChange={(e) => setKind(e.target.value as CertKind)}>
              <option value="재직증명서">재직증명서</option>
              <option value="경력증명서">경력증명서</option>
            </select>
          </div>
          <div className="mfield">
            <label>발급 사유 (용도)</label>
            <input
              className="ctl"
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder="예: 은행 제출용"
            />
          </div>
          <div className="mfield">
            <label>발급일</label>
            <input type="date" className="ctl" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
          </div>
          <label className="mfield cert-toggle" style={{ cursor: 'pointer' }}>
            <label>&nbsp;</label>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 38 }}>
              <input type="checkbox" checked={includeLeft} onChange={(e) => setIncludeLeft(e.target.checked)} />
              <span style={{ fontSize: 13 }}>퇴직자 포함</span>
            </span>
          </label>
        </div>
        <div className="cert-actions">
          <span className="cert-hint">
            미리보기를 확인한 뒤 <b>인쇄 / PDF 저장</b>을 누르면 브라우저 인쇄 창에서 PDF로 저장할 수 있습니다.
          </span>
          <button className="btn pri" onClick={print} disabled={!selected}>
            인쇄 / PDF 저장
          </button>
        </div>
      </section>

      {/* 미리보기 = 인쇄 영역 */}
      {selected ? (
        <section className="panel cert-preview-wrap">
          <div className="cert-print" id="cert-print">
            <div className="cert-doc">
              {/* 문서번호 */}
              <div className="cert-no">{certNo}</div>

              <h1 className="cert-title">{kind}</h1>

              {/* 인적사항 표 */}
              <table className="cert-table">
                <tbody>
                  <tr>
                    <th>성 명</th>
                    <td>{selected.name}</td>
                    <th>사 번</th>
                    <td>{selected.emp_no ?? '—'}</td>
                  </tr>
                  <tr>
                    <th>소 속</th>
                    <td>{deptLabel(selected.dept_key)}</td>
                    <th>직 급 / 직 책</th>
                    <td>
                      {selected.title ?? '—'}
                      {selected.position ? ` / ${selected.position}` : ''}
                    </td>
                  </tr>
                  <tr>
                    <th>입 사 일</th>
                    <td>{join ? krDate(join) : '—'}</td>
                    <th>고용형태</th>
                    <td>{selected.employment_type ?? '—'}</td>
                  </tr>
                  {kind === '경력증명서' && (
                    <>
                      <tr>
                        <th>재직기간</th>
                        <td colSpan={3}>
                          {join ? krDate(join) : '—'} ~ {periodTo ? krDate(periodTo) : '현재'}
                          <span className="cert-sub"> ({tenure(join, periodTo)})</span>
                        </td>
                      </tr>
                      <tr>
                        <th>담당업무</th>
                        <td colSpan={3}>
                          {dutyParts.length > 0 ? dutyParts.join(' · ') : '—'}
                          {selected.career ? <div className="cert-career">{selected.career}</div> : null}
                        </td>
                      </tr>
                    </>
                  )}
                  <tr>
                    <th>발급사유</th>
                    <td colSpan={3}>{purpose || '—'}</td>
                  </tr>
                </tbody>
              </table>

              {/* 본문 서술 (소속·직급·직책은 위 표에 기재 — 문장에서는 생략) */}
              <p className="cert-body">
                위 사람은 <b>{COMPANY}</b>
                {kind === '재직증명서' ? (
                  <>
                    에 <b>{join ? krDate(join) : ''}</b> 입사하여 현재 <b>재직 중</b>임을 증명합니다.
                  </>
                ) : (
                  <>
                    에서 <b>{join ? krDate(join) : ''}</b>부터 <b>{periodTo ? krDate(periodTo) : '현재'}</b>까지{' '}
                    <b>{tenure(join, periodTo)}</b>간 근무하였음을 증명합니다.
                  </>
                )}
              </p>

              <p className="cert-attest">위 사실을 증명합니다.</p>

              {/* 발급일 */}
              <p className="cert-date">{krDate(issueDate)}</p>

              {/* 발급기관 + 직인란 */}
              <div className="cert-sign">
                <div className="cert-org">{COMPANY_FORMAL}</div>
                <div className="cert-rep">
                  대표이사&nbsp;&nbsp;{repName}
                  <span className="cert-seal">(직인)</span>
                </div>
              </div>
            </div>
          </div>
        </section>
      ) : (
        <section className="panel">
          <p style={{ padding: '28px 16px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
            발급할 직원이 없습니다.
          </p>
        </section>
      )}
    </>
  )
}
