import { expect, test } from '@playwright/test';
import { addMember, freshPage } from './helpers';

test.describe('แท็บ "ฉัน" (สรุปของฉันคนเดียว)', () => {
  test.beforeEach(async ({ page }) => {
    // ล้าง "ฉันคือใคร" ที่จำไว้ ให้เริ่มสะอาด
    await page.goto('/');
    await page.evaluate(() => window.localStorage.removeItem('hanmao:me:v1'));
  });

  test('ยังไม่มีสมาชิก → ชวนไปเพิ่มสมาชิก', async ({ page }) => {
    await freshPage(page, '/me');
    await expect(page.getByText('ยังไม่มีสมาชิก')).toBeVisible();
    await expect(page.getByText('ไปเพิ่มสมาชิก')).toBeVisible();
  });

  test('เลือกว่าฉันคือใคร แล้วเห็นสรุปเฉพาะของฉัน', async ({ page }) => {
    // เตรียมสมาชิก 2 คน + บิลหาร 100 เท่ากัน คนจ่าย = แดง
    await freshPage(page, '/members');
    await addMember(page, 'แดง');
    await addMember(page, 'ดำ');

    await page.goto('/bills');
    await page.waitForLoadState('networkidle');
    await page.getByPlaceholder(/ชื่อบิล/).fill('บิลข้าวมันไก่');
    await page.getByText(/สร้างบิล|เพิ่มบิล/).first().click();
    await expect(page.getByPlaceholder('ชื่อเมนู')).toBeVisible();
    await page.getByPlaceholder('ชื่อเมนู').fill('ข้าวมันไก่');
    await page.getByPlaceholder('ราคา').fill('100');
    await page.getByText('+', { exact: true }).click();
    await expect(page.getByText('ข้าวมันไก่', { exact: true })).toBeVisible();
    await page.getByText('แดง').first().click(); // คนจ่าย = แดง

    // ไปแท็บฉัน → ยังไม่ได้เลือก → ต้องถามว่าคุณคือใคร
    await page.goto('/me');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('คุณคือใคร?')).toBeVisible();

    // เลือก "ดำ" (คนที่ไม่ได้จ่าย → ต้องโอนให้แดง)
    await page.getByText('ดำ', { exact: true }).first().click();

    // เห็นชื่อฉัน + ยอดที่ฉันต้องจ่าย = 50 (หาร 100 สองคน)
    await expect(page.getByText('ยอดที่ฉันต้องจ่ายรวม', { exact: false })).toBeVisible();
    await expect(page.getByText('฿50.00').first()).toBeVisible();

    // ดำต้องโอนให้แดง 50 → อยู่ใต้ "ฉันต้องโอนให้ใคร"
    await expect(page.getByText('ฉันต้องโอนให้ใคร')).toBeVisible();
    await expect(page.getByText('แดง').first()).toBeVisible();

    // เห็นบิลที่ฉันร่วม
    await expect(page.getByText('บิลข้าวมันไก่')).toBeVisible();
  });

  test('ปุ่ม "เปลี่ยน" กลับไปเลือกคนใหม่ได้', async ({ page }) => {
    await freshPage(page, '/members');
    await addMember(page, 'แดง');

    await page.goto('/me');
    await page.waitForLoadState('networkidle');
    await page.getByText('แดง', { exact: true }).first().click();
    await expect(page.getByText('เปลี่ยน')).toBeVisible();

    await page.getByText('เปลี่ยน').click();
    await expect(page.getByText('คุณคือใคร?')).toBeVisible();
  });
});
