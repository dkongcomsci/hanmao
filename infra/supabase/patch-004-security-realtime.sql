-- ============================================================
-- Patch 004 — อุดช่องโหว่ RLS + realtime payload ครบ + settlements แบบ atomic
-- รันไฟล์นี้ใน Supabase SQL Editor ถ้าคุณตั้ง project ด้วย schema เวอร์ชันก่อนหน้าแล้ว
-- (idempotent ทั้งไฟล์ — รันซ้ำได้ ไม่พัง)
--
-- แก้อะไร
--  1. groups.created_by — บันทึกว่าใครเป็นคนสร้างวง (host) + backfill ของเดิม
--  2. groups_delete — เดิมสมาชิกคนไหนก็ลบวงทั้งวงได้ → จำกัดเฉพาะผู้สร้าง
--  3. gp_insert — เดิมใครรู้ uuid ของวงก็ insert ตัวเองเข้าวงได้ (ไม่ต้องมีโค้ดเชิญ)
--     → เหลือทางเข้าเดียวคือ RPC join_group(code); insert ตรงได้แค่ผู้สร้างวงเท่านั้น
--  4. bills.paid_by_id — เพิ่ม FK ไป members (on delete set null) กัน "คนจ่ายผี" ค้าง
--  5. replica identity full — ให้ realtime ส่ง payload ครบตอน UPDATE/DELETE
--  6. publication supabase_realtime — เพิ่มตารางแบบ idempotent (เดิมรันซ้ำ error)
--  7. RPC settlement_toggle / settlements_prune — แก้ settlements ทีละ element
--     แบบ atomic (สองเครื่องติ๊ก "โอนแล้ว" พร้อมกันไม่ทับกันจนรายการของอีกคนหาย)
-- ============================================================

-- ---------- 1. groups.created_by ----------
alter table public.groups
  add column if not exists created_by uuid default auth.uid();

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'groups_created_by_fkey'
  ) then
    alter table public.groups
      add constraint groups_created_by_fkey
      foreign key (created_by) references auth.users(id) on delete set null;
  end if;
end $$;

-- backfill: วงเดิมยังไม่มี created_by → ใช้ participant คนแรกที่เข้าวง (= host เดิม)
update public.groups g
set created_by = p.user_id
from (
  select group_id, user_id,
         row_number() over (partition by group_id order by joined_at, user_id) as rn
  from public.group_participants
) p
where p.group_id = g.id and p.rn = 1 and g.created_by is null;

-- helper: uid นี้เป็นผู้สร้างวงนี้ไหม (security definer — เลี่ยง RLS ของ groups ตอนใช้ใน policy)
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

-- ---------- 2. ลบวง = เฉพาะผู้สร้าง ----------
-- สร้างวงได้ถ้าล็อกอิน แต่ห้ามยกวงให้คนอื่นเป็นผู้สร้าง (created_by ต้องเป็นตัวเอง)
drop policy if exists groups_insert on public.groups;
create policy groups_insert on public.groups
  for insert with check (auth.uid() is not null and created_by = auth.uid());

drop policy if exists groups_delete on public.groups;
create policy groups_delete on public.groups
  for delete using (created_by = auth.uid());

-- กันสมาชิกแก้ created_by/invite_code ของวง (RLS ของ update เห็นแค่แถวใหม่ เทียบค่าเดิมไม่ได้
-- → ต้องใช้ trigger) ไม่งั้นสมาชิกคนไหนก็ตั้งตัวเองเป็นผู้สร้างแล้วลบวงได้
create or replace function public.groups_guard_immutable()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- ไม่มี JWT (รันจาก SQL Editor / service_role / migration) → ข้าม guard
  -- ปลอดภัยเพราะ client ที่ใช้ anon key จะมี auth.uid() เสมอ (anonymous sign-in) และ RLS
  -- ของ groups_update ก็บังคับ is_group_member(id) ที่ต้องมี uid อยู่แล้ว
  if auth.uid() is null then
    return new;
  end if;
  -- ปกติ: ห้ามเปลี่ยนผู้สร้าง
  -- ข้อยกเว้นเดียว: วงกำพร้า (created_by null เพราะบัญชี host ถูกลบ / วงเก่าก่อน patch-004)
  -- สมาชิกในวงรับเป็น host ต่อได้ ไม่งั้นวงจะลบไม่ได้ตลอดกาล — แต่ต้องตั้งเป็นตัวเองเท่านั้น
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

-- ---------- 3. เข้าวงต้องผ่านโค้ดเชิญ ----------
-- insert group_participants ตรง ๆ ได้แค่ผู้สร้างวง (ตอน createGroup); คนอื่นต้องผ่าน join_group(code)
drop policy if exists gp_insert on public.group_participants;
create policy gp_insert on public.group_participants
  for insert with check (user_id = auth.uid() and public.is_group_creator(group_id));

-- join_group: หาโค้ดแบบไม่สนตัวพิมพ์/ช่องว่าง (client ส่ง uppercase มาแล้ว แต่กันเหนียว)
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

-- ---------- 4. FK paid_by_id ----------
-- เคลียร์ "คนจ่ายผี" ที่ค้างอยู่ก่อน ไม่งั้นเพิ่ม FK ไม่ผ่าน
update public.bills b
set paid_by_id = null
where paid_by_id is not null
  and not exists (select 1 from public.members m where m.id = b.paid_by_id);

alter table public.bills drop constraint if exists bills_paid_by_id_fkey;
alter table public.bills
  add constraint bills_paid_by_id_fkey
  foreign key (paid_by_id) references public.members(id) on delete set null;

-- ---------- 5. realtime payload ครบตอน UPDATE/DELETE ----------
alter table public.groups             replica identity full;
alter table public.group_participants replica identity full;
alter table public.members            replica identity full;
alter table public.bills              replica identity full;
alter table public.bill_items         replica identity full;

-- ---------- 6. publication แบบ idempotent ----------
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

-- ---------- 7. settlements แบบ atomic ----------
-- security invoker (ค่าเริ่มต้น) → RLS ของ groups ยังบังคับใช้: แก้ได้เฉพาะสมาชิกของวง
-- UPDATE เดียวที่อ่านค่าเดิมจากแถวเอง = atomic ระดับแถว (READ COMMITTED จะ re-evaluate
-- ให้เมื่อมีอีก transaction แก้แถวเดียวกันอยู่) → ไม่มีใครเขียนทับรายการของอีกคน

-- ติ๊ก/ยกเลิกทีละรายการ (p_done = true คือติ๊กว่าโอนแล้ว)
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
-- p_keep = รายการ key ที่ยังใช้ได้ทั้งหมด (ว่าง = ล้างทิ้งทั้งหมด)
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
