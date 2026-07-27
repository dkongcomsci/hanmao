# ADR 0001 — เลือก Supabase สำหรับ multi-user real-time

- สถานะ: Accepted
- วันที่: 2026-07-27

## บริบท
เดิมแอปเป็น local-only (AsyncStorage) 1 เครื่อง = 1 วง ต้องการให้หลาย user เข้าร่วมวงเดียวกัน
ผ่าน invite link/QR และแก้บิลพร้อมกันแบบ real-time

## ตัวเลือกที่พิจารณา
1. **Supabase** (Postgres + Realtime subscriptions + Auth) ← เลือก
2. Firebase Firestore — NoSQL ต้อง remodel โครงเป็น document/collection
3. Custom WebSocket server — คุมได้เต็มที่ แต่ต้อง host/deploy เอง

## การตัดสินใจ
ใช้ **Supabase** เพราะ: relational ตรงกับโมเดล `Bill`/`BillItem`/`Member` ที่มีอยู่,
มี Realtime + Row Level Security + Anonymous/permanent auth พร้อมใช้, free tier พอสำหรับ MVP,
JS SDK ใช้ได้ทั้ง RN และ web จาก codebase เดียว

## ผลที่ตามมา
- ต้องเพิ่ม `@supabase/supabase-js`, env `EXPO_PUBLIC_SUPABASE_*`, schema + RLS ใน `infra/supabase/`
- store กลายเป็น dual-mode; คง `Store` API เดิมไว้เพื่อไม่ต้องแก้หน้าจอ
- `uid()` local counter → UUID (กัน id ชนเมื่อหลายเครื่องสร้างพร้อมกัน)
- e2e เดิมยังครอบเฉพาะ local mode; group mode ต้องเทสกับ backend จริง (Phase 2)
