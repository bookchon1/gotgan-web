import { useEffect, useState } from 'react'
import { supabase } from './supabase'

/** 오늘 기준으로 나에게 결재를 위임한 사람들의 id (대결). 테이블이 없으면 빈 목록 */
export function useDelegators(myId: string | null | undefined): string[] {
  const [ids, setIds] = useState<string[]>([])
  useEffect(() => {
    if (!myId) return setIds([])
    const today = new Date().toISOString().slice(0, 10)
    supabase
      .from('approval_delegates')
      .select('owner_id')
      .eq('delegate_id', myId)
      .lte('from_date', today)
      .gte('to_date', today)
      .then(({ data, error }) => setIds(error ? [] : (data ?? []).map((d) => d.owner_id as string)))
  }, [myId])
  return ids
}
