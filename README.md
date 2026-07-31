# หารเมา (hanmao)

แอปหารค่าอาหาร/เครื่องดื่ม รองรับ iOS, Android และ Web จาก codebase เดียว (Expo + React Native + TypeScript)

## ฟีเจอร์

- **สมาชิก** — เพิ่มคน กำหนดว่ากิน *อาหาร / เครื่องดื่ม / ทั้งสอง* บันทึกเวลามา–กลับ ใส่พร้อมเพย์
- **หลายบิล** — แต่ละบิลมีหมวด (อาหาร/เครื่องดื่ม/รวม) และเมนูของตัวเอง; รองรับ **บิลเลี้ยง** (คนจ่ายรับเต็ม)
- **คนจ่ายต่อบิล** — แต่ละบิลระบุคนออกเงินได้คนละคน
- **ใครร่วมบิล** — เลือกได้ว่าใครอยู่ในบิลไหน เผื่อคนมาทีหลัง/กลับก่อน
- **วิธีหาร 3 แบบ**
  - `หารเท่ากัน` — เฉลี่ยทุกคนในบิล
  - `หารตามที่กิน` — เลือกผู้ร่วมเมนูเป็นรายเมนู
  - `หารตามเวลา` — เฉลี่ยตามสัดส่วนเวลาที่อยู่จริง (ใช้เวลามา–กลับ)
- **Service charge / VAT / ส่วนลด** — เฉลี่ยตามสัดส่วนอัตโนมัติ
- **สรุปหารเงิน** — ยอดต่อคน + คำนวณ "ใครโอนให้ใคร" ให้จำนวนโอนน้อยที่สุด (settle-up)
- **checklist โอนแล้ว** — ติ๊กว่าโอน/รับเงินแล้ว จ่ายครบทั้งวง → เคลียร์/ปิดวงได้
- **สรุปของฉัน** — แท็บ "ฉัน" โชว์เฉพาะที่ฉันต้องโอน/ต้องได้รับ + คัดลอกพร้อมเพย์
- **แชร์รูปสรุป** — export การ์ดสรุปเป็นรูป (web: ดาวน์โหลด, มือถือ: share sheet)
- **วงหลายคน real-time** — สร้าง/เข้าร่วมวงผ่าน invite link หรือ QR แล้วทุกคนแก้พร้อมกันได้ (Supabase; ต้องตั้ง env)
- **เช็กพื้นที่ร้าน** — ตั้งพิกัดร้าน แล้วเช็กว่ายังอยู่ในรัศมีไหม (iOS/Android)

## รันโปรเจกต์

```bash
npm run web       # เปิดบนเบราว์เซอร์
npm run ios       # เปิดบน iOS simulator
npm run android   # เปิดบน Android emulator
```

### วงหลายคน (group mode, ไม่บังคับ)

คัดลอก `config/.env.example` เป็น `.env` แล้วกรอก `EXPO_PUBLIC_SUPABASE_URL` + `EXPO_PUBLIC_SUPABASE_ANON_KEY`
(รัน `infra/supabase/schema.sql` ในโปรเจกต์ Supabase ก่อน). ถ้าไม่ตั้ง env แอปจะทำงาน local คนเดียวตามปกติ

> ฟีเจอร์แชร์รูปสรุปบนมือถือใช้ native module (`react-native-view-shot` + `expo-sharing`) ต้อง rebuild dev client (`npx expo run:ios` / `run:android`); บนเว็บใช้ได้ทันที

## โครงสร้าง

```
app/                 หน้าจอ (expo-router, file-based routing)
  index.tsx          หน้าแรก
  members.tsx        จัดการสมาชิก
  bills.tsx          รายการบิล
  bill/[id].tsx      รายละเอียดบิล
  summary.tsx        สรุปหารเงิน + checklist + แชร์รูป + location
  me.tsx             สรุปของฉัน (ต้องโอน/ต้องรับ)
  group.tsx          สร้าง/จัดการวง + QR/ลิงก์เชิญ
  join/[code].tsx    เข้าร่วมวงจาก deep link
src/
  domain/types.ts    โดเมนหลัก
  domain/split.ts    ตรรกะการหาร + settle-up
  utils/geo.ts       คำนวณระยะทาง (geofence)
  utils/id.ts        uuid + โค้ดเชิญ
  ui/index.ts        สี + helper แสดงผล
  ui/share.ts        จับภาพ View export เป็นรูป (web/native)
  data/store.tsx     state + persist dual-mode (AsyncStorage / Supabase)
  data/supabase.ts   Supabase client (null ถ้าไม่มี env)
  data/remote.ts     map row ↔ โดเมน + subscribe realtime
tests/e2e/           Playwright E2E (web build, local mode)
docs/                SPEC.md, architecture.md, adr/
infra/supabase/      schema + patch + ตั้งค่า backend
config/              .env.example
```

## ไอเดียต่อยอด (ยังไม่ได้ทำ)

- สแกนใบเสร็จด้วย OCR/AI ดึงรายการอัตโนมัติ
- Geofence อัตโนมัติจับเวลามา–กลับเอง
- สร้าง QR PromptPay จากยอดจริงให้สแกนโอน
- กลุ่มเพื่อนประจำ + ประวัติการหาร
- login เต็มรูป (link anonymous → บัญชีถาวร) + presence ใครกำลังแก้บิลไหน
