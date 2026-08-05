-- ============================================================
-- Patch 005 — ลำดับแถวต้องนิ่ง (deterministic order)
-- รันไฟล์นี้ใน Supabase SQL Editor ถ้าคุณตั้ง project ด้วย schema เวอร์ชันก่อนหน้าแล้ว
-- (idempotent ทั้งไฟล์ — รันซ้ำได้ ไม่พัง)
--
-- ทำไมต้องมี
--   Postgres ไม่การันตีลำดับแถวถ้า query ไม่ระบุ `order by` — ลำดับเปลี่ยนได้ตาม
--   query plan / vacuum / index ⇒ สองเครื่องในวงเดียวกันได้ `members` ลำดับต่างกัน
--   ลำดับสมาชิกมีผลถึง "การเกลี่ยเศษสตางค์" (largest remainder ใน split.ts ที่ tiebreak
--   ตามลำดับรายชื่อ) → คู่โอน/`transferKey` ต่างกัน → คนหนึ่งติ๊ก "โอนแล้ว"
--   อีกคนเห็น "ยังไม่โอน" (วัดได้จริง ~11% ของเคสสุ่ม) และรายชื่อบนจอยังสลับตำแหน่งเองอีก
--
--   ฝั่งแอปแก้แล้ว: ทุก query เรียงด้วย `(created_at, id)` / `(created_at_ms, id)`
--   (`id` เป็น tiebreak ชั้นสอง เพราะคอลัมน์เวลาซ้ำกันได้ — `default now()` คงที่ทั้ง
--   ทรานแซกชัน ⇒ insert หลายแถวในคำสั่งเดียวได้เวลาเท่ากันหมด)
--   ไฟล์นี้ทำฝั่ง DB ให้รองรับ:
--     1. การันตีว่าคอลัมน์ `created_at` ที่ใช้เรียงมีอยู่จริงทุกตาราง (project เก่าอาจไม่มี)
--     2. index ให้ตรงกับ `order by` ที่แอปใช้ (เดิม index มีแค่ `group_id`)
--   ไม่มีการเปลี่ยนความหมายของข้อมูล / ไม่มี policy ใหม่
-- ============================================================

-- ---------- 1. คอลัมน์ที่ใช้เรียง ต้องมีอยู่จริง ----------
-- project ที่ตั้งด้วย schema รุ่นแรกอาจไม่มี created_at บนบางตาราง
-- หมายเหตุ: แถวเดิมที่มีอยู่แล้วจะได้ค่า now() เท่ากันหมด (Postgres เติมค่า default
-- ครั้งเดียวตอน add column) → แถวเก่าจะเรียงตาม id เป็นหลัก ซึ่ง "นิ่งและเหมือนกัน
-- ทุกเครื่อง" ตามที่ต้องการ แต่ไม่ใช่ลำดับที่สร้างจริง — ยอมรับได้ เพราะสิ่งที่ต้องแก้
-- คือความ "ไม่นิ่ง" ไม่ใช่การกู้ลำดับย้อนหลัง
alter table public.members
  add column if not exists created_at timestamptz not null default now();
alter table public.bills
  add column if not exists created_at timestamptz not null default now();
alter table public.bill_items
  add column if not exists created_at timestamptz not null default now();

-- bills เรียงด้วย created_at_ms (epoch ms ของโดเมน) — ต้องไม่เป็น null ไม่งั้นลำดับเพี้ยน
-- (null เรียงท้ายสุดใน asc ของ Postgres) เติมจาก created_at ให้แถวที่ค้าง null
update public.bills
set created_at_ms = (extract(epoch from created_at) * 1000)::bigint
where created_at_ms is null;

-- ---------- 2. index ให้ตรงกับ order by ที่แอปใช้ ----------
-- แอป query: where group_id = ? order by <เวลา>, id
-- index ตามลำดับคอลัมน์เดียวกัน → Postgres อ่านเรียงจาก index ได้ ไม่ต้อง sort ทั้งชุด
create index if not exists idx_members_group_created
  on public.members(group_id, created_at, id);
create index if not exists idx_bills_group_created
  on public.bills(group_id, created_at_ms, id);
create index if not exists idx_bill_items_group_created
  on public.bill_items(group_id, created_at, id);
