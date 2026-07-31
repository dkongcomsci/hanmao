# CLAUDE.md

คู่มือสำหรับ AI ที่มาทำงานต่อในโปรเจกต์นี้ อ่านก่อนเริ่มแก้โค้ด

## โปรเจกต์นี้คืออะไร

**หารเมา (hanmao)** — แอปหารค่าอาหาร/เครื่องดื่ม (bill splitting) สำหรับกลุ่มเพื่อน
บริบทร้านไทย (VAT 7%, service charge 10%, PromptPay) ภาษา UI เป็นภาษาไทย

> อยากเข้าใจ **การทำงานของแอปแบบละเอียด** (โมเดลข้อมูล, สูตรหาร, พฤติกรรมแต่ละหน้า) อ่าน [docs/SPEC.md](docs/SPEC.md)
> ภาพรวมสถาปัตยกรรม/เลเยอร์ อ่าน [docs/architecture.md](docs/architecture.md)
> ไฟล์นี้ (CLAUDE.md) เน้น **แนวปฏิบัติการเขียนโค้ด** ให้เข้ากับของเดิม; กฎแยกตามขอบเขตอยู่ที่ [.claude/rules/](.claude/rules/)

## Tech stack

- **Expo ~57** + **React Native 0.86** + **TypeScript** (strict)
- **expo-router** — file-based routing (โฟลเดอร์ `app/`)
- **@react-native-async-storage/async-storage** — persist state (local mode)
- **@supabase/supabase-js** — Postgres + Realtime สำหรับวงหลายคน (group mode; ทำงานเมื่อมี env)
- **expo-location** — เช็ก geofence พื้นที่ร้าน
- **react-native-view-shot** + **expo-sharing** — export การ์ดสรุปเป็นรูป
- Deploy ได้ทั้ง **iOS / Android / Web** จาก codebase เดียว

## คำสั่งที่ใช้บ่อย

```bash
npm run web            # dev บนเบราว์เซอร์
npm run ios            # iOS simulator
npm run android        # Android emulator
npx tsc --noEmit       # typecheck (ต้องผ่านก่อน commit)
npx expo export --platform web   # ตรวจว่า bundle web compile ได้
npm run test:e2e       # รัน Playwright E2E (auto build web + serve dist ก่อนรัน)
npm run test:e2e:ui    # เปิด Playwright UI mode ดูทีละ step
```

หลังแก้โค้ดให้รัน `npx tsc --noEmit` เสมอ ก่อนถือว่าเสร็จ ถ้าแตะ UI/logic ที่มีเทสครอบ ให้รัน `npm run test:e2e` ด้วย

## โครงสร้างและหน้าที่ของแต่ละไฟล์

```
app/                     หน้าจอ (expo-router) — ต้องอยู่ที่ root ตามข้อกำหนด expo-router
  _layout.tsx            Bottom Tabs + StoreProvider + SafeArea + ธีมมืด (แท็บ: หน้าแรก/สมาชิก/บิล/สรุป/ฉัน, ไอคอน emoji)
  index.tsx              หน้าแรก dashboard — ยอดรวม + onboarding 3 ขั้น (ตอนว่าง) + ทางลัด + เข้าวง
  members.tsx            จัดการสมาชิก (ชื่อ, กินอะไร, เวลามา-กลับ, พร้อมเพย์)
  bills.tsx              รายการบิล + สร้างบิลใหม่
  bill/[id].tsx          รายละเอียดบิล (เมนู, คนจ่าย, ผู้ร่วม, ค่าบริการ, บิลเลี้ยง) — หน้าซับซ้อนสุด
  summary.tsx            สรุปยอดต่อคน + settle-up + checklist โอนแล้ว + แชร์รูป + เคลียร์/ปิดวง + เช็ก location
  me.tsx                 สรุปของฉัน (ฉันต้องโอน/ต้องรับ + checklist + พร้อมเพย์)
  group.tsx              สร้าง/จัดการวง + QR/ลิงก์เชิญ + ออกจากวง (group mode)
  join/[code].tsx        เข้าร่วมวงจาก deep link (claim member เดิม หรือสร้างใหม่)
src/
  domain/types.ts        โดเมนหลัก (Member, Bill, BillItem, AppState, Group) — เริ่มอ่านที่นี่
  domain/split.ts        ตรรกะการหารทั้งหมด + settle-up + transferKey/allSettled/billComplete (pure)
  utils/geo.ts           haversine ระยะทางระหว่างพิกัด
  utils/id.ts            uuid() + inviteCode()
  ui/index.ts            สี (colors), baht(), timeStr(), label, confirmRemove(), copyText(), formatPromptPay()
  ui/share.ts            จับภาพ View แล้ว export เป็นรูป (web: ดาวน์โหลด, native: share sheet)
  data/store.tsx         React Context + API + persist dual-mode (AsyncStorage local / Supabase group)
  data/supabase.ts       สร้าง Supabase client จาก env (null ถ้าไม่มี env → บังคับ local)
  data/remote.ts         map row ↔ โดเมน + subscribeGroup (realtime) + fetchGroupState
tests/e2e/               Playwright E2E tests (รันบน web build, local mode)
  helpers.ts             freshPage() ล้าง localStorage ให้เริ่มสะอาด + addMember()
  members.spec.ts        เทสหน้าสมาชิก (เพิ่ม/ลบ/toggle มา-กลับ/ปุ่ม disable)
  bills.spec.ts          เทสหน้าบิล (สร้างบิล/เพิ่มเมนู/เลือกคนจ่าย)
  summary.spec.ts        เทสหน้าสรุป (แยกตามบิล + ปุ่มดาวน์โหลดรูป disable/enable)
  settlement.spec.ts     เทส checklist โอนแล้ว/progress/เคลียร์ทั้งหมด/sync แท็บฉัน↔สรุป
  navigation.spec.ts     เทส bottom tabs (สลับแท็บ) + onboarding หน้าแรก
docs/                    SPEC.md, architecture.md, adr/ (บันทึกการตัดสินใจ)
infra/supabase/          schema.sql + patch-*.sql + การตั้งค่า backend (group mode)
config/                  .env.example (เทมเพลต Supabase env)
.claude/                 control plane: rules/ skills/ agents/ hooks/
playwright.config.ts     config — auto `expo export` + `serve dist` ที่ port 4599 ก่อนรันเทส
```

