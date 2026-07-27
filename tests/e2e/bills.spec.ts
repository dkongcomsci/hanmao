import { expect, test } from '@playwright/test';
import { addMember, freshPage } from './helpers';

test.describe('หน้าบิล (bills + bill detail)', () => {
  test('สร้างบิลใหม่แล้วเข้าหน้ารายละเอียด', async ({ page }) => {
    await freshPage(page, '/bills');
    await page.getByPlaceholder(/ชื่อบิล/).fill('บิลร้านหมูกระทะ');
    await page.getByText(/สร้างบิล|เพิ่มบิล/).first().click();
    // เข้าหน้ารายละเอียด → เห็นหัวข้อ "วิธีหาร"
    await expect(page.getByText('วิธีหาร')).toBeVisible();
  });

  test('เพิ่มเมนูในบิลได้', async ({ page }) => {
    // เตรียมสมาชิกก่อน
    await freshPage(page, '/members');
    await addMember(page, 'สมหญิง');

    await page.goto('/bills');
    await page.waitForLoadState('networkidle');
    await page.getByPlaceholder(/ชื่อบิล/).fill('บิลชาบู');
    await page.getByText(/สร้างบิล|เพิ่มบิล/).first().click();
    await expect(page.getByPlaceholder('ชื่อเมนู')).toBeVisible();

    await page.getByPlaceholder('ชื่อเมนู').fill('เนื้อสไลด์');
    await page.getByPlaceholder('ราคา').fill('299');
    await page.getByText('+', { exact: true }).click();
    await expect(page.getByText('เนื้อสไลด์')).toBeVisible();
  });

  test('เลือกคนจ่ายบิลได้', async ({ page }) => {
    await freshPage(page, '/members');
    await addMember(page, 'ปิติ');

    await page.goto('/bills');
    await page.waitForLoadState('networkidle');
    await page.getByPlaceholder(/ชื่อบิล/).fill('บิลกาแฟ');
    await page.getByText(/สร้างบิล|เพิ่มบิล/).first().click();
    await expect(page.getByText('ใครออกเงินบิลนี้')).toBeVisible();
    // กด chip ชื่อ ปิติ ใต้หัวข้อคนจ่าย
    await page.getByText('ปิติ').first().click();
    // ยังอยู่หน้าเดิม ไม่ error
    await expect(page.getByText('ใครออกเงินบิลนี้')).toBeVisible();
  });
});
