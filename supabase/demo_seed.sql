-- =====================================================================
-- 곳간 — 데모 데이터 (선택)
-- 화면을 숫자로 채워 확인하고 싶을 때 실행. (schema→rls→seed 다음)
-- 실제 운영 데이터가 아니라 시안과 동일한 샘플입니다. 나중에 지워도 됩니다.
-- 멱등은 아니므로 한 번만 실행하세요.
-- =====================================================================

-- 미술 사업 (시안 ART_PROJECTS)
insert into public.art_projects (name, client, biz_code, proj_type, kind, status, progress, now_text, contract_base, due_date, done_date, year) values
  ('삼국유사 목판 보존처리', '국립경주박물관', '법인', '서화', '입찰', '진행', 61, '설계 진행 중', 220000000, '2026-12-20', null, 2026),
  ('석조여래좌상 균열 보수', '문화재청', '법인', '조형', '발주', '진행', 30, '기초조사 중', 180000000, '2027-02-28', null, 2026),
  ('고건축 단청 복원 설계', '종로구청', '법인', '건축', '입찰', '완료', 100, '준공 완료', 90000000, '2026-09-30', '2026-09-25', 2026),
  ('목조불감 채색 복원', '조계종 성보박물관', '법인', '서화', '발주', '예정', 0, '착공 준비', 120000000, '2027-05-31', null, 2026),
  ('사찰 벽화 모사도 제작', '○○시청', '법인', '서화', '입찰', '공고/입찰', 0, '입찰 참여', 0, null, null, 2026),
  ('석탑 부재 세척 용역', '국가유산청', '법인', '조형', '발주', '탈락/보류', 0, '탈락', 0, null, null, 2026),
  ('봉정사 벽화 보존처리', '문화재청', '법인', '서화', '입찰', '완료', 100, '준공 완료', 155000000, '2025-11-30', '2025-11-20', 2025),
  ('백자 복원 용역', '국립중앙박물관', '법인', '조형', '발주', '완료', 100, '준공 완료', 68000000, '2025-08-31', '2025-08-25', 2025);

-- 삼국유사 예산 + 수금 + 설계변경 (상세 화면용)
do $$
declare v_proj uuid;
begin
  select id into v_proj from public.art_projects where name='삼국유사 목판 보존처리';
  insert into public.art_budget (project_id, item, alloc, sort) values
    (v_proj,'재료비',30000000,1),(v_proj,'노무비',40000000,2),(v_proj,'경비',10000000,3),
    (v_proj,'외주가공비',50000000,4),(v_proj,'이윤',20000000,5),(v_proj,'보존처리계획',5000000,6),(v_proj,'자문회비',3000000,7);
  insert into public.budget_receipts (project_id, kind, date, amount) values
    (v_proj,'선금','2026-03-20',60000000),(v_proj,'기성','2026-07-10',20000000);
  insert into public.budget_changes (project_id, date, type, memo, after_amount) values
    (v_proj,'2026-07-05','증액','균열 범위 확대로 수량 증가',240000000);
  insert into public.advisors (project_id, name, org, phone, default_fee, sort) values
    (v_proj,'박○○ 교수','○○대 미술사학과','010-****-4444',300000,1),
    (v_proj,'이○○ 관장','전통회화연구원','010-****-5555',300000,2),
    (v_proj,'최○○ 위원','문화재위원회','010-****-6666',300000,3);
end $$;

