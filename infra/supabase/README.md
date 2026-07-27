# infra/supabase

โครงสร้าง backend สำหรับ group mode (multi-user real-time)

- `schema.sql` — ตาราง (groups/members/bills/bill_items/group_participants) + RLS + เปิด Realtime + RPC `join_group`

## ติดตั้ง
1. สร้าง project ที่ https://supabase.com
2. เปิด SQL Editor → รัน `schema.sql`
3. คัดลอก Project URL + anon key ไปใส่ `.env` (ดู [config/.env.example](../../config/.env.example))
