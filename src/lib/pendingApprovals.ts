import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { useAuth } from './auth'

/** 결재 상태가 바뀌었을 때(승인·반려·회수·상신 등) 알림 숫자를 바로 갱신하기 위한 신호 */
export function notifyApprovalsChanged() {
  window.dispatchEvent(new Event('gotgan:approvals-changed'))
}

/** 내 결재대기 건수 — 내 차례(앞 단계가 모두 승인)이고 아직 처리하지 않은 문서.
 *  1분마다·창으로 돌아올 때·결재 처리 직후에 다시 계산한다. */
export function usePendingApprovals(): number {
  const { me } = useAuth()
  const myId = me?.id ?? null
  const [count, setCount] = useState(0)

  const load = useCallback(async () => {
    if (!myId) return setCount(0)
    const { data: mine } = await supabase
      .from('approval_lines')
      .select('approval_id')
      .eq('approver_id', myId)
      .eq('decided', '대기')
      .in('role', ['검토', '합의', '승인', '회계접수'])
    const ids = [...new Set((mine ?? []).map((l) => l.approval_id as string))]
    if (!ids.length) return setCount(0)
    const [{ data: appr }, { data: lines }] = await Promise.all([
      supabase.from('approvals').select('id,status').in('id', ids),
      supabase.from('approval_lines').select('approval_id,seq,approver_id,decided').in('approval_id', ids),
    ])
    const live = new Set((appr ?? []).filter((a) => ['진행'].includes(a.status as string)).map((a) => a.id as string))
    let n = 0
    for (const id of ids) {
      if (!live.has(id)) continue
      const ls = (lines ?? []).filter((l) => l.approval_id === id).sort((a, b) => (a.seq as number) - (b.seq as number))
      const idx = ls.findIndex((l) => l.approver_id === myId && l.decided === '대기')
      if (idx >= 0 && ls.slice(0, idx).every((l) => l.decided === '승인')) n++
    }
    setCount(n)
  }, [myId])

  useEffect(() => {
    load()
    const t = setInterval(load, 60_000)
    const onVis = () => document.visibilityState === 'visible' && load()
    window.addEventListener('focus', load)
    window.addEventListener('gotgan:approvals-changed', load)
    document.addEventListener('visibilitychange', onVis)
    return () => {
      clearInterval(t)
      window.removeEventListener('focus', load)
      window.removeEventListener('gotgan:approvals-changed', load)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [load])

  return count
}
