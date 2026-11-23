-- 36. 휴가원(전자결재 양식) 승인 시 휴가 기록(leave_records) 자동 생성 — 멱등
-- 일정표·휴가현황에 표시되고 연차 사용 일수에 반영된다. 승인이 취소되면 기록도 삭제.
alter table public.leave_records add column if not exists approval_id uuid references public.approvals(id) on delete cascade;

create or replace function public.leave_from_approval() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_type text; v_start date; v_end date; v_days numeric;
begin
  if new.kind <> '휴가' or coalesce(new.memo, '') not like '[양식:휴가원]%' then
    return new;
  end if;
  if new.status = '승인' and old.status is distinct from '승인' then
    v_type  := substring(new.memo from '휴가 종류: ([^\n]+)');
    v_start := substring(new.memo from '기간: ([0-9]{4}-[0-9]{2}-[0-9]{2})')::date;
    v_end   := substring(new.memo from '~ ([0-9]{4}-[0-9]{2}-[0-9]{2})')::date;
    v_days  := coalesce(substring(new.memo from '일수: ([0-9.]+)')::numeric, 1);
    if v_type like '반차%' then v_type := '반차'; end if;
    insert into public.leave_records (employee_id, leave_type, status, start_date, end_date, days, reason, approver, approved_at, approval_id)
    values (new.drafter_id, coalesce(v_type, '연차'), '승인', v_start, coalesce(v_end, v_start), v_days,
            substring(new.memo from E'■ 휴가 사유\n([^\n]+)'), '전자결재 ' || coalesce(new.doc_no, ''), now(), new.id);
  elsif old.status = '승인' and new.status is distinct from '승인' then
    delete from public.leave_records where approval_id = new.id;
  end if;
  return new;
end $$;
drop trigger if exists trg_leave_from_approval on public.approvals;
create trigger trg_leave_from_approval after update of status on public.approvals
  for each row execute function public.leave_from_approval();

notify pgrst, 'reload schema';
