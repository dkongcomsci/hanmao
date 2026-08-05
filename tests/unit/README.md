# tests/unit

Unit test ของ **logic ล้วน** (`src/domain/**`, `src/utils/**`, `src/ui/index.ts`)
รัน: `npm run test:unit` — แยกจาก `npm run test:e2e` โดยสิ้นเชิง (ไม่ต้อง build web/เปิด server)

## ทำไมไม่ใช้ Playwright ครอบ

`src/domain/split.ts` เป็นหัวใจการคิดเงิน มีเคสขอบเยอะ (ปัดสตางค์, หารไม่ลงตัว, บิลเลี้ยง,
ไม่มีใครเข้าเงื่อนไข) ที่ยิงผ่านจอไม่ครบและช้ามาก — เทสตรงที่ฟังก์ชันเร็วกว่า/ครอบได้ละเอียดกว่า
ส่วน helper อย่าง `baht(-0)` / `friendlyError` / `confirmAction` เห็นผลบนจอแค่ทางอ้อม

## Runner: `node:test` + `tsx` (ไม่ใช่ jest/vitest)

เลือกเพราะ **เบาสุดและไม่ชนกับ Playwright**:

- `node:test` มากับ node เอง ไม่ต้องลง test framework
- ต้องมี `tsx` แค่ตัวเดียว (esbuild) เพื่อรัน TypeScript ตรง ๆ — ล็อกเวอร์ชันเป๊ะไว้ใน devDependencies
- ไม่มีไฟล์ config, ไม่แตะ `playwright.config.ts`, ไม่ชนกับ `expect` ของ Playwright
  (jest/vitest จะดึง dependency มาอีกหลายสิบตัว + ต้องตั้ง transform ให้ react-native)

## `reg.ts` — stub โมดูล native

`src/ui/index.ts` import `react-native` (Flow syntax) กับ `expo-clipboard` ซึ่ง esbuild parse ไม่ได้
และไม่มีความหมายบน node → `reg.ts` ใช้ `module.registerHooks` เปลี่ยน resolve ไปที่ `stubs/`

- `stubs/react-native.ts` — `Platform.OS = 'web'` (ทดสอบ web path ของ `notify`/`confirmAction`)
- `stubs/expo-clipboard.ts` — `setStringAsync` คืนสำเร็จ (ทดสอบทางสำรองของ `copyText`)

จะเทสโมดูลที่ import native เพิ่ม ให้เพิ่ม stub แล้วลงทะเบียนใน `reg.ts`

## ข้อกำหนดการเขียน

- **ห้ามใช้ `Date.now()`** — ส่งเวลาอ้างอิงเข้าทาง `asOf` เสมอ (ค่าคงที่ `T0` ใน `split.test.ts`)
  ไม่งั้นเทสบิลโหมด `time` จะ flaky
- **ห้ามใช้ `Math.random()`** — เทสแบบสุ่ม/invariant ให้ใช้ `mulberry32(seed)` ใน `split.test.ts`
  (PRNG 4 บรรทัด, seed คงที่) เพื่อให้ทุกเครื่อง/ทุกรอบได้ชุดข้อมูลเดียวกัน
  เทสที่แดงจึง reproduce ได้จริง ไม่ใช่ "บางรอบผ่านบางรอบไม่ผ่าน"
- ชื่อ `test()` เป็นภาษาไทยบอกพฤติกรรมที่คาดหวัง (เหมือน E2E)
- บั๊กที่ยังแก้ไม่ได้ (อยู่นอกขอบเขต) ให้คง assertion เต็มไว้ + ทำเครื่องหมาย
  `test('...', { todo: 'อธิบายบั๊ก + ไฟล์ที่ต้องแก้' }, ...)` ของ `node:test`
  → รายงานเป็น `todo` ไม่ทำให้ชุดเทสแดง แต่ไม่ได้ลบ assertion ทิ้ง
  **ห้ามใช้ `test.skip` หรือลดเงื่อนไขเพื่อให้เขียว**
