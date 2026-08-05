# tests/e2e

Playwright E2E — รันบน **web build** (`expo export` → serve `dist` ที่ port 4599; config จัดการ build+serve ให้เอง)

รัน: `npm run test:e2e` · ดูทีละ step: `npm run test:e2e:ui` · ไฟล์เดียว: `npx playwright test tests/e2e/<file>.spec.ts`
(เทส logic ล้วนอยู่ที่ [tests/unit](../unit/README.md) — `npm run test:unit`; `npm test` รันทั้งสองชุด)

## ไฟล์

| ไฟล์ | ครอบอะไร |
|---|---|
| `helpers.ts` | `freshPage()` ล้าง localStorage, `addMember()`, `createBill()`, `addItem()`, `pickPayer()`, `toggleTreat()`, `pickMe()`, `TABS`/`openTab()`, `visibleText()`, `timeToggle()`/`markArrived()`/`markLeft()` |
| `members.spec.ts` | เพิ่ม/ลบสมาชิก, toggle มา-กลับ, ปุ่ม disable |
| `bills.spec.ts` | สร้างบิล, เพิ่มเมนู, เลือกคนจ่าย |
| `bill-edit.spec.ts` | ค่าบริการ/VAT/ส่วนลด (รวมส่วนลดเกินยอด = ติดลบ), เศษสตางค์, เปลี่ยนชื่อบิล/คนจ่าย/ผู้ร่วมบิล, ลบเมนู/ลบบิล |
| `split-mode-time.spec.ts` | โหมด "หารตามเวลา" — สลับโหมด + **regression: ติ๊กโอนแล้วต้องไม่หลุดเองเมื่อเวลาเดิน** |
| `summary.spec.ts` | สรุปแยกตามบิล, ปุ่มดาวน์โหลดรูป disable/enable |
| `settlement.spec.ts` | checklist โอนแล้ว, progress, เคลียร์ทั้งหมด, sync แท็บฉัน↔สรุป |
| `me.spec.ts` | แท็บฉัน — เลือกว่าฉันคือใคร, สรุปเฉพาะของฉัน |
| `navigation.spec.ts` | bottom tabs + onboarding หน้าแรก (ตอนว่าง) |
| `home-dashboard.spec.ts` | หน้าแรกตอน**มีข้อมูล** — hero ยอดรวม/ตัวนับคน-บิล, ทางลัด NavCard, onboarding หายเมื่อมีข้อมูล |
| `multi-payer.spec.ts` | บิลหลายใบคนออกเงินคนละคน → หักกลบข้ามบิล, ทิศทางการโอน |
| `treat.spec.ts` | บิลเลี้ยง (`isTreat`) — คนจ่ายรับเต็ม คนอื่น ฿0.00 |
| `bill-issues.spec.ts` | บิลกรอกไม่ครบ — ต้องเห็นเหตุผลภาษาไทย ไม่ใช่บิลหายเงียบจากสรุป |
| `theme.spec.ts` | ธีมสว่าง/มืด — default มืด, ปุ่มสลับ (🌙/☀️) บน header ทุกหน้า, persist ข้าม reload, พื้นหลังฉากเปลี่ยนโทน |

## กฎการเขียน (ข้อควรระวังเฉพาะโปรเจกต์นี้)

- **ทุกเทสเริ่มด้วย `freshPage(page, path)`** — ล้าง localStorage ทั้ง 4 คีย์
  (`hanmao:state:v1`, `hanmao:session:v1`, `hanmao:me:v1`, `hanmao:theme:v1` — ดู `STORAGE_KEYS` ใน `helpers.ts`)
  ไม่งั้นข้อมูล/ตัวตน "ฉัน"/ธีม จากเทสก่อนค้าง (เทสธีมที่พึ่ง default=dark จะแดงมั่วถ้าคีย์ธีมค้าง)
