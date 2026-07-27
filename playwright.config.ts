import { defineConfig, devices } from '@playwright/test';

/**
 * ทดสอบ E2E บน web build ของ hanmao
 * รัน: npm run test:e2e (จะ build web + start server ให้อัตโนมัติ)
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
  // build web แล้ว serve dist ก่อนรันเทส
  webServer: {
    command: 'npx expo export --platform web && npx serve -s dist -l 4599',
    url: 'http://localhost:4599',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
