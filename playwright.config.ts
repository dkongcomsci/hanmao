import { defineConfig, devices } from '@playwright/test';

/**
 * ทดสอบ E2E บน web build ของ hanmao
 * รัน: npm run test:e2e (จะ build web + start server ให้อัตโนมัติ)
 *
 * ## ทำไม build ด้วย EXPO_NO_DOTENV=1 --clear
 * เทสชุดนี้ครอบ **local mode** (state ใน localStorage) เท่านั้น
 * ถ้าเครื่องผู้ใช้มี .env ที่ตั้ง EXPO_PUBLIC_SUPABASE_* ไว้จริง Expo จะ inline ค่านั้นเข้า bundle
 * → `supabase` ใน src/data/supabase.ts ไม่เป็น null → store พยายามกลับเข้าวงเดิม/ยิง network
 * → เทสที่พึ่ง localStorage กลายเป็นแดง/flaky บนเครื่องผู้ใช้ แต่เขียวบน CI (ที่ไม่มี .env)
 *
 * - `EXPO_NO_DOTENV=1` สั่ง @expo/env ข้ามการอ่านไฟล์ .env ทั้งหมด
 * - `--clear` **จำเป็น**: ยืนยันด้วยการรันจริงแล้วว่า EXPO_NO_DOTENV เพียงตัวเดียวไม่พอ —
 *   Metro transform cache จะเสิร์ฟ module ที่ inline ค่า env รอบก่อนกลับมา
 *   (ตรวจโดย grep หา Supabase URL ใน dist/_expo/static/js/web/*.js: ไม่ใส่ --clear = เจอ, ใส่ = ไม่เจอ)
 *
 * ## ทำไม serve ด้วย tests/server/static.mjs
 * เดิมใช้ `npx serve -s dist` แต่ `serve` ไม่ได้อยู่ใน devDependencies → เครื่องที่ไม่มี cache
 * จะดึงเวอร์ชันสุ่ม (หรือพังตอนออฟไลน์). `npx expo serve dist` ที่มีอยู่แล้วก็ใช้แทนไม่ได้
 * เพราะตอบ 404 บน deep route (/summary, /bill/xyz) ที่เทสเรียก page.goto() ตรง ๆ
 * → เขียน static server เองด้วย node:http (ศูนย์ dependency) + SPA fallback
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4599',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // build web (ไม่เอา .env) แล้ว serve dist ก่อนรันเทส
  webServer: {
    command:
      'EXPO_NO_DOTENV=1 npx expo export --platform web --clear && node tests/server/static.mjs dist 4599',
    url: 'http://localhost:4599',
    // build ใหม่เสมอ: server ที่ค้างอยู่อาจ serve bundle ที่ inline env จาก .env ไว้
    reuseExistingServer: false,
    timeout: 300_000,
  },
});
