# ฮารเหมา (hanmao)

แอปหารค่าอาหาร/เครื่องดื่ม รองรับ iOS, Android และ Web จาก codebase เดียว (Expo + React Native + TypeScript)

## ฟีเจอร์ (MVP)

- **สมาชิก** — เพิ่มคน กำหนดว่ากิน *อาหาร / เครื่องดื่ม / ทั้งสอง* บันทึกเวลามา–กลับ
- **หลายบิล** — แต่ละบิลมีหมวด (อาหาร/เครื่องดื่ม/รวม) และเมนูของตัวเอง
- **คนจ่ายต่อบิล** — แต่ละบิลระบุคนออกเงินได้คนละคน
- **ใครร่วมบิล** — เลือกได้ว่าใครอยู่ในบิลไหน เผื่อคนมาทีหลัง/กลับก่อน
- **วิธีหาร 3 แบบ**
  - `หารเท่ากัน` — เฉลี่ยทุกคนในบิล
  - `หารตามที่กิน` — เลือกผู้ร่วมเมนูเป็นรายเมนู
  - `หารตามเวลา` — เฉลี่ยตามสัดส่วนเวลาที่อยู่จริง (ใช้เวลามา–กลับ)
- **Service charge / VAT / ส่วนลด** — เฉลี่ยตามสัดส่วนอัตโนมัติ
- **สรุปหารเงิน** — ยอดต่อคน + คำนวณ "ใครโอนให้ใคร" ให้จำนวนโอนน้อยที่สุด (settle-up)
- **เช็กพื้นที่ร้าน** — ตั้งพิกัดร้าน แล้วเช็กว่ายังอยู่ในรัศมีไหม (iOS/Android)

## รันโปรเจกต์

```bash
npm run web       # เปิดบนเบราว์เซอร์
npm run ios       # เปิดบน iOS simulator
npm run android   # เปิดบน Android emulator
```

## โครงสร้าง

```
app/                 หน้าจอ (expo-router, file-based routing)
  index.tsx          หน้าแรก
  members.tsx        จัดการสมาชิก
  bills.tsx          รายการบิล
  bill/[id].tsx      รายละเอียดบิล
  summary.tsx        สรุปหารเงิน + location
src/
  domain/types.ts    โดเมนหลัก
  domain/split.ts    ตรรกะการหาร + settle-up
  utils/geo.ts       คำนวณระยะทาง (geofence)
  ui/index.ts        สี + helper แสดงผล
  data/store.tsx     state + persist (AsyncStorage / Supabase)
tests/e2e/           Playwright E2E (web build)
docs/                SPEC.md, architecture.md, adr/
infra/supabase/      schema + ตั้งค่า backend
config/              .env.example
```

## ไอเดียต่อยอด (ยังไม่ได้ทำใน MVP)

- แชร์ลิงก์บิล real-time ให้เพื่อนกดเลือกเมนูเอง
- สแกนใบเสร็จด้วย OCR/AI ดึงรายการอัตโนมัติ
- Geofence อัตโนมัติจับเวลามา–กลับเอง
- สร้าง QR PromptPay ให้สแกนโอน
- กลุ่มเพื่อนประจำ + ประวัติการหาร