-- 전표 (시안 ACCT_TX — 2026 + 2025 전년비교)
insert into public.acct_tx (date, biz_code, dept_key, tx_type, account, amount, partner, memo, project_id, budget_item, src, year)
  select cast(date as date), biz, dept, tx_type, account, amount, partner, memo,
         (select id from public.art_projects where name=proj_name), budget, src,
         cast(substr(date,1,4) as int)
  from (values
   ('2026-03-20','법인','art','수입','용역매출',60000000,'국립경주박물관','삼국유사 목판 선금','삼국유사 목판 보존처리',null,'대금수령'),
   ('2026-07-10','법인','art','수입','용역매출',20000000,'국립경주박물관','삼국유사 목판 기성','삼국유사 목판 보존처리',null,'대금수령'),
   ('2026-10-25','법인','art','지출','외주용역비',8500000,'한국미술복원','목판 복원 외주 1차','삼국유사 목판 보존처리','외주가공비','결의서'),
   ('2026-10-18','법인','art','지출','재료비',1200000,'한국미술재료상사','안료 구매','삼국유사 목판 보존처리','재료비','카드'),
   ('2026-10-14','법인','art','지출','재료비',800000,'북촌지류','한지 구매','석조여래좌상 균열 보수','재료비','카드'),
   ('2026-10-05','법인','management','지출','급여',31728400,'','2026-10 급여',null,null,'결의서'),
   ('2026-10-20','법인','management','지출','4대보험료',2840000,'국민건강보험공단','10월 4대보험',null,null,'결의서'),
   ('2026-10-02','법인','management','지출','임차료',1800000,'(주)종로빌딩','사무실 임차료',null,null,'결의서'),
   ('2026-10-11','법인','management','지출','차량유지비',720000,'GS칼텍스','업무용 차량 주유',null,null,'카드'),
   ('2026-08-30','법인','management','수입','이자수입',120000,'기업은행','예금 이자',null,null,'직접'),
   ('2026-10-24','개인','product','수입','상품매출',3400000,'온라인몰','기념품 판매',null,null,'직접'),
   ('2026-10-26','개인','product','지출','재료비',1500000,'대한인쇄','엽서 인쇄',null,null,'카드'),
   ('2026-10-15','개인','education','수입','수수료수입',2800000,'수강생','전문반 수강료',null,null,'직접'),
   ('2026-10-08','개인','experience','수입','수수료수입',900000,'단체','단청 체험',null,null,'직접'),
   ('2026-10-12','더북촌','management','수입','기타수익',500000,'후원','후원금',null,null,'직접'),
   ('2025-04-15','법인','art','수입','용역매출',85000000,'문화재청','봉정사 벽화 보존 선금','봉정사 벽화 보존처리',null,'대금수령'),
   ('2025-09-20','법인','art','수입','용역매출',70000000,'문화재청','봉정사 벽화 기성','봉정사 벽화 보존처리',null,'대금수령'),
   ('2025-05-10','법인','art','지출','외주용역비',22000000,'한국미술복원','벽화 보존 외주','봉정사 벽화 보존처리','외주가공비','결의서'),
   ('2025-06-18','법인','art','지출','재료비',9500000,'한국미술재료상사','안료·재료','봉정사 벽화 보존처리','재료비','카드'),
   ('2025-03-05','법인','management','지출','급여',142000000,'','2025 상반기 급여 누계',null,null,'결의서'),
   ('2025-09-05','법인','management','지출','급여',148000000,'','2025 하반기 급여 누계',null,null,'결의서'),
   ('2025-07-02','법인','management','지출','임차료',21600000,'(주)종로빌딩','2025 임차료 연간',null,null,'결의서'),
   ('2025-11-24','개인','product','수입','상품매출',38000000,'온라인몰','2025 기념품 매출 누계',null,null,'직접'),
   ('2025-12-20','개인','education','수입','수수료수입',31000000,'수강생','2025 교육 수강료 누계',null,null,'직접'),
   ('2025-08-08','개인','experience','수입','수수료수입',9500000,'단체','2025 체험 수익 누계',null,null,'직접'),
   ('2025-06-30','개인','product','지출','재료비',12500000,'대한인쇄','2025 상품 재료 누계',null,null,'카드'),
   ('2025-10-15','더북촌','management','수입','기타수익',4200000,'후원','2025 후원금 누계',null,null,'직접')
  ) as t(date, biz, dept, tx_type, account, amount, partner, memo, proj_name, budget, src);

-- 법인카드 미처리 (시안 ACCT_CARDS 일부)
insert into public.acct_cards (date, card, bank, shop, amount, account, memo, matched) values
  ('2026-10-11','법인카드','신한','GS칼텍스 종로주유소',72000,'차량유지비','업무용 주유',false),
  ('2026-10-12','법인카드','신한','스타벅스 안국점',38000,'복리후생비','회의 간식',false);

-- 9월 급여대장 + 명세 (전월 복사 데모용). 10월은 '전월 급여 복사' 버튼으로 생성.
insert into public.payroll_runs (ym, status) values ('2026-09','지급완료');
insert into public.payslips (run_id, employee_id, base_pay, allowances, d_pension, d_health, d_income_tax)
  select (select id from public.payroll_runs where ym='2026-09'), e.id,
     case e.title when '대표' then 5000000 when '실장' then 4200000 when '팀장' then 3800000 else 2800000 end,
     300000, 160000, 130000, 95000
  from public.employees e where e.status='재직';

