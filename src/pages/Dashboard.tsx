import { PageHead } from '../components/PageHead'
import { Icon } from '../components/Icon'
import { useAuth } from '../lib/auth'

export default function Dashboard() {
  const { me } = useAuth()
  const name = me?.name ?? '구성원'

  return (
    <div className="page on" id="p-dashboard">
      <PageHead
        eyebrow="YOUR DAILY WORKSPACE"
        title={
          <>
            <span>{name}</span>님, 안녕하세요.<span className="hello-dot" />
          </>
        }
        desc="오늘의 업무와 필요한 기록을 한곳에서 확인하세요."
      />

      {/* 업무 중심 KPI */}
      <div className="stats">
        <div className="stat">
          <div>
            <div className="lbl">내 업무</div>
            <div className="val tnum">
              5<small>건</small>
            </div>
            <div className="sub">등록된 업무</div>
          </div>
          <span className="si sage">
            <Icon name="tasks" size={21} />
          </span>
        </div>
        <div className="stat">
          <div>
            <div className="lbl">진행 중</div>
            <div className="val tnum">
              3<small>건</small>
            </div>
            <div className="sub">지금 이어가는 일</div>
          </div>
          <span className="si blue">
            <Icon name="clock" size={21} />
          </span>
        </div>
        <div className="stat">
          <div>
            <div className="lbl">완료한 업무</div>
            <div className="val tnum">
              2<small>건</small>
            </div>
            <div className="sub">차곡차곡 쌓인 성과</div>
          </div>
          <span className="si sand">
            <Icon name="approval" size={21} />
          </span>
        </div>
        <div className="stat dark">
          <div>
            <div className="lbl">결재 대기</div>
            <div className="val tnum">
              3<small>건</small>
            </div>
            <div className="sub">내 차례</div>
          </div>
          <span className="si">
            <Icon name="approval" size={21} />
          </span>
        </div>
      </div>

      <div className="cols" style={{ gridTemplateColumns: '1fr' }}>
        <div className="col">
          <section className="panel">
            <div className="panel-h">
              <div>
                <h2>
                  전체 업무현황 <span className="count">—</span>
                </h2>
              </div>
            </div>
            <div
              style={{
                padding: '32px 16px',
                textAlign: 'center',
                color: 'var(--muted)',
                fontSize: 13,
              }}
            >
              업무 데이터 연동 예정입니다.
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
