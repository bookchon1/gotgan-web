-- 27. 테스트용: '보존처리 재료 및 촬영 소모품 구입 품의' 접수를 취소하고 회계 접수 대기로 되돌림
begin;

delete from public.acct_tx
where src = '결의서'
  and memo like '보존처리 재료 및 촬영 소모품 구입 품의%';

update public.approval_lines
set decided = '대기', decided_at = null
where role = '회계접수'
  and approval_id in (select id from public.approvals where kind = '품의' and title = '보존처리 재료 및 촬영 소모품 구입 품의');

update public.approvals
set status = '승인'
where kind = '품의' and title = '보존처리 재료 및 촬영 소모품 구입 품의' and status = '회계접수';

commit;
notify pgrst, 'reload schema';