-- 연차 기록 (데모)
insert into public.leave_records (employee_id, leave_type, status, start_date, end_date, days, granted)
  select e.id, '연차', '승인', '2026-09-15','2026-09-15', 1, 15 from public.employees e where e.name in ('이윤정','김성헌','나지예');
insert into public.leave_records (employee_id, leave_type, status, start_date, end_date, days)
  select e.id, '반차', '승인', '2026-10-10','2026-10-10', 0.5 from public.employees e where e.name='이윤정';

-- 업무현황 데모 (영역별)
insert into public.work_tasks (area, title, dept, detail, owner_id, reg_date, start_date, due_date, status, src)
  select v.area, v.title, v.dept, v.detail,
    (select id from public.employees where name=v.owner), v.reg::date, v.start::date, v.due::date, v.status, v.src
  from (values
   ('management','10월 급여 대장 검토','경영','노무','이윤정','2026-10-20','2026-10-28','2026-10-29','prog',null),
   ('management','4대보험 정산 자료 정리','경영','노무','이윤정','2026-10-18','2026-10-25','2026-11-01','plan',null),
   ('management','3분기 회계 결산','경영','회계','이윤정','2026-10-05','2026-10-10','2026-10-22','done',null),
   ('art','삼국유사 목판 보존처리 3차','미술','작업','김성헌','2026-10-10','2026-10-14','2026-10-28','prog','사업: 삼국유사 목판'),
   ('art','문화재 조사보고서 납품','미술','조사','나지예','2026-10-08','2026-10-20','2026-11-08','done','사업: 석조여래좌상'),
   ('art','보존처리 설계도면 작성','미술','설계','김성헌','2026-10-22','2026-11-01','2026-11-15','plan',null),
   ('product','기념 엽서 세트 재입고 발주','상품',null,'이규리','2026-10-24','2026-10-26','2026-10-30','prog',null),
   ('promotion','삼국유사 목판 복원 과정 연재','홍보','채널','김유미','2026-10-01','2026-10-01','2026-10-31','prog','홍보: 인스타그램')
  ) as v(area,title,dept,detail,owner,reg,start,due,status,src);

-- 문서보관 데모
insert into public.documents (title, category, owner_id, share_scope)
  select v.title, v.cat, (select id from public.employees where name=v.owner), v.scope
  from (values
   ('2026 보존처리 표준계약서(양식)','계약','이윤정','전사'),
   ('삼국유사 목판 착수보고서','보고서','김성헌','선택'),
   ('직원 복무규정 2026','규정','이윤정','전사'),
   ('10월 지출결의 모음','회계','이윤정','개인')
  ) as v(title,cat,owner,scope);

-- 상품 재고 데모 (시안 INVENTORY)
insert into public.inventory (code, category, name, stock, min_qty, unit_price, incoming, location) values
  ('BK-001','완제품','도록 《북촌의 불교미술》',42,10,18000,0,'수장고 A-1'),
  ('BK-014','완제품','기념 엽서 세트',6,20,3500,0,'사무실 선반'),
  ('BK-023','완제품','단청 문양 노트',15,15,6000,0,'수장고 A-2'),
  ('MT-005','부자재','한지 (전통 보존용)',8,30,12000,0,'자재창고'),
  ('MT-011','부자재','천연 안료 세트',24,10,45000,0,'자재창고'),
  ('BK-030','완제품','불화 엽서집',3,12,5000,0,'사무실 선반');

-- 매입 이력 데모
insert into public.purchase_history (inventory_id, code, date, qty, unit_price, partner, doc_no)
  select i.id, i.code, cast(d.date as date), d.qty, d.price, d.partner, d.docno
  from (values
   ('BK-001','2026-08-15',50,17000,'대한인쇄','제2026-0088호'),
   ('BK-001','2026-10-02',30,18000,'대한인쇄','제2026-0121호'),
   ('MT-005','2026-09-10',40,11500,'북촌지류','제2026-0105호'),
   ('MT-011','2026-07-20',20,44000,'한국미술재료상사','제2026-0071호')
  ) as d(code,date,qty,price,partner,docno)
  join public.inventory i on i.code = d.code;
