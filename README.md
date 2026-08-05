# หารเมา (hanmao)

แอปหารค่าอาหาร/เครื่องดื่ม รองรับ iOS, Android และ Web จาก codebase เดียว (Expo + React Native + TypeScript)

🔗 **ใช้งานได้เลยบนเว็บ:** https://velvety-blancmange-38d0b7.netlify.app/

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
  ระหว่างที่ยังมีบิล "หารตามเวลา" และยังมีคนไม่กลับ ยอดยังขยับตามเวลา → แอปจัดคู่โอนแบบ **ทุกคนโอนกับคนกลางคนเดียว**
  เพื่อให้คู่โอนกับการติ๊กไม่เปลี่ยนเอง (เพิ่มรายการโอนได้บางวง — ดู [ADR 0006](docs/adr/0006-stable-settle-topology.md))
- **checklist โอนแล้ว** — ติ๊กว่าโอน/รับเงินแล้ว จ่ายครบทั้งวง → เคลียร์/ปิดวงได้
  หมายเหตุ: พอคนสุดท้ายกดว่า "กลับแล้ว" ยอดจะนิ่งเป็นตัวเลขปิดจริง → **ต้องติ๊กใหม่อีกรอบก่อนปิดวง** (กันแอปอ้างว่าเงินโอนแล้วบนยอดที่ยังไม่นิ่ง)
- **สรุปของฉัน** — แท็บ "ฉัน" โชว์เฉพาะที่ฉันต้องโอน/ต้องได้รับ + คัดลอกพร้อมเพย์
- **แชร์รูปสรุป** — export การ์ดสรุปเป็นรูป (web: ดาวน์โหลด, มือถือ: share sheet)
- **วงหลายคน real-time** — สร้าง/เข้าร่วมวงผ่าน invite link หรือ QR แล้วทุกคนแก้พร้อมกันได้ (Supabase; ต้องตั้ง env)
- **เช็กพื้นที่ร้าน** — ตั้งพิกัดร้าน แล้วเช็กว่ายังอยู่ในรัศมีไหม (iOS/Android)
- **ธีมสว่าง/มืด** — ปุ่มสลับบน header ทุกหน้า (default มืด); จำค่าไว้ข้ามการเปิดแอป เป็นความชอบของเครื่อง (ไม่ผูกกับวง)

## รันโปรเจกต์

```bash
npm run web       # เปิดบนเบราว์เซอร์
npm run ios       # เปิดบน iOS simulator
npm run android   # เปิดบน Android emulator
```

ไม่ต้องตั้งอะไรเพิ่ม — แอปทำงานแบบ **local คนเดียว** ได้ทันที (ข้อมูลเก็บในเครื่อง)

### วงหลายคน real-time (group mode, ไม่บังคับ)

ทำตามลำดับนี้ ข้ามขั้นไหนไม่ได้:

1. **สร้าง project** ที่ https://supabase.com
2. **รัน SQL ใน SQL Editor** (Project → SQL Editor → New query → paste → Run)
   - project **ใหม่**: รัน [`infra/supabase/schema.sql`](infra/supabase/schema.sql) ไฟล์เดียว (เป็นภาพรวมล่าสุดแล้ว)
   - project **ที่ตั้งไว้ก่อนหน้านี้**: รัน `patch-NNN-*.sql` **ตามลำดับเลข** ที่ยังไม่ได้รัน
     (`patch-001-fix-rls` → `patch-002-treat-promptpay` → `patch-003-settlements` → `patch-004-security-realtime` → `patch-005-stable-order`)
     ทุกไฟล์ idempotent รันซ้ำได้ · **`patch-004` สำคัญ**: อุดช่องโหว่ที่สมาชิกคนไหนก็ลบวงทั้งวงได้ และที่ใครรู้ id วงก็เข้าวงได้โดยไม่ต้องมีโค้ดเชิญ
     · **`patch-005`** (ล่าสุด): คอลัมน์เวลาที่ใช้เรียง + index ให้ตรงกับ `order by` ที่แอปใช้ — **ไม่รันก็ยังใช้งานได้**
     (แอปเรียงซ้ำฝั่ง client ให้อยู่แล้ว) แต่จะไม่มี index รองรับการเรียง
   > ⚠️ **ยังไม่มีไฟล์ SQL ไหนถูกรันกับ Postgres จริงเลย** — ควรลองกับ project ทดสอบ / Supabase branch
   > ก่อนรันกับวงที่มีข้อมูลจริง
