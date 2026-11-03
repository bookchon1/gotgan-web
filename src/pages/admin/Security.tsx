import { PageHead } from '../../components/PageHead'

// 역할별 접근 범위 (시안 matrix)
const ROWS: [string, string, string][] = [
  ['업무 조회·수정', '모든 사용자 업무', '본인에게 배정된 업무'],
  ['문서 열람', '모든 문서와 첨부', '본인 + 공유받은 문서'],
  ['전자결재 열람', '모든 기안', '본인 기안 + 지정 결재 + 수신문서'],
  ['인사 정보·서류', '인사 담당 관리자만', '차단'],
  ['근무·급여 기록', '노무 담당 관리자만', '차단'],
  ['회계 장부', '회계 담당 관리자만', '차단'],
  ['사용자·권한 변경', '최초 관리자만', '차단'],
]

export default function Security() {
  return (
    <div className="page on">
      <PageHead
        eyebrow="TRUST, VERIFIED"
        title="권한 검증"
        desc="역할에 따라 실제 접근이 허용·차단되는 범위를 확인합니다."
        actions={
          <button className="btn pri">
            권한 검증 실행
          </button>
        }
      />
      <section className="panel">
        <div className="panel-h">
          <div>
            <h2>역할별 접근 범위</h2>
          </div>
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
    </div>
  )
}
