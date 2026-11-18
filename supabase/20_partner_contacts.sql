-- 20. 관계자·자문위원 ↔ 업체정보(partners) 연동
--  · 사업 상세에서 관계자/자문위원을 저장하면 업체정보에 자동 등록(중복은 갱신)
--  · 관계자/자문위원 입력 시 업체정보에서 검색해 불러오기
--  · partners 는 회계담당·관리자만 접근 가능하므로, 일반 직원은 아래 RPC(SECURITY DEFINER)로만 사용
-- Supabase SQL Editor 에서 실행하세요. (멱등)
begin;

-- 구분(관계자 구분/자문위원) 보관을 위해 kind 는 기존 컬럼 사용. 별도 컬럼 없음.

-- 1) 검색: 업체명·담당자·연락처·이메일 부분일치
create or replace function public.partner_search(p_q text)
returns table (id uuid, name text, person text, title text, kind text, phone1 text, email text)
language sql stable security definer set search_path = public as $$
  select p.id, p.name, p.person, p.title, p.kind, p.phone1, p.email
  from public.partners p
  where public.app_is_active_employee()
    and length(trim(coalesce(p_q, ''))) > 0
    and (
      p.name   ilike '%' || trim(p_q) || '%' or
      p.person ilike '%' || trim(p_q) || '%' or
      p.phone1 ilike '%' || trim(p_q) || '%' or
      p.email  ilike '%' || trim(p_q) || '%'
    )
  order by p.name, p.person
  limit 12
$$;

-- 2) 등록/갱신: 같은 (업체명, 담당자)가 있으면 비어있지 않은 값만 갱신, 없으면 신규
create or replace function public.partner_upsert_contact(
  p_org text, p_person text, p_kind text, p_phone text, p_email text, p_title text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_name   text := nullif(trim(coalesce(p_org, '')), '');
  v_person text := nullif(trim(coalesce(p_person, '')), '');
  v_id uuid;
begin
  if not public.app_is_active_employee() then
    raise exception '권한이 없습니다';
  end if;
  if v_person is null and v_name is null then
    return null;
  end if;
  v_name := coalesce(v_name, v_person);      -- 소속이 없으면 이름을 업체명으로

  select id into v_id from public.partners
   where lower(trim(name)) = lower(v_name)
     and lower(trim(coalesce(person, ''))) = lower(coalesce(v_person, ''))
   limit 1;

  if v_id is null then
    insert into public.partners (name, person, title, kind, phone1, email)
    values (v_name, v_person, nullif(trim(coalesce(p_title,'')), ''), nullif(trim(coalesce(p_kind,'')), ''),
            nullif(trim(coalesce(p_phone,'')), ''), nullif(trim(coalesce(p_email,'')), ''))
    returning id into v_id;
  else
    update public.partners set
      phone1 = coalesce(nullif(trim(coalesce(p_phone,'')), ''), phone1),
      email  = coalesce(nullif(trim(coalesce(p_email,'')), ''), email),
      title  = coalesce(nullif(trim(coalesce(p_title,'')), ''), title),
      kind   = coalesce(kind, nullif(trim(coalesce(p_kind,'')), ''))
    where id = v_id;
  end if;
  return v_id;
end $$;

grant execute on function public.partner_search(text) to authenticated;
grant execute on function public.partner_upsert_contact(text, text, text, text, text, text) to authenticated;

-- 3) 이미 입력된 관계자·자문위원을 업체정보로 일괄 등록 (중복 제외)
insert into public.partners (name, person, kind, phone1, email)
select distinct on (lower(coalesce(nullif(trim(s.org),''), trim(s.name))), lower(trim(s.name)))
       coalesce(nullif(trim(s.org),''), trim(s.name)), trim(s.name), s.kind,
       nullif(trim(s.phone),''), nullif(trim(s.email),'')
from public.art_stakeholders s
where trim(coalesce(s.name,'')) <> ''
  and not exists (
    select 1 from public.partners p
    where lower(trim(p.name)) = lower(coalesce(nullif(trim(s.org),''), trim(s.name)))
      and lower(trim(coalesce(p.person,''))) = lower(trim(s.name)));

insert into public.partners (name, person, kind, phone1, email)
select distinct on (lower(coalesce(nullif(trim(a.org),''), trim(a.name))), lower(trim(a.name)))
       coalesce(nullif(trim(a.org),''), trim(a.name)), trim(a.name), '자문위원',
       nullif(trim(a.phone),''), nullif(trim(a.email),'')
from public.advisors a
where trim(coalesce(a.name,'')) <> ''
  and not exists (
    select 1 from public.partners p
    where lower(trim(p.name)) = lower(coalesce(nullif(trim(a.org),''), trim(a.name)))
      and lower(trim(coalesce(p.person,''))) = lower(trim(a.name)));

commit;

-- API(PostgREST)가 새 함수를 바로 인식하도록 스키마 캐시 갱신
notify pgrst, 'reload schema';
