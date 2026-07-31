-- patch-003: ติดตามสถานะ "โอนแล้ว/จ่ายแล้ว" ต่อรายการโอน (checklist หน้าสรุป/หน้าฉัน)
-- รันใน Supabase SQL Editor กับ project เดิมครั้งเดียว
alter table public.groups add column if not exists settlements jsonb not null default '[]';
