// 부서 전용 화면 라우팅 진입점.
// ArtField 는 현장관리(SiteManagement)로, 나머지 5종은 묶음4b 전용 화면으로 연결한다.
// (각 화면은 별도 파일로 분리 — 이 파일은 App.tsx 의 기존 export 이름을 유지하기 위한 얇은 래퍼.)
import SiteManagement from './SiteManagement'
import PromotionScreen from './Promotion'
import ExperienceScreen from './Experience'
import EduProgressScreen from './EduProgress'
import EduMaterialsScreen from './EduMaterials'
import EduPaymentsScreen from './EduPayments'

/** 미술 · 현장관리 */
export function ArtField() {
  return <SiteManagement />
}
/** 홍보 · 홍보현황 */
export function Promotion() {
  return <PromotionScreen />
}
/** 체험 · 체험현황 */
export function Experience() {
  return <ExperienceScreen />
}
/** 교육 · 수업진도 */
export function EduProgress() {
  return <EduProgressScreen />
}
/** 교육 · 수업자료 */
export function EduMaterials() {
  return <EduMaterialsScreen />
}
/** 교육 · 납부현황 */
export function EduPayments() {
  return <EduPaymentsScreen />
}
