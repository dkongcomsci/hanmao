import { expect, test } from '@playwright/test';
import { addMember, freshPage } from './helpers';

test.describe('หน้าสรุป (summary)', () => {
  test('แสดงส่วนแยกตามบิล + ยอดต่อคนในบิล + คนจ่าย', async ({ page }) => {
    // เตรียมสมาชิก 2 คน
    await freshPage(page, '/members');
    await addMember(page, 'แดง');
    await addMember(page, 'ดำ');

    // สร้างบิล + เพิ่มเมนู
    await page.goto('/bills');
    await page.waitForLoadState('networkidle');
    await page.getByPlaceholder(/ชื่อบิล/).fill('บิลข้าวมันไก่');
    await page.getByText(/สร้างบิล|เพิ่มบิล/).first().click();
    await expect(page.getByPlaceholder('ชื่อเมนู')).toBeVisible();
    await page.getByPlaceholder('ชื่อเมนู').fill('ข้าวมันไก่');
    await page.getByPlaceholder('ราคา').fill('100');
    await page.getByText('+', { exact: true }).click();
    await expect(page.getByText('ข้าวมันไก่', { exact: true })).toBeVisible();

    // เลือกคนจ่าย = แดง
    await page.getByText('แดง').first().click();

    // ไปหน้าสรุป
    await page.goto('/summary');
    await page.waitForLoadState('networkidle');

    // เห็นหัวข้อแยกตามบิล + ชื่อบิล
    await expect(page.getByText('แยกตามบิล')).toBeVisible();
    await expect(page.getByText('บิลข้าวมันไก่')).toBeVisible();

    // เห็น meta ว่าใครออกเงิน
    await expect(page.getByText(/ออกเงิน: แดง/)).toBeVisible();

    // เห็นชื่อสมาชิกทั้งสองในบิล + tag คนจ่าย
    await expect(page.getByText(/แดง \(คนจ่าย\)/)).toBeVisible();
    await expect(page.getByText('ดำ', { exact: true }).first()).toBeVisible();

    // หาร 100 บาทเท่ากัน 2 คน = คนละ 50
    await expect(page.getByText('฿50.00').first()).toBeVisible();
  });

  test('บอกเมื่อยังไม่มีบิล', async ({ page }) => {
    await freshPage(page, '/summary');
    await expect(page.getByText('แยกตามบิล')).toBeVisible();
    await expect(page.getByText('ยังไม่มีบิล')).toBeVisible();
  });
});
