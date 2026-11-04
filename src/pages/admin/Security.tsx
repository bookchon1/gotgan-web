import { useState } from 'react'
import { supabase } from '../../lib/supabase'

// 역할별 접근 범위 (시안 matrix)
const ROWS: [string, string, string][] = [
  ['업무 조회·수정', '모든 사용자 업무', '본인에게 배정된 업무'],
  ['문서 열람', '모든 문서와 첨부', '본인 + 공유받은 문서'],
  ['전자결재 열람', '모든 기안', '본인 기안 + 지정 결재 + 수신문서'],
  ['인사 정보·서류', '인사 담당 관리자만', '차단'],
  ['근무·급여기록', '노무 담당 관리자만', '차단'],
  ['회계 장부', '회계 담당 관리자만', '차단'],
  ['사용자·권한 변경', '최초 관리자만', '차단'],
]

// 실제 서버(Supabase RLS)에 요청해 접근 허용/차단을 확인할 민감 테이블
// (테이블명은 src/types/db.ts · supabase/schema.sql 기준)
const PROBES: { id: string; table: string; label: string }[] = [
  { id: 'employees', table: 'employees', label: '인사 (직원 정보)' },
  { id: 'payroll_runs', table: 'payroll_runs', label: '급여 (급여대장)' },
  { id: 'payslips', table: 'payslips', label: '급여 (명세서)' },
  { id: 'acct_tx', table: 'acct_tx', label: '회계 (장부·전표)' },
  { id: 'permissions', table: 'permissions', label: '사용자·권한' },
]

type ProbeResult = { ok: boolean; detail: string }

export default function Security() {
  const [running, setRunning] = useState(false)
  const [results, setResults] = useState<Record<string, ProbeResult>>({})

  async function runChecks() {
    setRunning(true)
    setResults({})
    const next: Record<string, ProbeResult> = {}
    for (const p of PROBES) {
      // head+count: 행 데이터는 전송하지 않고 접근 가능 여부/건수만 확인
      const { error, count } = await supabase
        .from(p.table)
        .select('*', { count: 'exact', head: true })
      if (error) {
        next[p.id] = { ok: false, detail: error.code ? `코드 ${error.code}` : error.message }
      } else {
        next[p.id] = { ok: true, detail: `${count ?? 0}건` }
      }
    }
    setResults(next)
    setRunning(false)
  }

  return (
    <div className="page on">
      <section className="panel">
        <div className="panel-h">
          <div>
            <h2>역할별 접근 범위</h2>
          </div>
          <button className="btn pri" onClick={runChecks} disabled={running}>
            {running ? '검증 중…' : '권한 검증 실행'}
          </button>
        </div>
        <div className="tbl-wrap">
          <table className="matrix">
            <thead>
              <tr>
                <th>기능 / 자료</th>
                <th>관리자</th>
                <th>일반 사용자</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map(([feat, admin, user]) => (
                <tr key={feat}>
                  <td>{feat}</td>
                  <td>{admin}</td>
                  <td style={user === '차단' ? { color: 'var(--danger)', fontWeight: 700 } : undefined}>
                    {user}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="sec-mini" style={{ marginTop: 12 }}>
          이 접근 제어는 화면이 아니라 <b>서버(Supabase RLS)</b>에서 강제됩니다. 권한이 없는
          데이터 요청은 서버에서 차단되어 애초에 내려오지 않습니다.
        </p>
      </section>

      <section className="panel" style={{ marginTop: 14 }}>
        <div className="panel-h">
          <div>
            <h2>라이브 검증 결과</h2>
            <p>지금 로그인한 계정으로 각 민감 테이블에 직접 요청한 서버 응답입니다.</p>
          </div>
        </div>
        <div className="tbl-wrap">
          <table className="matrix">
            <thead>
              <tr>
                <th>자료</th>
                <th>서버 응답 기준</th>
              </tr>
            </thead>
            <tbody>
              {PROBES.map((p) => {
                const r = results[p.id]
                return (
                  <tr key={p.id}>
                    <td>{p.label}</td>
                    <td>
                      {running && !r ? (
                        <span className="t-sub">요청 중…</span>
                      ) : r ? (
                        r.ok ? (
                          <span className="chip inc">
                            허용 (200) · {r.detail}
                          </span>
                        ) : (
                          <span
                            className="chip"
                            style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}
                          >
                            차단 (403) · {r.detail}
                          </span>
                        )
                      ) : (
                        <span className="t-sub">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="sec-mini" style={{ marginTop: 12 }}>
          200 = 접근 허용 · 403 = 서버에서 차단
        </p>
      </section>
    </div>
  )
}
