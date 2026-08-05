# src/ui

ชั้นการแสดงผลที่ใช้ร่วมกันทุกหน้า (presentation layer) — ไม่มี business logic

- `index.ts` — **pure module** (import แค่ expo-clipboard + react-native; ห้าม import store/react เพราะจะลาก native module มาจน unit test crash)
  - palette 2 ชุด key ครบเท่ากัน (`bg`, `card`, `cardAlt`, `border`, `text`, `sub`, `primary`, `food`, `drink`, `danger`, `good`, `onPrimary`, `surfaceLight`, `onLight`):
    `darkColors` (= ค่าเดิม, default) + `lightColors`; `type Palette = typeof darkColors`; `colors = darkColors` (backward-compat)
    `surfaceLight`(#ffffff)/`onLight`(#0b0d10) **เท่ากันทั้งสองธีม** เพราะพื้น QR ต้องสแกนติด + การ์ด shareCard ต้องอ่านออกทั้งสองธีม
  - แสดงผล: `baht()`, `timeStr()`; a11y: `a11y(role, state?)`
  - label ภาษาไทย: `consumesLabel`, `categoryLabel`, `splitModeLabel`
  - ยืนยัน/แจ้งเตือน: `confirmRemove(name, onConfirm)` (การลบ), `confirmAction({ title, message, confirmLabel, onConfirm })`
    (ยืนยันที่ต้องเขียนข้อความเอง เช่น ปิดวง), `notify(title, message?)`
  - error: `friendlyError(e, fallback)` แปลง error เป็นข้อความไทยที่ผู้ใช้อ่านรู้เรื่อง
  - อื่น ๆ: `copyText()`, `digitsOnly()`, `isValidPromptPay()`, `formatPromptPay()`
- `theme.ts` — hook `useTheme()` (ห่อ `useStore`) คืน `{ colors: Palette; theme; toggleTheme; setTheme }`
  แยกจาก `index.ts` เพื่อคง index.ts pure (theme.ts พึ่ง store, index.ts ไม่พึ่ง) — ดู [ADR 0007](../../docs/adr/0007-runtime-theme-switch.md)
- `share.ts` — `shareViewAsImage(viewRef, fileName?)` จับภาพ View เป็น PNG
  (web: ดาวน์โหลดผ่าน `<a download>` · native: share sheet ด้วย `expo-sharing`)

## กติกา

- สีทุกที่ต้องมาจาก palette ปัจจุบันผ่าน `useTheme()` (`c.xxx`) + สไตล์ผ่าน factory `makeStyles(c)` + `useMemo` ต่อ render
  อย่า hardcode hex และอย่า `StyleSheet.create` ระดับ module ด้วยสีธีม (แช่แข็งสี สลับไม่ได้); แสดงเงินด้วย `baht()` เสมอ
- การลบต้องผ่าน `confirmRemove` ไม่ลบทันที; error ต้องขึ้นให้เห็นผ่าน `friendlyError` + `notify` ห้ามกลืนเงียบ
- การ์ดที่ถูกจับภาพแชร์ **ห้ามมีข้อมูลส่วนบุคคล** (เช่น เบอร์พร้อมเพย์) — ดู [ADR 0004](../../docs/adr/0004-no-promptpay-in-shared-image.md)
