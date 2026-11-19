import { CcPicker } from './CcPicker'
import { approverLabel } from '../lib/format'

interface Emp { id: string; name: string; title: string | null }

/** 결재선 입력 (상신 화면 공통): 검토·승인·참조 선택 + 결재 흐름 요약 */
export function ApprLineFields({
  meName,
  candidates,
  reviewerId,
  setReviewerId,
  approverId,
  setApproverId,
  ccIds,
  setCcIds,
  fixedApprover,
  accounting = true,
}: {
  meName: string
  candidates: Emp[]
  reviewerId: string
  setReviewerId: (v: string) => void
  approverId?: string
  setApproverId?: (v: string) => void
  ccIds: string[]
  setCcIds: (v: string[]) => void
  fixedApprover?: string // 승인자가 정해져 있는 화면(현장 정산 등)
  accounting?: boolean
}) {
  const nameOf = (id: string) => candidates.find((e) => e.id === id)?.name ?? ''
  return (
    <div className="alf">
      <div className="alf-grid">
        <label className="pf-f">
          <span>검토 (생략 가능)</span>
          <select className="ctl" value={reviewerId} onChange={(e) => setReviewerId(e.target.value)}>
            <option value="">검토</option>
            {candidates.map((e) => (<option key={e.id} value={e.id}>{approverLabel(e)}</option>))}
          </select>
        </label>
        {fixedApprover ? (
          <div className="pf-f">
            <span>승인</span>
            <div className="ctl alf-fixed">{fixedApprover}</div>
          </div>
        ) : (
          <label className="pf-f">
            <span>승인 *</span>
            <select className="ctl" value={approverId ?? ''} onChange={(e) => setApproverId?.(e.target.value)}>
              <option value="">승인</option>
              {candidates.map((e) => (<option key={e.id} value={e.id}>{approverLabel(e)}</option>))}
            </select>
          </label>
        )}
        <CcPicker value={ccIds} onChange={setCcIds} className="pf-f" compact />
      </div>
      <div className="alf-flow">
        <span className="badge">기안 {meName || '—'}</span>
        {reviewerId && (<><i>›</i><span className="badge">검토 {nameOf(reviewerId)}</span></>)}
        {(approverId || fixedApprover) && (<><i>›</i><span className="badge gold">승인 {fixedApprover ? fixedApprover : nameOf(approverId!)}</span></>)}
        {accounting && (<><i>›</i><span className="badge green">회계접수</span></>)}
      </div>
    </div>
  )
}
