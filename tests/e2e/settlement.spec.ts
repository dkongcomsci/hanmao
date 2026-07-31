import { expect, test } from '@playwright/test';
import { addMember, freshPage } from './helpers';

/** เตรียม: 2 สมาชิก + 1 บิล 100 บาท จ่ายโดยแดง → ดำติดแดง 50 (1 รายการโอน) */
async function setupOneTransfer(page: import('@playwright/test').Page) {
  await freshPage(page, '/members');
  await addMember(page, 'แดง');
  await addMember(page, 'ดำ');

  await page.goto('/bills');
  await page.waitForLoadState('networkidle');
  await page.getByPlaceholder(/ชื่อบิล/).fill('บิลหมูกระทะ');
  await page.getByText(/สร้างบิล|เพิ่มบิล/).first().click();
  await expect(page.getByPlaceholder('ชื่อเมนู')).toBeVisible();
  await page.getByPlaceholder('ชื่อเมนู').fill('หมู');
  await page.getByPlaceholder('ราคา').fill('100');
  await page.getByText('+', { exact: true }).click();
  await expect(page.getByText('หมู', { exact: true })).toBeVisible();
  // เลือกคนจ่าย = แดง (chip แรกใต้หัวข้อ "ใครออกเงินบิลนี้")
  await page.getByText('แดง').first().click();
}

test.describe('Checklist โอนแล้ว + เคลียร์เมื่อจ่ายครบ', () => {
  test('ติ๊กว่าโอนแล้ว → progress เพิ่ม + ปุ่มเคลียร์โผล่เมื่อครบ', async ({ page }) => {
    await setupOneTransfer(page);
    await page.goto('/summary');
    await page.waitForLoadState('networkidle');

    // มี 1 รายการโอน ยังไม่ติ๊ก
    await expect(page.getByText('โอนแล้ว 0/1 รายการ')).toBeVisible();
    await expect(page.getByText('จ่ายครบทุกคนแล้ว!')).toHaveCount(0);

    // ติ๊กว่าโอนแล้ว
    await page.getByText('ยังไม่โอน — แตะเมื่อโอนแล้ว').click();
    await expect(page.getByText('โอนแล้ว 1/1 รายการ')).toBeVisible();
    await expect(page.getByText('✓ โอนแล้ว')).toBeVisible();

    // จ่ายครบ → เห็นกล่องสำเร็จ + ปุ่มเคลียร์
    await expect(page.getByText('จ่ายครบทุกคนแล้ว!')).toBeVisible();
    await expect(page.getByText('เคลียร์ทั้งหมด')).toBeVisible();
  });

  test('ยกเลิกติ๊กได้ → กล่องสำเร็จหายไป', async ({ page }) => {
    await setupOneTransfer(page);
    await page.goto('/summary');
    await page.waitForLoadState('networkidle');

    await page.getByText('ยังไม่โอน — แตะเมื่อโอนแล้ว').click();
    await expect(page.getByText('จ่ายครบทุกคนแล้ว!')).toBeVisible();

    // แตะซ้ำเพื่อยกเลิก
    await page.getByText('✓ โอนแล้ว').click();
    await expect(page.getByText('โอนแล้ว 0/1 รายการ')).toBeVisible();
    await expect(page.getByText('จ่ายครบทุกคนแล้ว!')).toHaveCount(0);
  });

  test('กดเคลียร์ทั้งหมด (ยืนยัน) → ล้างบิล/สมาชิกทั้งหมด', async ({ page }) => {
    await setupOneTransfer(page);
    await page.goto('/summary');
    await page.waitForLoadState('networkidle');
    await page.getByText('ยังไม่โอน — แตะเมื่อโอนแล้ว').click();

    // ยืนยัน dialog (web = window.confirm)
    page.once('dialog', (d) => d.accept());
    await page.getByText('เคลียร์ทั้งหมด').click();

    // ยอดรวมกลับเป็น 0 + ไม่มีบิล
    await expect(page.getByText('฿0.00').first()).toBeVisible();
    await expect(page.getByText('ยังไม่มีบิล')).toBeVisible();

    // ไปหน้าสมาชิก: ต้องว่าง
    await page.goto('/members');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('ยังไม่มีสมาชิก')).toBeVisible();
  });

  test('แท็บฉัน: ติ๊กว่าโอนแล้วได้ + sync กับหน้าสรุป', async ({ page }) => {
    await setupOneTransfer(page);
    // เลือกว่าฉันคือ ดำ (คนที่ต้องโอน)
    await page.goto('/me');
    await page.evaluate(() => window.localStorage.removeItem('hanmao:me:v1'));
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.getByText('ดำ', { exact: true }).first().click();

    // เห็นรายการ "ฉันต้องโอนให้ใคร" + ติ๊ก
    await expect(page.getByText('ฉันต้องโอนให้ใคร')).toBeVisible();
    await page.getByText('ยังไม่โอน — แตะเมื่อโอนแล้ว').click();
    await expect(page.getByText('✓ โอนแล้ว')).toBeVisible();

    // ข้ามไปหน้าสรุป → ต้องเห็นว่าโอนครบแล้วเช่นกัน
    await page.goto('/summary');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('โอนแล้ว 1/1 รายการ')).toBeVisible();
  });
});
