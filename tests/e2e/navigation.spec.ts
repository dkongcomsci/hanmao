import { expect, test } from '@playwright/test';
import { freshPage } from './helpers';

test.describe('Navigation + onboarding', () => {
  test('หน้าแรกแสดง onboarding 3 ขั้นตอนเมื่อยังว่าง', async ({ page }) => {
    await freshPage(page, '/');
    await expect(page.getByText('เริ่มใช้งานใน 3 ขั้น 👋')).toBeVisible();
    await expect(page.getByText('เพิ่มสมาชิก', { exact: true })).toBeVisible();
    await expect(page.getByText('สร้างบิล', { exact: true })).toBeVisible();
    await expect(page.getByText('ดูสรุป', { exact: true })).toBeVisible();
  });

  test('ปุ่มเริ่มเลยพาไปหน้าสมาชิก', async ({ page }) => {
    await freshPage(page, '/');
    await page.getByRole('button', { name: 'เริ่มต้น ไปหน้าเพิ่มสมาชิก' }).click();
    await expect(page.getByPlaceholder('ชื่อสมาชิก')).toBeVisible();
  });

  test('แท็บด้านล่างสลับหน้าได้', async ({ page }) => {
    await freshPage(page, '/');
    // แท็บใช้ role=tab หรือ button ตาม platform → หาแบบ getByRole tab ก่อน
    await page.getByRole('tab', { name: /บิล/ }).click();
    await expect(page.getByPlaceholder(/ชื่อบิล/)).toBeVisible();

    await page.getByRole('tab', { name: /สมาชิก/ }).click();
    await expect(page.getByPlaceholder('ชื่อสมาชิก')).toBeVisible();
  });
});
