import { PageHead } from '../components/PageHead'

/** 아직 연동 전인 화면 — 시안 디자인 틀 안에서 '준비 중' 안내 */
export function Placeholder({ title, note }: { title: string; note?: string }) {
  return (
    <div className="page on">
      <PageHead
        eyebrow="곳간"
        title={title}
        desc={note ?? '이 화면은 순차적으로 연동됩니다. 디자인은 시안 그대로 적용됩니다.'}
      />
      <section className="panel">
        <div
          style={{
            padding: '40px 16px',
            textAlign: 'center',
            color: 'var(--muted)',
          }}
        >
          <div style={{ fontWeight: 700, color: 'var(--ink-soft)', marginBottom: 6 }}>
            준비 중
          </div>
          <div style={{ fontSize: 13 }}>
            {title} 화면을 Supabase와 연동하는 작업이 예정되어 있습니다.
          </div>
        </div>
      </section>
    </div>
  )
}
