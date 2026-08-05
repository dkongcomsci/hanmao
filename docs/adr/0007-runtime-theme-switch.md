# ADR 0007 — สลับธีมสว่าง/มืดตอน runtime (palette 2 ชุด + `useTheme` + `makeStyles`)

- สถานะ: Accepted
- วันที่: 2026-08-01

## บริบท

แอปมีธีมมืดชุดเดียวมาตั้งแต่ต้น สีทั้งหมดอยู่ใน `colors` (object เดียว) ใน `src/ui/index.ts`
และทุกหน้าประกาศ `StyleSheet.create({...})` **ระดับ module** โดยอ้าง `colors.xxx` ตรง ๆ

ต้องการให้ผู้ใช้สลับธีมสว่าง/มืดได้ตอน runtime (ปุ่มบน header) — ติดสองข้อ:

1. **`StyleSheet.create` ระดับ module แช่แข็งสีตอน import** — สไตล์ถูกสร้างครั้งเดียวตอนโหลดโมดูล
   ค่าสีถูกฝังเป็นค่าคงที่ ณ ตอนนั้น สลับ palette ตอน runtime แล้วสไตล์ไม่อัปเดตตาม
2. **ถ้าให้ hook ธีมอยู่ใน `src/ui/index.ts`** ตัว hook ต้อง `import { useStore }` จาก `src/data/store`
   ซึ่งลากโซ่ `store → supabase → react-native-url-polyfill` (แตะ `BlobModule`) เข้ามา
   ⇒ unit test ที่ import `src/ui` เพื่อทดสอบ `baht()`/`a11y()` จะ crash ทั้งไฟล์ (index.ts ต้องคง pure)

นอกจากนี้ธีมเป็น **ความชอบของเครื่อง (device preference)** ไม่ใช่ข้อมูลของกลุ่ม —
ไม่ควรอยู่ใน `AppState` และไม่ควร sync ขึ้น Supabase (คนในกลุ่มเดียวกันอาจชอบธีมคนละแบบ)

## การตัดสินใจ

- **palette 2 ชุดใน `src/ui/index.ts`** ที่มี key ครบเท่ากันทุกตัว:
  `darkColors` (= ค่าเดิมทั้งหมด เป็น default หน้าตาต้องเหมือนเดิมเป๊ะ) และ `lightColors`
  ประกาศ `type Palette = typeof darkColors` เพื่อบังคับให้ทั้งสองชุดมี key ตรงกัน
  คง `export const colors = darkColors` ไว้เพื่อ backward-compat
  - **`surfaceLight` (#ffffff) / `onLight` (#0b0d10) เท่ากันทั้งสองธีมโดยเจตนา** —
    เป็นพื้นสว่างที่ต้องสว่างจริงเสมอ (พื้น QR ต้องสแกนติด) และการ์ด `shareCard` ที่ export เป็นรูป
    ต้องอ่านออกทั้งสองธีม เพราะรูปถูกส่งต่อในกลุ่มแชทโดยไม่รู้ธีมของคนรับ (โยง [ADR 0004](0004-no-promptpay-in-shared-image.md))
- **hook `useTheme()` แยกไปไฟล์ใหม่ `src/ui/theme.ts`** (ไม่อยู่ใน index.ts) —
  ห่อ `useStore()` คืน `{ colors: Palette; theme; toggleTheme; setTheme }`
  โดยเลือก palette ตาม `theme` ใน store. แยกออกมาเพื่อให้ `src/ui/index.ts` คง pure
  (import แค่ expo-clipboard + react-native) ⇒ unit test import `src/ui` ได้โดยไม่ลากโซ่ store→supabase มา crash
  palette + `type Palette` ยังอยู่ที่ index.ts (ค่าคงที่ pure) — theme.ts import ไปใช้ (index.ts ต้องไม่ import จาก theme.ts กัน circular)
- **style เป็น factory `makeStyles(c: Palette)`** แทน `StyleSheet.create` ระดับ module —
  แต่ละ component เรียก `const s = useMemo(() => makeStyles(c), [c])` ต่อ render
  ⇒ สลับธีมแล้ว `c` เปลี่ยน → `useMemo` สร้างสไตล์ชุดใหม่ตามสีปัจจุบัน
- **theme เป็น device preference ใน store**: `theme: 'light' | 'dark'` (default `'dark'`) +
  `toggleTheme()` + `setTheme(t)` เป็น state แยกใน `StoreProvider` **ไม่อยู่ใน `AppState`, ไม่ sync ขึ้น Supabase**
  persist ลง **คีย์ที่ 4 `hanmao:theme:v1`** (เก็บ string `'light'`/`'dark'` ตรง ๆ) แยกจาก 3 คีย์เดิม
  เขียนทุกโหมด (ไม่รอ local/group) เพราะเป็นความชอบของเครื่อง
- **ปุ่มสลับธีมเป็น `headerRight`** ของ `Tabs.screenOptions` ใน `_layout.tsx` (ขึ้นทุกหน้า)
  `accessibilityLabel="สลับธีม"`, ไอคอน 🌙 (มืด) / ☀️ (สว่าง); StatusBar ปรับตามธีม
  `RootLayout` แยก inner component ไว้ใต้ `StoreProvider` เพื่อเรียก `useTheme()` ได้
- **default มืด, ไม่มีโหมด auto** (ไม่ตามระบบ) — มีแค่ 2 สถานะ ผู้ใช้เป็นคนสลับเอง

## ผลที่ตามมา

- **ทุกหน้า (8 หน้า) + `_layout.tsx` ต้องเรียก `useTheme()` + `useMemo(() => makeStyles(c), [c])`** —
  คนที่เพิ่มหน้าใหม่ต้องทำตามแพทเทิร์นนี้ **ห้าม `StyleSheet.create` ระดับ module ด้วยสีธีม** (จะแช่แข็งสี สลับไม่ได้)
- **`surfaceLight`/`onLight` ต้องคงเท่ากันสองธีมเสมอ** — ถ้าเผลอทำให้ต่างกัน การ์ดที่แชร์/พื้น QR จะอ่านไม่ออกในบางธีม
- **เพิ่มคีย์ persist ที่ 4** — helper ของเทส (`STORAGE_KEYS`) ต้องล้าง `hanmao:theme:v1` ด้วย
  ไม่งั้นธีมจากเทสก่อนค้าง ทำให้เทสที่คาด default=dark แดงมั่ว
- `src/ui/index.ts` ต้องคง pure ตลอดไป (ห้าม import store/react) — hook ที่พึ่ง store ไปอยู่ `src/ui/theme.ts` เท่านั้น
- E2E ครอบพฤติกรรมนี้ (`theme.spec.ts`): default มืด / สลับได้ / persist ข้าม reload / ปุ่มขึ้นทุกหน้า
