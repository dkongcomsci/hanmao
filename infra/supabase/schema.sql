-- ============================================================
-- หารเมา (hanmao) — schema สำหรับ group mode (multi-user real-time)
-- ไฟล์นี้คือ "ภาพรวมล่าสุด" สำหรับ project ใหม่ — รันครั้งเดียวตอนตั้ง project
-- project ที่มีข้อมูลอยู่แล้วให้รัน patch-NNN-*.sql ตามลำดับแทน (ดู patch-005 ล่าสุด)
-- ทั้งไฟล์ idempotent — รันซ้ำได้
-- ============================================================

-- ---------- ตาราง ----------

-- วง (กลุ่มหารเงินหนึ่งครั้ง) — invite_code ใช้ในลิงก์/QR
create table if not exists public.groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null default 'วงใหม่',
  invite_code text not null unique,
  venue       jsonb,                          -- { lat, lng, radiusM } | null
  settlements jsonb not null default '[]',    -- string[] รายการโอนที่ติ๊ก "โอนแล้ว" (`${fromId}>${toId}@ยอด`)
  -- ผู้สร้างวง (host) — มีสิทธิ์ลบวงทั้งวงคนเดียว; default auth.uid() → client ไม่ต้องส่งมา
  created_by  uuid default auth.uid() references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- ใครเป็นสมาชิก (auth) ของวงไหน — ใช้เป็นฐานของ RLS