- ยิง element ด้วย **ข้อความไทยจริงบนจอ** (`getByText`, `getByPlaceholder`); ชนกันหลายจุดใช้ `{ exact: true }` / `.first()`
- `accessibilityLabel` **ไม่ใช่ข้อความที่มองเห็น** → บน web เป็น `aria-label` ยิงด้วย
  `getByRole('button', { name: '...' })` (เช่น `pickPayer()` ใช้ label `คนออกเงิน <ชื่อ>` เลี่ยงชื่อชนกัน)
- **assert สถานะได้ด้วย `aria-*` แล้ว** — `a11y()` ใน [src/ui/index.ts](../../src/ui/index.ts) map `accessibilityState`
  ลง DOM ให้เอง (ยืนยันด้วยการรันจริงบน `dist` แล้ว ไม่ใช่จากเอกสาร):

  | element | attribute ที่ได้ | ตัวอย่าง |
  |---|---|---|
  | chip / ปุ่มเลือก (`role=button`) | `aria-pressed` | `คนออกเงิน แดง` → `"true"` / `วิธีหาร หารเท่ากัน` → `"true"` |
  | checkbox (ติ๊กโอนแล้ว, ผู้ร่วมบิล, มา-กลับ) | `aria-checked` | `ดำ โอนให้ แดง แล้ว` → `"false"` |
  | switch (บิลเลี้ยง) | `aria-checked` | `บิลนี้คนจ่ายเลี้ยง` → `"false"` |
  | ปุ่มที่ปิดใช้งาน | `aria-disabled` | ใช้ `toBeDisabled()` ได้ตรง ๆ |

  **`selected` บน `role=button` ออกมาเป็น `aria-pressed` ไม่ใช่ `aria-selected`** (ดู `a11y()` บรรทัด 79-82)
  ยัง assert ข้อความบนจอควบคู่ได้ แต่ไม่ต้องเลี่ยง attribute แล้ว
- ปุ่มลบเรียก `window.confirm` → `page.once('dialog', d => d.accept())` (หรือ `.dismiss()`) **ก่อน** คลิก
- ปุ่ม `disabled` คลิกไม่ได้ → assert `toBeDisabled()`/`toBeEnabled()`
- สลับแท็บ: ใช้ `openTab(page, 'summary')` จาก `helpers.ts` **ห้ามใช้ regex สั้น ๆ** —
  `/สรุป/` ชนทั้งแท็บ "สรุปหารเงิน…" และ "ฉัน สรุปเฉพาะของคุณ"
- **หน้าจอของแท็บที่ไม่ได้เลือกยังคาอยู่ใน DOM** (react-navigation ครอบด้วย `aria-hidden="true"`
  ไม่ unmount) → `getByText()` เจอข้อความจากแท็บก่อนหน้าด้วย และ `isVisible()` ก็ยังเป็น `true`
  เจอชนข้ามแท็บให้ใช้ `visibleText(page, '...')` ที่กรอง `aria-hidden` ออก
  (เคสจริง: หลัง `/bills` → `/summary` คำว่า "ยังไม่มีบิล" เจอ 2 ตัว)
- ยอดติดลบพิมพ์เครื่องหมายลบ**หน้า**สัญลักษณ์เงิน: `-฿50.00` (ดู `baht()`)
- **ห้ามลด assertion / ห้ามลบเทส / ห้าม `.skip` เพื่อให้เขียว** — เทสแดงเพราะแอปผิดให้รายงาน

## ขอบเขตที่เทสชุดนี้ครอบไม่ได้

- **group mode / Supabase** — ต้องมี backend จริง (Phase 2) ดู [docs/adr/0001-supabase-realtime.md](../../docs/adr/0001-supabase-realtime.md)
  build ของเทสถูกบังคับเป็น local mode ด้วย `EXPO_NO_DOTENV=1` (ดูเหตุผลใน `playwright.config.ts`)
- **geofence/location** — ซ่อนด้วย `Platform.OS !== 'web'` → เทสที่ `tests/unit/geo.test.ts` แทน
- **แชร์รูปบน native** — เทสได้แค่สถานะปุ่ม (disabled/enabled) บน web
