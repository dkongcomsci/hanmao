-- ============================================================
-- Patch 002 — เพิ่มฟีเจอร์: บิลเลี้ยง (is_treat) + พร้อมเพย์ของสมาชิก (prompt_pay)
-- รันไฟล์นี้ใน SQL Editor ถ้าคุณตั้ง project ด้วย schema เวอร์ชันก่อนหน้าแล้ว
-- (idempotent — รันซ้ำได้ ไม่พัง)
-- ============================================================

alter table public.members
  add column if not exists prompt_pay text;

alter table public.bills
  add column if not exists is_treat boolean not null default false;
