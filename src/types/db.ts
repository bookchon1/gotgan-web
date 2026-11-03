// DB 테이블 타입 (schema.sql 과 1:1). Supabase 응답 타이핑용.

export interface Business {
  code: string
  name: string
  kind: string
  sort: number
}

export interface Department {
  key: string
  label: string
  admin_only: boolean
  locked: boolean
  sort: number
}

export interface Employee {
  id: string
  auth_user_id: string | null
  name: string
  dept_key: string | null
  title: string | null
  join_ym: string | null
  role: 'admin' | 'user'
  is_mgmt: boolean
  is_root: boolean
  status: '재직' | '휴직' | '퇴직'
  email: string | null
  phone: string | null
  sort: number
  // --- 상세 인사카드(대기업형) 확장 필드 ---
  emp_no: string | null           // 사번
  birth_md: string | null         // 생일(월-일, 예 '03-15') — 생년(연도)은 저장하지 않음
  gender: string | null           // 성별
  employment_type: string | null  // 고용형태(정규직/계약직/일용직/파견)
  position: string | null         // 직책(팀장/실장 등)
  extra_depts: string[]           // 겸소속(주소속 외 추가 부서 키 목록)
  join_date: string | null        // 입사일(YYYY-MM-DD)
  leave_date: string | null       // 퇴사일
  address: string | null          // 주소
  emergency_name: string | null   // 비상연락처(이름/관계)
  emergency_phone: string | null  // 비상연락처(번호)
  education: string | null        // 최종학력
  career: string | null           // 경력 요약
  certifications: string | null   // 자격증
  memo: string | null             // 인사 메모
}

/** 인사발령 이력 (hr_assignments) */
export interface HrAssignment {
  id: string
  employee_id: string
  eff_date: string                // 발령일
  kind: string                    // 입사/승진/부서이동/보직변경/휴직/복직/퇴직 등
  detail: string | null
  note: string | null
  created_at: string
}

export interface WorkTask {
  id: string
  area: string
  title: string
  dept: string | null
  detail: string | null
  owner_id: string | null
  reg_date: string | null
  start_date: string | null
  due_date: string | null
  status: 'plan' | 'prog' | 'done'
  src: string | null
  src_project_id: string | null
}

export type ArtStatus = '공고/입찰' | '예정' | '진행' | '완료' | '탈락/보류'

export interface ArtProject {
  id: string
  name: string
  client: string | null
  biz_code: string | null
  proj_type: string | null
  kind: '입찰' | '발주' | null
  status: ArtStatus
  progress: number
  now_text: string | null
  est_amount: number
  owner_id: string | null
  contract_base: number
  due_date: string | null
  done_date: string | null
  year: number | null
}

export interface ArtBudget {
  id: string
  project_id: string
  item: string
  alloc: number
  sort: number
}

export interface BudgetChange {
  id: string
  project_id: string
  date: string
  type: '증액' | '감액'
  memo: string | null
  after_amount: number
}

export interface BudgetReceipt {
  id: string
  project_id: string
  kind: '선금' | '기성' | '잔금'
  date: string
  amount: number
}

export type StepStatus = 'before' | 'prog' | 'done' | 'na'

export interface ProjectStep {
  id: string
  project_id: string
  seq: number
  title: string
  status: StepStatus
  from_date: string | null
  to_date: string | null
}

export interface StepComment {
  id: string
  step_id: string
  by_id: string | null
  date: string
  text: string
}

export interface Advisor {
  id: string
  project_id: string
  name: string
  org: string | null
  phone: string | null
  default_fee: number
  sort: number
}

export interface ArtStakeholder {
  id: string
  project_id: string
  kind: string
  name: string
  org: string | null
  phone: string | null
  sort: number
}

export type TxType = '수입' | '지출'

export interface AcctTx {
  id: string
  date: string
  biz_code: string | null
  dept_key: string | null
  tx_type: TxType
  account: string | null
  amount: number
  partner: string | null
  memo: string | null
  project_id: string | null
  budget_item: string | null
  src: '결의서' | '카드' | '대금수령' | '직접' | null
  year: number | null
}

export interface AcctCard {
  id: string
  date: string
  card: string
  bank: string | null
  shop: string | null
  amount: number
  account: string | null
  memo: string | null
  matched: boolean
}

export interface Partner {
  id: string
  name: string
  biz_no: string | null
  kind: string | null
  memo: string | null
}

export interface PayrollRun {
  id: string
  ym: string
  status: '작성중' | '상신완료' | '지급완료' | '반려'
  created_by: string | null
  submitted_at: string | null
  paid_at: string | null
}

export interface Payslip {
  id: string
  run_id: string
  employee_id: string
  base_pay: number
  allowances: number
  d_pension: number
  d_health: number
  d_ltc: number
  d_employment: number
  d_income_tax: number
  d_local_tax: number
  d_other: number
  deductions: number
  net_pay: number
  pay_date: string | null
}

export interface LeaveRecord {
  id: string
  employee_id: string
  leave_type: string
  status: '신청' | '승인' | '반려'
  start_date: string | null
  end_date: string | null
  days: number
  carry_over: number
  granted: number
  reason: string | null
  approver: string | null
  approved_at: string | null
}

export interface Attendance {
  id: string
  employee_id: string
  work_date: string
  check_in: string | null
  check_out: string | null
  status: '근무중' | '완료'
}

export type ApprovalStatus = '기안' | '진행' | '승인' | '반려' | '회수' | '회계접수'

export interface Approval {
  id: string
  doc_no: string | null
  kind: '지출결의서' | '품의' | '휴가' | '일반'
  drafter_id: string | null
  biz_code: string | null
  dept_key: string | null
  title: string | null
  amount: number | null
  account: string | null
  memo: string | null
  project_id: string | null
  budget_item: string | null
  req_date: string | null
  status: ApprovalStatus
}

export interface ApprovalLine {
  id: string
  approval_id: string
  seq: number
  approver_id: string | null
  role: '기안' | '승인' | '회계접수'
  decided: '대기' | '승인' | '반려'
  decided_at: string | null
}

export interface GotganDocument {
  id: string
  title: string
  file_path: string | null
  category: string | null
  owner_id: string | null
  share_scope: '개인' | '선택' | '전사'
  from_approval_id: string | null
  created_at: string
}

export interface GotganEvent {
  id: string
  date: string
  area: string | null
  title: string
  employee_id: string | null
}

export interface Meeting {
  id: string
  date: string
  dept: string | null
  title: string
  attendees: string | null
  body: string | null
}

export interface Inventory {
  id: string
  code: string | null
  category: '완제품' | '부자재' | null
  name: string
  stock: number
  min_qty: number
  unit_price: number
  incoming: number
  location: string | null
  memo: string | null
  updated_at: string
}

export interface PurchaseHistory {
  id: string
  inventory_id: string | null
  code: string | null
  date: string
  qty: number
  unit_price: number
  partner: string | null
  doc_no: string | null
}

// 일용직 근무기록 (현장 작업자)
export interface LaborWorker {
  id: string
  name: string
  day_rate: number
  phone: string | null
  active: boolean
}
export interface LaborAttendance {
  id: string
  worker_id: string
  work_date: string
  check_in: string | null // 'HH:MM:SS'
  check_out: string | null
  next_day: boolean
  break_min: number
  project_id: string | null
  place: string | null
}
