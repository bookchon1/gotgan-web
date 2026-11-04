// 연차/휴가 공통 계산 — LeaveView(휴가현황)에서 사용.
// ⚠️ 이 로직은 휴가 현황에서 검증된 값과 동일해야 한다(정규직·입사일 기준 부여·이월/부여 분리).

// 연차에서 차감되는 유형(연차 소진). 대체휴무·대체반차·병가·생일휴무·경조사·공가·출장은 차감 안 함.
export const ANNUAL_DEDUCT = new Set(['연차', '반차', '월차', '휴가'])

/** 연차 자동 부여 계산 (근로기준법 기준, 기준일=오늘)
 *  - 입사 1년 미만: 매월 1개 발생(최대 11). 다음 해 1월 1일 되면 소멸 → 15개 전환
 *  - 입사 1년(만 1년) 이상: 기본 15개
 *  - 입사 2년 이후부터 2년마다 +1 (3년차 16, 5년차 17 …) = 15 + floor((만근속연수-1)/2)
 *  - 가산 포함 최대 25일 한도(근로기준법 제60조④)
 *  반환: { granted, basis } basis 는 표시용 설명
 */
export function grantedAnnual(joinISO: string | null, today = new Date()): { granted: number; basis: string } {
  if (!joinISO) return { granted: 0, basis: '입사일 미등록' }
  const join = new Date(joinISO)
  if (isNaN(+join)) return { granted: 0, basis: '입사일 오류' }

  // 만 근속 연수(완성 연수)
  let years = today.getFullYear() - join.getFullYear()
  const anniv = new Date(join)
  anniv.setFullYear(join.getFullYear() + years)
  if (anniv > today) years -= 1 // 아직 이번 주기 생일(입사일) 전이면 1 빼기

  if (years < 1) {
    // 입사 1년 미만: 경과 월수(완성 월) 1개월당 1개, 최대 11
    let months = (today.getFullYear() - join.getFullYear()) * 12 + (today.getMonth() - join.getMonth())
    if (today.getDate() < join.getDate()) months -= 1
    const g = Math.max(0, Math.min(11, months))
    return { granted: g, basis: `입사 1년 미만 · 월 ${g}개(최대11)` }
  }
  // 1년 이상: 15 + 2년마다 1 가산, 단 최대 25일(가산 포함 법정 상한)
  const raw = 15 + Math.floor((years - 1) / 2)
  const g = Math.min(25, raw)
  const capped = raw > 25
  return {
    granted: g,
    basis: `근속 ${years}년 · 기본15${g > 15 ? `+가산${g - 15}` : ''}${capped ? ' (최대25 한도)' : ''}`,
  }
}