## ทีม agent (แบ่งงานตามขอบเขตไฟล์)

งานหลายเลเยอร์ → สั่ง **`hanmao-lead`** ให้แตกงานแล้วกระจายให้ลูกทีมทำขนานกัน; งานเลเยอร์เดียว → สั่งตัวที่ตรงขอบเขตไปตรง ๆ

| agent | ขอบเขต |
|---|---|
| `hanmao-lead` | หัวหน้าทีม — แตกงาน/กระจาย/รวมผล (ตัวเดียวที่ delegate ต่อได้) |
| `hanmao-domain` | `src/domain/**` — สูตรหาร, โมเดล |
| `hanmao-frontend` | `app/**`, `src/ui/**` — หน้าจอ |
| `hanmao-data` | `src/data/**`, `infra/supabase/**` — store, persist, SQL |
| `hanmao-test` | `tests/**` — Playwright E2E |
| `hanmao-docs` | ไฟล์ `.md` — เอกสาร |
| `hanmao-reviewer` | อ่านเท่านั้น — รัน tsc/e2e + ตรวจกฎ |

ลำดับพึ่งพา: `domain`+`data` (ขนานกันได้) → `frontend` → `test` → `reviewer` → `docs`
รายละเอียด + วิธีเพิ่ม agent: [.claude/agents/README.md](.claude/agents/README.md)

## โมเดลข้อมูล (สำคัญ — อ่านให้เข้าใจก่อนแก้ logic)

- **Member** มี `consumes: 'both' | 'food' | 'drink'` (กินอะไร), `arrivedAt`/`leftAt` (epoch ms, null = อยู่ตลอด), `promptPay?`, `userId?`
- **Bill** มี `category` (food/drink/mixed), `splitMode`, `items[]`, `memberIds[]`, `paidById`, `isTreat?` (บิลเลี้ยง), และ service/vat/discount
- **AppState** มี `settlements: string[]` (รายการโอนที่ติ๊ก "โอนแล้ว" key `${fromId}>${toId}`) — ดู `transferKey()`/`allSettled()` ใน split.ts
- **สำคัญ**: `paidById` = คนออกเงินบิลนั้น **แต่ละบิลอาจคนละคน** — เป็น requirement หลัก อย่าทำหาย
- ฟิลด์ `*Ids` ที่เป็น array ว่าง มีความหมายพิเศษ = "ทุกคนที่เข้าเงื่อนไข":
  - `bill.memberIds` ว่าง → ทุกคนที่ `consumes` ตรงกับ `category`
  - `item.participantIds` ว่าง → ทุกคนในบิล

## ตรรกะการหาร (src/domain/split.ts)

