# infra/supabase

โครงสร้าง backend สำหรับ group mode (multi-user real-time)
**ไม่มีระบบ migration อัตโนมัติ** — ทุกไฟล์ในโฟลเดอร์นี้ต้องเอาไปรันเองใน Supabase SQL Editor

## ไฟล์

| ไฟล์ | ทำอะไร |
|---|---|
| `schema.sql` | **ภาพรวมล่าสุด** สำหรับ project ใหม่ — ตาราง (`groups`, `group_participants`, `members`, `bills`, `bill_items`) + RLS + Realtime + RPC (`join_group`, `settlement_toggle`, `settlements_prune`) |
| `patch-001-fix-rls.sql` | แก้ RLS ที่ทำให้สร้างกลุ่มไม่ได้ (chicken-and-egg: host ยังไม่เป็น participant ตอน insert) |
| `patch-002-treat-promptpay.sql` | เพิ่ม `bills.is_treat` (บิลเลี้ยง) + `members.prompt_pay` |
| `patch-003-settlements.sql` | เพิ่ม `groups.settlements` (jsonb) เก็บ checklist "โอนแล้ว" |
| `patch-004-security-realtime.sql` | **ความปลอดภัย** — `groups.created_by` (host), ลบกลุ่มได้เฉพาะ host, เข้ากลุ่มได้ทางเดียวคือ RPC `join_group(code)`, FK `bills.paid_by_id` (`on delete set null`), `replica identity full` + publication ให้ realtime ส่ง payload ครบ, และ RPC `settlement_toggle`/`settlements_prune` แบบ atomic |
| `patch-005-stable-order.sql` | **ลำดับแถวต้องนิ่ง** (ล่าสุด) — การันตีว่ามีคอลัมน์ `created_at` บน `members`/`bills`/`bill_items`, เติม `bills.created_at_ms` ที่ค้าง null, และสร้าง index `(group_id, <เวลา>, id)` ให้ตรงกับ `order by` ที่แอปใช้ · ไม่เปลี่ยนความหมายข้อมูล ไม่มี policy ใหม่ |

ทุกไฟล์ **idempotent** — รันซ้ำได้ไม่พัง

## ติดตั้ง (ขั้นตอนที่ต้องทำมือ)

> ⚠️ **ยังไม่มีไฟล์ SQL ไหนในโฟลเดอร์นี้ถูกรันกับ Postgres จริงเลย** (เขียน + ตรวจด้วยตาเท่านั้น)
> ให้ลองกับ **project ทดสอบ หรือ Supabase branch** ให้ผ่านก่อน แล้วค่อยรันกับกลุ่มที่มีข้อมูลจริง

1. สร้าง project ที่ https://supabase.com
2. **รัน SQL** ที่ SQL Editor → New query → paste → Run
   - project **ใหม่** → รัน `schema.sql` ไฟล์เดียว จบ
   - project **ที่มีข้อมูลอยู่แล้ว** → รัน `patch-NNN-*.sql` **ตามลำดับเลข** เฉพาะที่ยังไม่ได้รัน
     (ลำดับล่าสุด: `patch-004-security-realtime` → `patch-005-stable-order`)
3. **เปิด Anonymous sign-in**: Authentication → Providers → **Anonymous** → เปิด
   แอปใช้ `signInAnonymously()` เป็นวิธี auth หลัก ถ้าไม่เปิดจะสร้าง/เข้ากลุ่มไม่ได้เลย
4. คัดลอก Project URL + anon key (Project Settings → API) ไปใส่ `.env` ที่ root
   (ดู [config/.env.example](../../config/.env.example)) — **ห้าม commit `.env`**
5. ตรวจว่าพร้อมจริง: `node --env-file=.env scripts/smoke-supabase.mjs`
   เช็ก schema · anonymous auth · สร้างกลุ่ม · `join_group` RPC · RLS ไม่รั่วให้คนนอกกลุ่มเห็นข้อมูล

> ยังไม่รัน `patch-004`? แอปยังทำงานได้ (มี fallback: ถือว่าทุกคนเป็น host, เขียน `settlements` ทั้ง array
> แบบไม่ atomic) แต่ **ช่องโหว่ยังอยู่** — ควรรันให้จบ
>
> ยังไม่รัน `patch-005`? แอปยังทำงานได้และ **ลำดับยังนิ่ง** เพราะ `fetchGroupState()` เรียงซ้ำฝั่ง client
> เสมอ (`sortByTimeThenId`) และมี `selectOrdered()` ที่ถอยไปดึงแบบไม่ `order` ถ้าคอลัมน์เวลาไม่มี
> — ที่ขาดคือ **index รองรับ `order by`** (Postgres ต้อง sort ทั้งชุดเอง) จึงเป็นเรื่อง performance ไม่ใช่ความถูกต้อง
> เหตุผลที่ลำดับแถวเป็นเรื่องความถูกต้องของ **ตัวเงิน** ไม่ใช่แค่ความสวยของรายชื่อ:
> [ADR 0002 ภาคผนวก](../../docs/adr/0002-integer-cents-largest-remainder.md)

## เพิ่ม/แก้ schema ต่อ

- แก้ `schema.sql` ให้เป็นภาพรวมล่าสุด **และ** เพิ่ม `patch-NNN-*.sql` ใหม่อีกไฟล์สำหรับ project ที่มีข้อมูลแล้ว
- ใช้ `add column if not exists` / `drop policy if exists` ให้ idempotent เสมอ
- ตารางใหม่: เปิด RLS (ให้สิทธิ์ผ่านการเป็นสมาชิกใน `group_participants`) + เพิ่มเข้า publication `supabase_realtime` ถ้าต้อง sync
- การเขียนข้อมูลที่ต้องข้ามผู้ใช้ ให้ทำเป็น RPC `security definer` + `grant execute` ไม่ใช่เปิด policy ให้ client เขียนตรง
  (ดู [ADR 0005](../../docs/adr/0005-group-host-and-rpc-only-join.md))
