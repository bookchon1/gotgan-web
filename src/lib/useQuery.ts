import { useCallback, useEffect, useState } from 'react'
import { isConfigured } from './supabase'

export interface QueryState<T> {
  data: T | null
  loading: boolean
  /** 'config' = Supabase 미설정 / 그 외 = 에러 메시지 */
  error: string | null
  reload: () => void
}

/**
 * Supabase 조회 공통 훅.
 * fetcher 는 { data, error } 를 반환하는 함수(보통 supabase 쿼리의 await 결과).
 * Supabase 미설정 시 error='config' 로 즉시 종료.
 */
export function useQuery<T>(
  fetcher: () => Promise<{ data: T | null; error: { message: string } | null }>,
  deps: unknown[] = [],
): QueryState<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const run = useCallback(async () => {
    if (!isConfigured) {
      setLoading(false)
      setError('config')
      return
    }
    setLoading(true)
    try {
      const { data: d, error: e } = await fetcher()
      if (e) {
        setError(e.message)
        setData(null)
      } else {
        setError(null)
        setData(d)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setData(null)
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  useEffect(() => {
    run()
  }, [run])

  return { data, loading, error, reload: run }
}