3 โหมด (`bill.splitMode`):
- `equal` — เฉลี่ยเท่ากันทุกคนที่ร่วมบิล
- `itemized` — หารตามผู้ร่วมของแต่ละเมนู (`item.participantIds`)
- `time` — เฉลี่ยตามสัดส่วนเวลาที่อยู่ (ใช้ `arrivedAt`/`leftAt`)

ลำดับการคิด: ยอดดิบต่อคนตามโหมด → คูณ factor รวม service+vat-discount แบบสัดส่วน
`settleUp()` = greedy min-transfer จาก net balance (จ่ายจริง vs ที่ต้องรับผิดชอบ)

**ถ้าจะแก้สูตรหาร แก้ที่ split.ts เท่านั้น — UI แค่เรียกใช้ อย่ากระจาย logic ลง component**

## การเทส (E2E ด้วย Playwright)

- เทสรันบน **web build** (`expo export` → serve `dist`) — config จัดการ build+serve ให้เอง ไม่ต้องเปิด server ก่อน
- state persist ลง **localStorage** (key `hanmao:state:v1`) → ทุกเทสเรียก `freshPage()` เพื่อล้าง state เดิมก่อน ไม่งั้นข้อมูลจากเทสก่อนจะค้าง
- ยิง element ด้วยข้อความไทยจริงบนจอ (`getByText`, `getByPlaceholder`) — ถ้าข้อความชนกันหลายจุดให้ใช้ `{ exact: true }` หรือ `.first()`
- **ฟีเจอร์ location เทสบน web ไม่ได้** เพราะถูกซ่อนด้วย `Platform.OS !== 'web'` — ถ้าจะเทสต้องแยกไปเทส unit ของ `distanceM` ใน `geo.ts` โดยตรง
- เพิ่มเทสใหม่ = สร้าง `*.spec.ts` ใน `tests/e2e/` เขียนหนึ่งไฟล์ต่อหน้าจอ/หนึ่ง describe ต่อ action group
- ปุ่มลบเรียก `window.confirm` บน web → ในเทสต้องดัก `page.once('dialog', d => d.accept())` (หรือ `d.dismiss()` เพื่อยกเลิก) ก่อนคลิก
- ปุ่มที่ `disabled` คลิกไม่ได้ ให้ assert ด้วย `toBeDisabled()`/`toBeEnabled()` แทนการ click
- สลับแท็บใช้ `page.getByRole('tab', { name: /ชื่อแท็บ/ })`

## แนวทางเขียนโค้ด (ให้เข้ากับของเดิม)

- คอมเมนต์เป็นภาษาไทย, UI ข้อความเป็นภาษาไทย
- State ทุกอย่างผ่าน `useStore()` จาก `src/data/store.tsx` — อย่าใช้ AsyncStorage ตรงๆ ใน component
- ธีมมืด ใช้สีจาก `colors` ใน `src/ui/index.ts` เท่านั้น อย่า hardcode hex ใน component
- แสดงจำนวนเงินด้วย `baht()` เสมอ
- Location feature เช็ก `Platform.OS !== 'web'` ก่อน (web ไม่มี geofence)
- ปุ่มที่มีเงื่อนไข (เช่น ต้องกรอกชื่อก่อน) ให้ `disabled` + หรี่ opacity เมื่อยังทำไม่ได้ อย่าปล่อยให้กดแล้วเงียบ (no-op) — ผู้ใช้จะนึกว่าปุ่มเสีย
- ปุ่ม/ช่องกรอกทุกจุดใส่ `accessibilityRole` + `accessibilityLabel` (และ `accessibilityState` สำหรับ selected/disabled) รองรับ screen reader; hit target ปุ่มเล็ก ≥ 40px
- การลบ (สิ่งที่ย้อนกลับไม่ได้) ให้เรียก `confirmRemove(name, onConfirm)` จาก `ui.ts` เสมอ อย่าลบทันที
- Empty state ทุกหน้าใช้รูปแบบเดียวกัน: ไอคอน emoji + หัวข้อ + คำแนะนำว่าให้ทำอะไรต่อ (ดู `emptyBox`/`emptyIcon`/`emptyTitle`/`emptyDesc`)

## ยังไม่ได้ทำ (backlog — ดูราย­ละเอียดใน README.md)

สแกนใบเสร็จ OCR · geofence จับเวลาอัตโนมัติ · QR PromptPay จากยอดจริง · กลุ่มเพื่อนประจำ + ประวัติ · login เต็มรูป + presence (Phase 2)

state เป็น **dual-mode**: local (AsyncStorage) เป็นค่าเริ่ม; group (Supabase real-time) เมื่อเข้าร่วมวงและตั้ง env แล้ว
