import { Page, expect, test } from '@playwright/test';
import { freshPage, openTab } from './helpers';

/**
 * ธีมสว่าง/มืด + ปุ่มสลับธีมบน header ทุกหน้า
 *
 * ยืนยันจาก "สิ่งที่ผู้ใช้เห็นจริง" 2 ทาง:
 * - ปุ่มสลับธีม (aria-label="สลับธีม") แสดง emoji บอกธีมปัจจุบัน: มืด = 🌙, สว่าง = ☀️
 * - พื้นหลังฉากจริง (scene bg) เปลี่ยนโทน มืด/สว่าง — อ่านจาก computed backgroundColor
 *
 * ยืนยันด้วยการรันจริงบน dist:
 * - default (dark) scene bg = rgb(15, 17, 21)  (darkColors.bg #0f1115)
 * - light scene bg          = rgb(244, 246, 250) (lightColors.bg #f4f6fa)
 * เพื่อไม่ผูก hex เป๊ะ (เปราะ) ใช้เกณฑ์ผลรวม rgb: มืด = ต่ำ, สว่าง = สูง
 */

/** ผลรวม r+g+b ของพื้นหลังฉากที่ผู้ใช้เห็น (div ที่มีพื้นที่มากสุดและมีสีพื้น) */
async function appBgSum(page: Page): Promise<number> {
  const rgb: string | null = await page.evaluate(() => {
    let best: string | null = null;
    let bestArea = 0;
    document.querySelectorAll('div').forEach((e) => {
      const bg = getComputedStyle(e).backgroundColor;
      if (!bg || bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent') return;
      const r = e.getBoundingClientRect();
      const area = r.width * r.height;
      if (area > bestArea) {
        bestArea = area;
        best = bg;
      }
    });
    return best;
  });
  expect(rgb, 'ต้องเจอพื้นหลังฉากที่มีสีพื้น').not.toBeNull();
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(String(rgb));
  expect(m, `parse สีไม่ได้: ${rgb}`).not.toBeNull();
  return Number(m![1]) + Number(m![2]) + Number(m![3]);
}

/** เกณฑ์แบ่งมืด/สว่าง — dark bg รวม ~53, light bg รวม ~740 → 400 อยู่กลางห่างทั้งสองฝั่ง */
const BRIGHT_THRESHOLD = 400;

const themeBtn = (page: Page) => page.getByRole('button', { name: 'สลับธีม' });

test.describe('ธีม: default มืด + สลับ + persist', () => {
  test('เปิดแอปครั้งแรก → default เป็นธีมมืด (ปุ่มขึ้น 🌙 + พื้นหลังมืด)', async ({ page }) => {
    await freshPage(page, '/');

    await expect(themeBtn(page)).toHaveText('🌙');
    expect(await appBgSum(page)).toBeLessThan(BRIGHT_THRESHOLD);
  });

  test('กดปุ่มสลับ → เปลี่ยนเป็นธีมสว่าง (ปุ่มขึ้น ☀️ + พื้นหลังสว่าง)', async ({ page }) => {
    await freshPage(page, '/');
    expect(await appBgSum(page)).toBeLessThan(BRIGHT_THRESHOLD);

    await themeBtn(page).click();

    await expect(themeBtn(page)).toHaveText('☀️');
    expect(await appBgSum(page)).toBeGreaterThan(BRIGHT_THRESHOLD);
  });

  test('สลับสว่าง → มืด ได้อีกครั้ง (ปุ่มกลับเป็น 🌙 + พื้นหลังมืด)', async ({ page }) => {
    await freshPage(page, '/');

    await themeBtn(page).click();
    await expect(themeBtn(page)).toHaveText('☀️');

    await themeBtn(page).click();
    await expect(themeBtn(page)).toHaveText('🌙');
    expect(await appBgSum(page)).toBeLessThan(BRIGHT_THRESHOLD);
  });

  test('สลับเป็นสว่างแล้ว reload → ธีมยังเป็นสว่าง (persist ข้าม reload)', async ({ page }) => {
    await freshPage(page, '/');

    await themeBtn(page).click();
    await expect(themeBtn(page)).toHaveText('☀️');

    // reload ตรง ๆ — ห้าม freshPage เพราะจะล้าง localStorage ทำให้ persist ทดสอบไม่ได้
    await page.reload();
    await page.waitForLoadState('networkidle');

    await expect(themeBtn(page)).toHaveText('☀️');
    expect(await appBgSum(page)).toBeGreaterThan(BRIGHT_THRESHOLD);
  });
});

test.describe('ธีม: ปุ่มสลับขึ้นทุกหน้า', () => {
  test('ปุ่มสลับธีมอยู่บน header ของทุกแท็บ', async ({ page }) => {
    await freshPage(page, '/');
    await expect(themeBtn(page)).toBeVisible();

    for (const tab of ['members', 'bills', 'summary', 'me'] as const) {
      await openTab(page, tab);
      await expect(themeBtn(page), `ปุ่มสลับธีมต้องอยู่บนแท็บ ${tab}`).toBeVisible();
    }
  });

  test('สลับธีมในแท็บหนึ่ง → คงอยู่เมื่อสลับไปแท็บอื่น (ธีมเป็น global)', async ({ page }) => {
    await freshPage(page, '/');

    await openTab(page, 'members');
    await themeBtn(page).click();
    await expect(themeBtn(page)).toHaveText('☀️');
    expect(await appBgSum(page)).toBeGreaterThan(BRIGHT_THRESHOLD);

    await openTab(page, 'bills');
    await expect(themeBtn(page)).toHaveText('☀️');
    expect(await appBgSum(page)).toBeGreaterThan(BRIGHT_THRESHOLD);
  });
});