3. **เปิด Anonymous sign-in**: Authentication → Providers → **Anonymous** → เปิด
   (แอปใช้ `signInAnonymously()` ถ้าไม่เปิด จะสร้าง/เข้าวงไม่ได้เลย)
4. **ใส่ env**: คัดลอก `config/.env.example` เป็น `.env` ที่ root แล้วกรอก
   `EXPO_PUBLIC_SUPABASE_URL` + `EXPO_PUBLIC_SUPABASE_ANON_KEY` (Project Settings → API)
   ห้าม commit `.env`
5. **ตรวจว่าใช้ได้จริง** (ไม่บังคับ แต่เร็วกว่าไปเดาในแอป):
   ```bash
   node --env-file=.env scripts/smoke-supabase.mjs
   ```
   เช็กครบ: schema, anonymous auth, สร้างวง, `join_group` RPC, และ RLS ไม่รั่วให้คนนอกวงเห็นข้อมูล

ถ้าไม่ตั้ง env แอปจะบังคับ local mode และซ่อนหน้าวงให้อัตโนมัติ (ไม่ error)

> รายละเอียดสิ่งที่ SQL แต่ละไฟล์ทำ: [infra/supabase/README.md](infra/supabase/README.md)

### ขั้นตอนที่ต้องทำมือ (สรุปให้ครบที่เดียว)

| ต้องทำเมื่อ | ทำอะไร |
|---|---|
| จะใช้ group mode | สร้าง project → รัน SQL (`schema.sql` หรือ `patch-*.sql` ตามลำดับ ล่าสุดคือ `patch-005-stable-order`) → เปิด Anonymous sign-in → กรอก env (ขั้น 1-4 ด้านบน; ขั้น 5 smoke test ไม่บังคับ) |
| อัปเดตโค้ดแล้วมี `patch-NNN` ใหม่ | ไปรัน patch ที่ยังไม่ได้รันใน SQL Editor (ไม่มีระบบ migration อัตโนมัติ) — **ลองบน staging/branch ก่อน: ยังไม่มีไฟล์ SQL ไหนถูกรันกับ Postgres จริง** |
| จะใช้ **แชร์รูปสรุปบนมือถือ** | rebuild dev client: `npx expo run:ios` / `npx expo run:android` — ใช้ native module (`react-native-view-shot` + `expo-sharing`) จึงไม่ทำงานใน Expo Go ที่ build ไว้ก่อน; **บนเว็บใช้ได้ทันที** |
| จะใช้ **เช็กพื้นที่ร้าน** | เปิดสิทธิ์ตำแหน่งเมื่อแอปถาม (iOS/Android เท่านั้น — เว็บไม่มีฟีเจอร์นี้) |

## Deploy ขึ้น public ฟรี (Netlify)

> เว็บที่ deploy แล้ว: https://velvety-blancmange-38d0b7.netlify.app/

เว็บของหารเมาเป็น **static export** (`expo export --platform web` → โฟลเดอร์ `dist/`) จึง host ฟรีได้บน Netlify
Netlify **build + host ให้บน server ของเขาเอง** — ไม่ต้องเปิดเครื่องเราค้างไว้ ปิดเครื่องแล้วเว็บยังออนไลน์

โปรเจกต์มี [`netlify.toml`](netlify.toml) ให้แล้ว (build command + SPA redirect `/* → /index.html`
เพื่อให้ reload/เปิดลิงก์ตรงบน deep route เช่น `/summary`, `/bill/xxx`, `/join/xxx` ไม่ 404)

ทำตามลำดับนี้:

