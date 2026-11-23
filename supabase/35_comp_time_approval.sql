-- 35. 연장근무·대체휴무를 전자결재와 연결 — 멱등
-- 신청하면 전자결재(휴가신청)로 올라가고, 승인자가 결재대기에서 승인/반려하면 자동 반영.
-- 승인된 대체휴무 사용은 휴가 기록(leave_records)에도 들어가 일정표·휴가현황에 표시된다.
alter table public.comp_time add column if not exists approval_id uuid references public.approvals(id) on delete cascade;
create index if not exists comp_time_appr_doc_idx on public.comp_time(approval_id);
alter table public.leave_records add column if not exists comp_time_id uuid references public.comp_time(id) on delete cascade;

-- 결재 상태 → 신청 상태 동기화 (회수하면 신청 자체를 삭제)
create or replace function public.comp_time_sync() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status then
    if new.status = '회수' then
      delete from public.comp_time where approval_id = new.id;
    else
      update public.comp_time
         set status = case new.status when '승인' then '승인' when '반려' then '반려' else '신청' end,
             decided_at = case when new.status in ('승인','반려') then now() else null end
       where approval_id = new.id;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_comp_time_sync on public.approvals;
create trigger trg_comp_time_sync after update of status on public.approvals
  for each row execute function public.comp_time_sync();

-- 승인된 '사용' → 휴가 기록 생성 (일정표 표시), 승인 취소되면 삭제
create or replace function public.comp_time_leave() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.kind = '사용' and new.status = '승인' and old.status is distinct from '승인' then
    insert into public.leave_records (employee_id, leave_type, status, start_date, end_date, days, reason, approver, approved_at, comp_time_id)
    values (new.employee_id,
            case when new.hours >= 8 then '대체휴무' else '대체반차' end,
            '승인', new.work_date, new.work_date, round(new.hours / 8.0, 3),
            coalesce(nullif(new.reason, ''), '대체휴무') || ' (' || new.hours || '시간)',
            (select name from public.employees where id = new.approver_id), now(), new.id);
  elsif old.status = '승인' and new.status is distinct from '승인' then
    delete from public.leave_records where comp_time_id = new.id;
  end if;
  return new;
end $$;
drop trigger if exists trg_comp_time_leave on public.comp_time;
create trigger trg_comp_time_leave after update of status on public.comp_time
  for each row execute function public.comp_time_leave();

notify pgrst, 'reload schema';
