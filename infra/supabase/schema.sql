-- ============================================================
-- หารเมา (hanmao) — schema สำหรับ group mode (multi-user real-time)
-- รันไฟล์นี้ใน Supabase SQL Editor ครั้งเดียวตอนตั้ง project
-- ============================================================

-- ---------- ตาราง ----------

-- วง (กลุ่มหารเงินหนึ่งครั้ง) — invite_code ใช้ในลิงก์/QR
create table if not exists public.groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null default 'วงใหม่',
  invite_code text not null unique,
  venue       jsonb,                          -- { lat, lng, radiusM } | null
  settlements jsonb not null default '[]',    -- string[] รายการโอนที่ติ๊ก "โอนแล้ว" (`${fromId}>${toId}`)
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
  paid_by_id         uuid,                            -- member id (nullable)
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

-- ---------- Row Level Security ----------
-- หลักการ: user เห็น/แก้ได้เฉพาะข้อมูลของวงที่ตัวเองเป็น participant

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

-- groups: สร้างวงได้ถ้าล็อกอินแล้ว (host ยังไม่เป็น participant ตอน insert — chicken&egg)
-- ส่วน อ่าน/แก้/ลบ ต้องเป็นสมาชิกของวงนั้น
drop policy if exists groups_member_all on public.groups;
drop policy if exists groups_insert on public.groups;
create policy groups_insert on public.groups
  for insert with check (auth.uid() is not null);
drop policy if exists groups_select on public.groups;
create policy groups_select on public.groups
  for select using (public.is_group_member(id));
drop policy if exists groups_update on public.groups;
create policy groups_update on public.groups
  for update using (public.is_group_member(id)) with check (public.is_group_member(id));
drop policy if exists groups_delete on public.groups;
create policy groups_delete on public.groups
  for delete using (public.is_group_member(id));

-- group_participants: เห็นแถวของตัวเอง หรือแถวในวงที่ตัวเองอยู่; เพิ่มได้เฉพาะแถวของตัวเอง
drop policy if exists gp_select on public.group_participants;
create policy gp_select on public.group_participants
  for select using (user_id = auth.uid() or public.is_group_member(group_id));
drop policy if exists gp_insert on public.group_participants;
create policy gp_insert on public.group_participants
  for insert with check (user_id = auth.uid());
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

  select id into gid from public.groups where invite_code = code;
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

-- ---------- เปิด Realtime ----------
alter publication supabase_realtime add table public.groups;
alter publication supabase_realtime add table public.members;
alter publication supabase_realtime add table public.bills;
alter publication supabase_realtime add table public.bill_items;