create table if not exists public.group_participants (
  group_id  uuid not null references public.groups(id) on delete cascade,
  -- default auth.uid() → client insert แค่ group_id ได้ (ไม่ต้องส่ง user_id เอง)
  user_id   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

-- สมาชิกในวง (คนที่ร่วมหาร — ไม่จำเป็นต้องมี auth 1:1; host สร้างเผื่อได้)
create table if not exists public.members (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.groups(id) on delete cascade,
  name       text not null,
  consumes   text not null default 'both',    -- 'both' | 'food' | 'drink'
  arrived_at bigint,                           -- epoch ms | null
  left_at    bigint,                           -- epoch ms | null
  user_id    uuid references auth.users(id) on delete set null,  -- device/บัญชีที่ claim (nullable)
  prompt_pay text,                             -- พร้อมเพย์ (เบอร์ 10 หลัก / บัตร ปชช. 13 หลัก) | null
  created_at timestamptz not null default now()
);

-- บิล
create table if not exists public.bills (
  id                 uuid primary key default gen_random_uuid(),
  group_id           uuid not null references public.groups(id) on delete cascade,
  name               text not null,
  category           text not null default 'food',   -- 'food' | 'drink' | 'mixed'
  split_mode         text not null default 'equal',  -- 'equal' | 'itemized' | 'time'
  member_ids         jsonb not null default '[]',    -- string[] (ว่าง = ทุกคนที่เข้าเงื่อนไข)
  -- คนออกเงินบิลนี้ (แต่ละบิลอาจคนละคน); FK กัน "คนจ่ายผี" ค้างเมื่อ member ถูกลบ
  paid_by_id         uuid references public.members(id) on delete set null,
  is_treat           boolean not null default false,  -- คนจ่ายเลี้ยง = รับผิดชอบยอดเต็ม
  discount           numeric not null default 0,
  service_charge_pct numeric not null default 0,
  vat_pct            numeric not null default 0,
  created_at_ms      bigint not null,                 -- createdAt เดิม (epoch ms) — ใช้ในโหมด time
  created_at         timestamptz not null default now()
);

-- เมนูในบิล
create table if not exists public.bill_items (
  id              uuid primary key default gen_random_uuid(),
  bill_id         uuid not null references public.bills(id) on delete cascade,
  group_id        uuid not null references public.groups(id) on delete cascade,  -- denormalize เพื่อ RLS ง่าย
  name            text not null,
  price           numeric not null default 0,
  participant_ids jsonb not null default '[]',        -- string[] (ว่าง = ทุกคนในบิล)
  created_at      timestamptz not null default now()
);

create index if not exists idx_members_group    on public.members(group_id);
create index if not exists idx_bills_group       on public.bills(group_id);
create index if not exists idx_bill_items_group  on public.bill_items(group_id);
create index if not exists idx_bill_items_bill   on public.bill_items(bill_id);

-- index ตามลำดับที่แอป query จริง: where group_id = ? order by <เวลา>, id
-- แอปต้องเรียงแบบนิ่ง (deterministic) เสมอ เพราะลำดับสมาชิกมีผลถึงการเกลี่ยเศษสตางค์
-- (largest remainder ใน split.ts) — ถ้าลำดับต่างกันระหว่างเครื่อง คู่โอน/transferKey จะไม่ตรงกัน
-- `id` เป็น tiebreak ชั้นสองเพราะคอลัมน์เวลาซ้ำกันได้ (default now() คงที่ทั้งทรานแซกชัน
-- → insert หลายแถวในคำสั่งเดียวได้เวลาเท่ากันหมด)
create index if not exists idx_members_group_created     on public.members(group_id, created_at, id);
create index if not exists idx_bills_group_created       on public.bills(group_id, created_at_ms, id);
create index if not exists idx_bill_items_group_created  on public.bill_items(group_id, created_at, id);

-- ---------- Row Level Security ----------
-- หลักการ: user เห็น/แก้ได้เฉพาะข้อมูลของวงที่ตัวเองเป็น participant
-- ทางเข้าวงมีทางเดียวคือ RPC join_group(code) — รู้ uuid ของวงเฉย ๆ เข้าไม่ได้

alter table public.groups             enable row level security;
alter table public.group_participants enable row level security;
alter table public.members            enable row level security;
alter table public.bills              enable row level security;
alter table public.bill_items         enable row level security;

-- helper: uid นี้เป็น participant ของ group นี้ไหม (security definer เลี่ยง recursion บน RLS)
create or replace function public.is_group_member(gid uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.group_participants
    where group_id = gid and user_id = auth.uid()
  );
$$;

-- helper: uid นี้เป็นผู้สร้างวงนี้ไหม (สิทธิ์ลบวง + insert participant ตรงตอนสร้าง)
create or replace function public.is_group_creator(gid uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.groups
    where id = gid and created_by = auth.uid()
  );
$$;

-- groups: สร้างวงได้ถ้าล็อกอินแล้ว และต้องตั้งตัวเองเป็นผู้สร้าง
-- (host ยังไม่เป็น participant ตอน insert — chicken&egg)
-- อ่าน/แก้ = สมาชิกของวง; ลบวงทั้งวง = ผู้สร้างเท่านั้น
drop policy if exists groups_member_all on public.groups;
drop policy if exists groups_insert on public.groups;
create policy groups_insert on public.groups
  for insert with check (auth.uid() is not null and created_by = auth.uid());
drop policy if exists groups_select on public.groups;
create policy groups_select on public.groups
  for select using (public.is_group_member(id));
drop policy if exists groups_update on public.groups;
create policy groups_update on public.groups
  for update using (public.is_group_member(id)) with check (public.is_group_member(id));
drop policy if exists groups_delete on public.groups;
create policy groups_delete on public.groups
  for delete using (created_by = auth.uid());

-- policy ของ update เห็นแค่แถวใหม่ (เทียบกับค่าเดิมไม่ได้) → ใช้ trigger กันสมาชิก
-- ตั้งตัวเองเป็นผู้สร้าง (แล้วลบวงได้) หรือเปลี่ยนโค้ดเชิญของวง
create or replace function public.groups_guard_immutable()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- ไม่มี JWT (รันจาก SQL Editor / service_role / migration) → ข้าม guard
  if auth.uid() is null then
    return new;
  end if;
  -- ข้อยกเว้นเดียว: วงกำพร้า (created_by null เพราะบัญชี host ถูกลบ) — สมาชิกรับเป็น host ต่อได้
  -- ไม่งั้นวงจะลบไม่ได้ตลอดกาล; ต้องตั้งเป็นตัวเองเท่านั้น
  if new.created_by is distinct from old.created_by
     and not (old.created_by is null and new.created_by = auth.uid()) then
    raise exception 'ห้ามเปลี่ยนผู้สร้างวง';
  end if;
  if new.invite_code is distinct from old.invite_code then
    raise exception 'ห้ามเปลี่ยนโค้ดเชิญ';
  end if;
  return new;
end;
$$;

drop trigger if exists groups_guard_immutable_trg on public.groups;
create trigger groups_guard_immutable_trg
  before update on public.groups
  for each row execute function public.groups_guard_immutable();

-- group_participants: เห็นแถวของตัวเอง หรือแถวในวงที่ตัวเองอยู่
-- insert ตรงได้แค่ผู้สร้างวง (ตอน createGroup); คนอื่นต้องผ่าน join_group(code)
drop policy if exists gp_select on public.group_participants;
create policy gp_select on public.group_participants
  for select using (user_id = auth.uid() or public.is_group_member(group_id));
drop policy if exists gp_insert on public.group_participants;
create policy gp_insert on public.group_participants
  for insert with check (user_id = auth.uid() and public.is_group_creator(group_id));
drop policy if exists gp_delete on public.group_participants;
create policy gp_delete on public.group_participants
  for delete using (user_id = auth.uid());

-- members / bills / bill_items: อ่าน/แก้ได้ถ้าเป็นสมาชิกของ group_id นั้น
drop policy if exists members_member_all on public.members;
create policy members_member_all on public.members
  for all using (public.is_group_member(group_id)) with check (public.is_group_member(group_id));

drop policy if exists bills_member_all on public.bills;
create policy bills_member_all on public.bills
  for all using (public.is_group_member(group_id)) with check (public.is_group_member(group_id));

drop policy if exists bill_items_member_all on public.bill_items;
create policy bill_items_member_all on public.bill_items
  for all using (public.is_group_member(group_id)) with check (public.is_group_member(group_id));

-- ---------- RPC: เข้าร่วมวงด้วย invite_code ----------
-- security definer เพื่อให้เห็น group จาก code ได้ก่อนเป็นสมาชิก แล้ว insert participant ให้
create or replace function public.join_group(code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  gid uuid;
begin
  if auth.uid() is null then
    raise exception 'ต้อง sign in ก่อนเข้าร่วมวง';
  end if;
  if code is null or btrim(code) = '' then
    raise exception 'ไม่พบวงจากโค้ดนี้';
  end if;

  select id into gid from public.groups
  where upper(invite_code) = upper(btrim(code));
  if gid is null then
    raise exception 'ไม่พบวงจากโค้ดนี้';
  end if;

  insert into public.group_participants (group_id, user_id)
  values (gid, auth.uid())
  on conflict (group_id, user_id) do nothing;

  return gid;
end;
$$;

grant execute on function public.join_group(text) to authenticated, anon;

-- ---------- RPC: settlements แบบ atomic ----------
-- security invoker (ค่าเริ่มต้น) → RLS ของ groups ยังบังคับใช้: แก้ได้เฉพาะสมาชิกของวง
-- UPDATE เดียวที่อ่านค่าเดิมจากแถวเอง = atomic ระดับแถว → สองเครื่องติ๊กพร้อมกันไม่ทับกัน
-- (เดิม client อ่าน array มาแล้วเขียนทับทั้งก้อน → รายการของอีกคนหาย)
create or replace function public.settlement_toggle(p_group_id uuid, p_key text, p_done boolean)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  result jsonb;
begin
  if p_done then
    update public.groups
    set settlements = coalesce((
      select jsonb_agg(distinct k)
      from jsonb_array_elements(coalesce(groups.settlements, '[]'::jsonb) || to_jsonb(p_key)) as e(k)
    ), '[]'::jsonb)
    where id = p_group_id
    returning settlements into result;
  else
    update public.groups
    set settlements = coalesce((
      select jsonb_agg(k)
      from jsonb_array_elements(coalesce(groups.settlements, '[]'::jsonb)) as e(k)
      where k <> to_jsonb(p_key)
    ), '[]'::jsonb)
    where id = p_group_id
    returning settlements into result;
  end if;

  if result is null then
    raise exception 'ไม่พบวง หรือไม่มีสิทธิ์แก้วงนี้';
  end if;
  return result;
end;
$$;

-- ตัด key ที่ไม่ตรงกับรายการโอนปัจจุบันออก (ยอดเปลี่ยน = การติ๊กเดิมเป็นโมฆะ)
-- p_keep = key ที่ยังใช้ได้ทั้งหมด (ว่าง = ล้างทิ้งหมด)
create or replace function public.settlements_prune(p_group_id uuid, p_keep text[])
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  result jsonb;
begin
  update public.groups
  set settlements = coalesce((
    select jsonb_agg(distinct k)
    from jsonb_array_elements(coalesce(groups.settlements, '[]'::jsonb)) as e(k)
    where k #>> '{}' = any(coalesce(p_keep, array[]::text[]))
  ), '[]'::jsonb)
  where id = p_group_id
  returning settlements into result;

  if result is null then
    raise exception 'ไม่พบวง หรือไม่มีสิทธิ์แก้วงนี้';
  end if;
  return result;
end;
$$;

grant execute on function public.settlement_toggle(uuid, text, boolean) to authenticated, anon;
grant execute on function public.settlements_prune(uuid, text[]) to authenticated, anon;

-- ---------- เปิด Realtime ----------
-- replica identity full → payload ของ UPDATE/DELETE ส่งค่าคอลัมน์ครบ
-- (default คือ primary key เท่านั้น → filter `group_id=eq.x` ไม่ match ตอน DELETE)
alter table public.groups             replica identity full;
alter table public.group_participants replica identity full;
alter table public.members            replica identity full;
alter table public.bills              replica identity full;
alter table public.bill_items         replica identity full;

-- เพิ่มเข้า publication แบบ idempotent (alter publication ... add table ตรง ๆ รันซ้ำจะ error)
do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'ไม่พบ publication supabase_realtime — ข้ามขั้นนี้ (เปิด Realtime ใน Dashboard ก่อน)';
    return;
  end if;
  foreach t in array array['groups', 'members', 'bills', 'bill_items'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
