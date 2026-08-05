# ADR 0005 — กลุ่มมี host เจ้าของเดียว + เข้ากลุ่มผ่าน RPC เท่านั้น

- สถานะ: Accepted
- วันที่: 2026-07-31

## บริบท
โครง RLS รุ่นแรกให้สิทธิ์ทุกอย่างกับ "คนที่เป็นสมาชิกกลุ่ม" (`group_participants`) เท่ากันหมด
ทำให้เกิดสองช่องโหว่ที่เอาข้อมูลของคนอื่นหายได้จริง:

1. **สมาชิกคนไหนก็ลบกลุ่มทั้งกลุ่มได้** — ปุ่ม "ปิดกลุ่ม" ในหน้าสรุปกดโดยใครก็ได้ แล้ว cascade
   ลบสมาชิก/บิล/เมนูของทุกคนถาวร
2. **ใครรู้ `groups.id` (uuid) ก็ insert ตัวเองเข้ากลุ่มได้** โดยไม่ต้องมีโค้ดเชิญ
   → โค้ดเชิญไม่ได้ทำหน้าที่คุมทางเข้าจริง

นอกจากนี้ `bills.paid_by_id` ไม่มี FK ไป `members` — ลบสมาชิกฝั่ง server แล้วเหลือ "คนจ่ายผี" ค้าง

## ตัวเลือกที่พิจารณา
1. **เพิ่ม `groups.created_by` เป็น host + ปิด insert ตรง แล้วเปิดทางเข้าเดียวผ่าน RPC `join_group(code)`** ← เลือก
2. ทำระบบ role/permission ในตารางแยก (owner/member/…) — ยืดหยุ่นกว่า แต่เกินความจำเป็น
   ของ MVP ที่ต้องแยกแค่ "คนสร้างกลุ่ม" กับ "คนอื่น"
3. คุมที่ client เท่านั้น (ซ่อนปุ่ม) — ไม่ใช่การป้องกัน ใครยิง API ตรงก็ทำได้

## การตัดสินใจ
รวมไว้ใน `infra/supabase/patch-004-security-realtime.sql` (idempotent รันซ้ำได้):

- เพิ่ม `groups.created_by` (default `auth.uid()`, FK ไป `auth.users`) + backfill ของกลุ่มเดิม
  โดยใช้ participant คนแรกที่เข้ากลุ่มเป็น host
- policy `groups_delete` → เฉพาะ `created_by = auth.uid()`; `groups_insert` ห้ามตั้ง `created_by` เป็นคนอื่น
- trigger `groups_guard_immutable` กันแก้ `created_by`/`invite_code` ภายหลัง
- policy `gp_insert` → insert `group_participants` ตรงได้แค่ผู้สร้างกลุ่ม (ตอน `createGroup`);
  คนอื่นต้องผ่าน **`join_group(code)`** (`security definer`) ที่เทียบโค้ดแบบไม่สนตัวพิมพ์/ช่องว่าง
- เพิ่ม FK `bills.paid_by_id → members(id) on delete set null`
- `replica identity full` + เพิ่มตารางเข้า publication `supabase_realtime` แบบ idempotent
- RPC `settlement_toggle` / `settlements_prune` แก้ `settlements` ทีละ element แบบ atomic

ฝั่งแอป: store expose **`isHost`** (เทียบ `created_by` กับ uid) และหน้าสรุปเปลี่ยนข้อความ/ผลของปุ่มตามนั้น —
host = "ปิดกลุ่ม (ลบของทุกคน)", ไม่ใช่ host = "ออกจากกลุ่ม"

## ผลที่ตามมา
- **ต้องรัน patch-004 กับ project ที่ตั้งไว้ก่อนหน้านี้** ไม่งั้นช่องโหว่ยังอยู่
  แอปยังทำงานได้กับ schema เก่า (fallback: `select` ไม่มี `created_by` → ถือว่าเป็น host,
  RPC หายไป → เขียน `settlements` ทั้ง array แบบไม่ atomic) — ตั้งใจให้ไม่พัง แต่ **ไม่ปลอดภัยเท่า**
- คนที่ไม่ใช่ host ไม่มีทางลบกลุ่มได้อีก ถ้า host หายไปจากกลุ่ม กลุ่มจะค้างอยู่ (ยอมรับใน MVP;
  มีข้อยกเว้นในทริกเกอร์สำหรับ "กลุ่มกำพร้า" ที่ `created_by` เป็น null ให้ claim ได้)
- ฟีเจอร์ใหม่ที่ต้องเขียนข้อมูลข้ามผู้ใช้ ให้ทำเป็น RPC `security definer` แล้ว grant
  ไม่ใช่เปิด policy ให้ client insert/update ตรง
