import { PartnerView } from './accounting/PartnerView'

/** 업체정보 — 문서보관 아래 독립 메뉴 (구 회계관리 > 업체정보 탭). 관리자 전용. */
export default function Partners() {
  return (
    <div className="page on">
      <PartnerView />
    </div>
  )
}
