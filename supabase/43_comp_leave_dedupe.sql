-- 43. 휴가신청의 '대체휴무'를 연장근무 잔여와 연결 — 휴가 기록 중복 방지 · 멱등
-- 휴가신청(휴가원)에서 휴가 종류를 대체휴무/대체반차로 올리면
--   · comp_time(사용)이 함께 만들어져 잔여에서 차감되고
--   · 일정표·휴가현황 기록(leave_records)은 휴가원 승인 트리거가 한 번만 만든다.

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
    if v_type like '대체반차%' then v_type := '대체반차';
    elsif v_type like '반차%' then v_type := '반차';
    end if;
    insert into public.leave_records (employee_id, leave_type, status, start_date, end_date, days, reason, approver, approved_at, approval_id)
    values (new.drafter_id, coalesce(v_type, '연차'), '승인', v_start, coalesce(v_end, v_start), v_days,
            substring(new.memo from E'■ 휴가 사유\n([^\n]+)'), '전자결재 ' || coalesce(new.doc_no, ''), now(), new.id);
  elsif old.status = '승인' and new.status is distinct from '승인' then
    delete from public.leave_records where approval_id = new.id;
  end if;
  return new;
end $$;

create or replace function public.comp_time_leave() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.kind = '사용' and new.status = '승인' and old.status is distinct from '승인' then
    -- 휴가원(전자결재)과 연결된 사용은 휴가원 승인 트리거가 기록을 만든다 → 중복 방지
    if exists (select 1 from public.approvals a where a.id = new.approval_id and coalesce(a.memo, '') like '[양식:휴가원]%') then
      return new;
    end if;
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

notify pgrst, 'reload schema';
