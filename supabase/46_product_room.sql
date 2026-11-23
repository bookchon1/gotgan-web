-- 상품실 재고·판매 관리 (판매상품 / 부자재 / 구성표 / 판매기록 / 스토어 등록)
-- 여러 번 실행해도 안전합니다.

-- 1) 품목 테이블(inventory) 확장
alter table public.inventory add column if not exists item_id     text;           -- 품목ID (S-0001 / M-0001)
alter table public.inventory add column if not exists major       text;           -- 대분류 (판매상품)
alter table public.inventory add column if not exists minor       text;           -- 소분류 (판매상품)
alter table public.inventory add column if not exists mat_type    text;           -- 부자재 종류
alter table public.inventory add column if not exists option_spec text;           -- 옵션·규격
alter table public.inventory add column if not exists stock_form  text;           -- 재고 형태
alter table public.inventory add column if not exists prep_status text;           -- 상품 준비 상태
alter table public.inventory add column if not exists unit        text;           -- 단위
alter table public.inventory add column if not exists used_qty    int not null default 0;  -- 기존 판매·사용(출고) 수량
alter table public.inventory add column if not exists sell_price  bigint not null default 0; -- 판매가
alter table public.inventory add column if not exists store_status text;          -- 스토어 등록상태(등록 완료/등록 준비/미등록)
alter table public.inventory add column if not exists store_url   text;
alter table public.inventory add column if not exists usage_note  text;           -- 부자재 사용처·관련상품
alter table public.inventory add column if not exists image_path  text;           -- 이미지(Storage 경로)
create unique index if not exists inventory_item_id_uq on public.inventory(item_id);
create index if not exists inventory_category_idx on public.inventory(category);

-- 2) 판매 기록 (입력하면 판매상품 가용재고에서 자동 차감)
create table if not exists public.product_sales (
  id           uuid primary key default gen_random_uuid(),
  sold_at      date not null default current_date,
  channel      text,                                   -- 판매채널
  inventory_id uuid references public.inventory(id) on delete set null,
  qty          int  not null check (qty > 0),
  unit_price   bigint not null default 0,
  order_no     text,
  memo         text,
  created_by   uuid,
  created_at   timestamptz not null default now()
);
create index if not exists product_sales_inv_idx  on public.product_sales(inventory_id);
create index if not exists product_sales_date_idx on public.product_sales(sold_at desc);

-- 3) 상품별 구성표 (BOM)
create table if not exists public.product_bom (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.inventory(id) on delete cascade,
  material_id uuid not null references public.inventory(id) on delete cascade,
  qty_per     numeric not null default 1 check (qty_per >= 0),   -- 상품 1개당 소요량
  memo        text,
  sort        int not null default 0,
  created_at  timestamptz not null default now(),
  unique (product_id, material_id)
);
create index if not exists product_bom_product_idx on public.product_bom(product_id);

-- 4) 스토어 등록 준비
create table if not exists public.store_listings (
  inventory_id uuid primary key references public.inventory(id) on delete cascade,
  store_category text,
  display_name   text,      -- 노출용 상품명
  keywords       text,      -- 검색 키워드
  summary        text,      -- 상품 요약
  detail         text,      -- 상세 설명
  main_image     text,      -- 대표 이미지(Storage 경로)
  detail_images  text,      -- 상세 이미지(줄바꿈 구분)
  shipping       text,      -- 배송방법·배송비
  registered_on  date,
  check_note     text,      -- 수정·확인사항
  updated_at     timestamptz not null default now()
);

-- 5) 가용재고 뷰 = 기준재고 + 입고예정 − 기존 판매·사용 − 새 판매 기록
create or replace view public.inventory_v with (security_invoker = on) as
select i.*,
       coalesce(s.sold, 0)::int as sold_qty,
       (i.stock + i.incoming - i.used_qty - coalesce(s.sold, 0))::int as avail
from public.inventory i
left join (select inventory_id, sum(qty) as sold from public.product_sales group by inventory_id) s
  on s.inventory_id = i.id;

-- 6) 권한: 재직자 조회, 변경은 관리자
alter table public.product_sales   enable row level security;
alter table public.product_bom     enable row level security;
alter table public.store_listings  enable row level security;
do $$ begin
  drop policy if exists psl_read on public.product_sales;
  create policy psl_read on public.product_sales for select to authenticated using (public.app_is_active_employee());
  drop policy if exists psl_write on public.product_sales;
  create policy psl_write on public.product_sales for all to authenticated using (public.app_is_admin()) with check (public.app_is_admin());

  drop policy if exists bom_read on public.product_bom;
  create policy bom_read on public.product_bom for select to authenticated using (public.app_is_active_employee());
  drop policy if exists bom_write on public.product_bom;
  create policy bom_write on public.product_bom for all to authenticated using (public.app_is_admin()) with check (public.app_is_admin());

  drop policy if exists stl_read on public.store_listings;
  create policy stl_read on public.store_listings for select to authenticated using (public.app_is_active_employee());
  drop policy if exists stl_write on public.store_listings;
  create policy stl_write on public.store_listings for all to authenticated using (public.app_is_admin()) with check (public.app_is_admin());
end $$;

-- 7) 상품·자재 이미지 저장소 (공개 읽기, 업로드는 관리자)
insert into storage.buckets (id, name, public) values ('product-images', 'product-images', true)
on conflict (id) do nothing;
drop policy if exists pimg_ins on storage.objects;
create policy pimg_ins on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images' and public.app_is_admin());
drop policy if exists pimg_del on storage.objects;
create policy pimg_del on storage.objects for delete to authenticated
  using (bucket_id = 'product-images' and public.app_is_admin());

notify pgrst, 'reload schema';
