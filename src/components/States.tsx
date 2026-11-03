// 화면 공통 상태 표시 (로딩/빈/에러/미설정 배너)

export function LoadingRow({ cols = 1 }: { cols?: number }) {
  return (
    <tr>
      <td
        colSpan={cols}
        style={{ textAlign: 'center', color: 'var(--muted)', padding: 28, fontSize: 13 }}
      >
        불러오는 중…
      </td>
    </tr>
  )
}

export function EmptyRow({ cols = 1, text = '내역이 없습니다.' }: { cols?: number; text?: string }) {
  return (
    <tr>
      <td
        colSpan={cols}
        style={{ textAlign: 'center', color: 'var(--muted)', padding: 28, fontSize: 13 }}
      >
        {text}
      </td>
    </tr>
  )
}

/** Supabase 미설정 / 에러 배너 (error 값에 따라) */
export function ErrorBanner({ error, table }: { error: string | null; table?: string }) {
  if (!error) return null
  if (error === 'config')
    return (
      <div className="login-alert warn" style={{ margin: '0 0 12px' }}>
        Supabase 연결이 설정되지 않았습니다. <code>.env</code> 설정 후 표시됩니다.
      </div>
    )
  return (
    <div className="login-alert err" style={{ margin: '0 0 12px' }}>
      데이터를 불러오지 못했습니다: {error}
      {table && (
        <div style={{ marginTop: 4, fontSize: 11 }}>
          ({table} 테이블·RLS 또는 접근 권한을 확인하세요.)
        </div>
      )}
    </div>
  )
}

/** 패널 안 중앙 안내(준비중 등) */
export function CenterNote({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
      {children}
    </div>
  )
}