1. **เตรียม Supabase ก่อน** (ถ้าจะเปิด group mode) — ทำตามหัวข้อ "วงหลายคน real-time" ด้านบนให้ครบ:
   สร้าง project → รัน `schema.sql` → เปิด Anonymous sign-in → เก็บค่า
   `EXPO_PUBLIC_SUPABASE_URL` + `EXPO_PUBLIC_SUPABASE_ANON_KEY` ไว้
   > ข้ามขั้นนี้ได้ถ้าอยากได้แค่ local-only (เว็บใช้งานคนเดียว ไม่มีแท็บวง)
2. **push โค้ดขึ้น GitHub** (repo ต้องมี `netlify.toml` ที่เพิ่งเพิ่ม)
3. **เชื่อม Netlify**: https://netlify.com → Add new site → Import from Git → เลือก repo
   — build settings อ่านจาก `netlify.toml` อัตโนมัติ ไม่ต้องกรอก
4. **ใส่ env** (ถ้าเปิด group mode): Site configuration → Environment variables → เพิ่ม
   `EXPO_PUBLIC_SUPABASE_URL` + `EXPO_PUBLIC_SUPABASE_ANON_KEY` จากขั้น 1
   > anon key ถูก inline เข้า bundle เป็น **public โดยตั้งใจ** — ความปลอดภัยพึ่ง RLS (ต้องรัน `patch-004` แล้ว)
5. **Deploy** → ได้ URL `https://<ชื่อ>.netlify.app` (auto-deploy ทุกครั้งที่ push)
6. **ปิดท้าย** (group mode): กลับไป Supabase → Authentication → URL Configuration →
   เพิ่ม URL Netlify เข้า Site URL

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
  ui/index.ts        palette 2 ชุด (สว่าง/มืด) + helper แสดงผล (pure)
  ui/theme.ts        hook useTheme() — เลือก palette ตามธีมใน store
  ui/share.ts        จับภาพ View export เป็นรูป (web/native)
  data/store.tsx     state + persist dual-mode (AsyncStorage / Supabase)
  data/supabase.ts   Supabase client (null ถ้าไม่มี env)
  data/remote.ts     map row ↔ โดเมน + subscribe realtime
tests/e2e/           Playwright E2E (web build, local mode)
tests/unit/          เทส logic ล้วน (สูตรหาร/utils/ui helper)
tests/server/        static server เล็ก ๆ ที่ใช้เสิร์ฟ build ตอนรัน E2E
docs/                SPEC.md, architecture.md, adr/
infra/supabase/      schema.sql + patch-NNN-*.sql (ต้องรันเอง) + README ขั้นตอนติดตั้ง
scripts/             smoke-supabase.mjs (เช็ก backend ก่อนใช้ group mode)
config/              .env.example
```

รายละเอียดพฤติกรรมแต่ละหน้า/สูตรหาร: [docs/SPEC.md](docs/SPEC.md) · ภาพรวมเลเยอร์ + สารบัญ ADR: [docs/architecture.md](docs/architecture.md) · แนวปฏิบัติการเขียนโค้ด: [CLAUDE.md](CLAUDE.md)

## ไอเดียต่อยอด (ยังไม่ได้ทำ)

- สแกนใบเสร็จด้วย OCR/AI ดึงรายการอัตโนมัติ
- Geofence อัตโนมัติจับเวลามา–กลับเอง (ตอนนี้กดปุ่มเช็กเอง)
- สร้าง QR PromptPay จากยอดจริงให้สแกนโอน (ตอนนี้คัดลอกเบอร์พร้อมเพย์ได้เท่านั้น)
- กลุ่มเพื่อนประจำ + ประวัติการหาร (ปิดวงตอนนี้ = ลบถาวร ไม่เก็บย้อนหลัง)
- login เต็มรูป (link anonymous → บัญชีถาวร) + presence ใครกำลังแก้บิลไหน

> ทำเสร็จแล้ว (เคยอยู่ในลิสต์นี้): วงหลายคน real-time ผ่าน Supabase · เข้าร่วมด้วย invite link/QR · พร้อมเพย์ให้คัดลอกตอนโอน · checklist "โอนแล้ว" + ปิดวง · แชร์การ์ดสรุปเป็นรูป
