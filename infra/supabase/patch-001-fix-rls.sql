-- ============================================================
-- Patch 001 — แก้ RLS ที่บล็อกการสร้างวง (chicken-and-egg)
-- รันไฟล์นี้ใน SQL Editor ถ้าคุณรัน schema.sql เวอร์ชันแรกไปแล้ว
-- (ถ้าเพิ่งรัน schema.sql เวอร์ชันล่าสุด ไม่ต้องรัน patch นี้)
-- ============================================================

-- 1. group_participants.user_id ให้ default = auth.uid()
--    เพื่อให้ client insert แค่ group_id ได้ ไม่ต้องส่ง user_id เอง
alter table public.group_participants
  alter column user_id set default auth.uid();

-- 2. แยก policy ของ groups: insert ทำได้ถ้าล็อกอิน (host ยังไม่เป็น participant ตอนสร้าง),
--    ส่วน select/update/delete ต้องเป็นสมาชิก
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
