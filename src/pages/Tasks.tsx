import { useParams } from 'react-router-dom'
import { PageHead } from '../components/PageHead'
import { AREAS } from '../data/areas'

export default function Tasks() {
  const { area } = useParams()
  const a = AREAS.find((x) => x.id === area)
  const label = a ? `${a.label} 업무현황` : '업무현황'

  return (
    <div className="page on">
      <PageHead eyebrow="업무관리" title={label} desc="부서별 업무를 한눈에 확인하세요." />
      <section className="panel">
        <div
          style={{
            padding: '32px 16px',
            textAlign: 'center',
            color: 'var(--muted)',
            fontSize: 13,
          }}
        >
          {label} 데이터 연동 예정입니다.
        </div>
      </section>
    </div>
  )
}
