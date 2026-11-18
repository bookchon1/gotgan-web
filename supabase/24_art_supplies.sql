-- 24. 미술 재고관리 (보존처리 재료·소모품) — 품목, 입출고 이력
-- Supabase SQL Editor 에서 실행하세요. (멱등)
begin;

create table if not exists public.art_supplies (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  category    text,                       -- 약품·용제 / 지류·한지 / 접착제·풀 / 안료·채색 / 도구·장비 / 소모품 / 기타
  spec        text,                       -- 규격
  unit        text not null default '개',
  stock       int  not null default 0,    -- 현재고
  min_qty     int  not null default 0,    -- 적정(최소) 재고 — 이 미만이면 부족
  unit_price  bigint not null default 0,  -- 최근 매입 단가
  incoming    int  not null default 0,    -- 입고 예정(품의 상신분)
  location    text,                       -- 보관 위치
  memo        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.art_supply_moves (
  id          uuid primary key default gen_random_uuid(),
  supply_id   uuid not null references public.art_supplies(id) on delete cascade,
  kind        text not null check (kind in ('입고','출고','발주')),
  qty         int  not null,
  balance     int,                        -- 처리 후 재고
  memo        text,
  approval_id uuid,                       -- 발주(품의) 건이면 전자결재 문서
  by_id       uuid,
  created_at  timestamptz not null default now()
);
create index if not exists art_supply_moves_supply_idx on public.art_supply_moves(supply_id, created_at desc);

alter table public.art_supplies enable row level security;
alter table public.art_supply_moves enable row level security;
do $$ begin
  drop policy if exists art_supplies_all on public.art_supplies;
  create policy art_supplies_all on public.art_supplies for all to authenticated
    using (public.app_is_active_employee()) with check (public.app_is_active_employee());
  drop policy if exists art_supply_moves_all on public.art_supply_moves;
  create policy art_supply_moves_all on public.art_supply_moves for all to authenticated
    using (public.app_is_active_employee()) with check (public.app_is_active_employee());
end $$;

commit;
notify pgrst, 'reload schema';
