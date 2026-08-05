import { expect, test, type Page } from '@playwright/test';
import { addItem, addMember, createBill, freshPage, pickMe, pickPayer } from './helpers';

/**
 * `paidById` ต่างกันคนละบิล = requirement หลักของโปรเจกต์ (ดู CLAUDE.md)
 * เทสชุดนี้พิสูจน์ว่ายอดสรุป/settle-up คิดจาก "คนออกเงินของแต่ละบิล" จริง ไม่ใช่คนเดียวทั้งวง
 *
 * เลขที่คาดหวัง (สมาชิก 2 คน consumes=both, บิลหมวดอาหาร, หารเท่ากัน):
 *   บิล A 100฿ จ่ายโดยแดง → แดง 50, ดำ 50
 *   บิล B  60฿ จ่ายโดยดำ  → แดง 30, ดำ 30
 *   ยอดรวม 160฿ · ต้องจ่ายรวมคนละ 80฿
 *   สุทธิ: แดง ออก 100 รับผิดชอบ 80 = +20 · ดำ ออก 60 รับผิดชอบ 80 = -20
 *   settle-up = ดำ → แดง 20฿ (รายการเดียว)
 */
async function setupTwoPayers(page: Page) {
  await freshPage(page, '/members');
  await addMember(page, 'แดง');
  await addMember(page, 'ดำ');

  await createBill(page, 'บิลข้าวมันไก่');
  await addItem(page, 'ข้าวมันไก่', '100');
  await pickPayer(page, 'แดง');

  await createBill(page, 'บิลกาแฟ');
  await addItem(page, 'ลาเต้', '60');
  await pickPayer(page, 'ดำ');
}

test.describe('บิลหลายใบ คนออกเงินคนละคน (multi-payer)', () => {
  test('หน้าสรุปแสดงคนออกเงินแยกตามบิล + ยอดต่อคนในแต่ละบิลถูกต้อง', async ({ page }) => {
    await setupTwoPayers(page);
    await page.goto('/summary');
    await page.waitForLoadState('networkidle');

    // ยอดรวมทุกบิล = 100 + 60
    await expect(page.getByText('฿160.00').first()).toBeVisible();

    // แต่ละบิลมีคนออกเงินของตัวเอง — ต้องไม่ใช่คนเดียวกันทั้งสองใบ
    await expect(page.getByText('ออกเงิน: แดง')).toBeVisible();
    await expect(page.getByText('ออกเงิน: ดำ')).toBeVisible();

    // ยอดในบิล A (จ่ายโดยแดง): แดงติดแท็ก (คนจ่าย), หารคนละ 50
    const billA = page.getByText('ออกเงิน: แดง').locator('..');
    await expect(billA.getByText('฿100.00', { exact: true })).toBeVisible();
    await expect(billA.getByText('แดง (คนจ่าย)')).toBeVisible();
    await expect(billA.getByText('ดำ', { exact: true })).toBeVisible();
    await expect(billA.getByText('฿50.00', { exact: true })).toHaveCount(2);

    // ยอดในบิล B (จ่ายโดยดำ): ดำติดแท็ก (คนจ่าย), หารคนละ 30
    const billB = page.getByText('ออกเงิน: ดำ').locator('..');
    await expect(billB.getByText('฿60.00', { exact: true })).toBeVisible();
    await expect(billB.getByText('ดำ (คนจ่าย)')).toBeVisible();
    await expect(billB.getByText('แดง', { exact: true })).toBeVisible();
    await expect(billB.getByText('฿30.00', { exact: true })).toHaveCount(2);
  });

  test('settle-up หักกลบข้ามบิล → เหลือรายการโอนเดียว ดำ → แดง 20฿', async ({ page }) => {
    await setupTwoPayers(page);
    await page.goto('/summary');
    await page.waitForLoadState('networkidle');

    // หักกลบแล้วเหลือโอนรายการเดียว (ไม่ใช่ 2 รายการตามจำนวนบิล)
    await expect(page.getByText('โอนแล้ว 0/1 รายการ')).toBeVisible();
    await expect(page.getByText('฿20.00', { exact: true }).first()).toBeVisible();

    // ทิศทางถูก: ดำ (ออกน้อยกว่า) โอนให้ แดง — ยิงด้วย aria-label ของ checkbox
    await expect(page.getByRole('checkbox', { name: 'ดำ โอนให้ แดง แล้ว' })).toBeVisible();
    // ต้องไม่มีรายการโอนทิศกลับกัน
    await expect(page.getByRole('checkbox', { name: 'แดง โอนให้ ดำ แล้ว' })).toHaveCount(0);

    // สถานะสุทธิ: แดงได้คืน 20, ดำต้องจ่าย 20
    await expect(page.getByText('ได้คืน ฿20.00')).toBeVisible();
    await expect(page.getByText('ต้องจ่าย ฿20.00')).toBeVisible();
  });

  test('ยอดที่แต่ละคนต้องจ่ายรวม = ผลรวมทุกบิลที่ร่วม (คนละ 80฿)', async ({ page }) => {
    await setupTwoPayers(page);
    await page.goto('/summary');
    await page.waitForLoadState('networkidle');

    // การ์ดสรุปด้านบน: ทั้งสองคนรับผิดชอบคนละ 80 (50 + 30) แม้ออกเงินไม่เท่ากัน
    await expect(page.getByText('ยอดที่แต่ละคนต้องจ่าย')).toBeVisible();
    await expect(page.getByText('฿80.00', { exact: true })).toHaveCount(2);
  });

  test('แท็บฉัน: ดำเห็นว่าตัวเองออกเงินบิลเดียว แต่ยังต้องโอนส่วนต่างให้แดง', async ({ page }) => {
    await setupTwoPayers(page);
    await pickMe(page, 'ดำ');

    // ยอดที่ดำต้องรับผิดชอบรวม = 80
    await expect(page.getByText('ยอดที่ฉันต้องจ่ายรวม', { exact: false })).toBeVisible();
    await expect(page.getByText('฿80.00', { exact: true }).first()).toBeVisible();

    // สุทธิ: ดำต้องจ่ายเพิ่ม 20
    await expect(page.getByText('สุทธิ: ฉันต้องจ่ายเพิ่ม')).toBeVisible();
    await expect(page.getByText('฿20.00', { exact: true }).first()).toBeVisible();

    // ต้องโอนให้แดง + ไม่มีใครต้องโอนให้ดำ
    await expect(page.getByRole('checkbox', { name: 'ฉันโอนให้ แดง แล้ว' })).toBeVisible();
    await expect(page.getByText('ไม่มี — ไม่มีใครติดฉัน')).toBeVisible();

    // ร่วม 2 บิล และบิลกาแฟระบุว่าฉันเป็นคนออกเงิน
    await expect(page.getByText('บิลที่ฉันร่วม (2)')).toBeVisible();
    const coffee = page.getByText('บิลกาแฟ', { exact: true }).locator('..').locator('..');
    await expect(coffee.getByText(/ฉันเป็นคนออกเงิน/)).toBeVisible();
    // บิลข้าวมันไก่ (แดงออกเงิน) ต้องไม่ติดป้ายว่าฉันออกเงิน
    const chicken = page.getByText('บิลข้าวมันไก่', { exact: true }).locator('..').locator('..');
    await expect(chicken.getByText(/ฉันเป็นคนออกเงิน/)).toHaveCount(0);
  });

  test('แท็บฉัน: แดงเป็นเจ้าหนี้ → เห็นว่าดำต้องโอนให้ฉัน', async ({ page }) => {
    await setupTwoPayers(page);
    await pickMe(page, 'แดง');

    await expect(page.getByText('สุทธิ: ฉันควรได้คืน')).toBeVisible();
    await expect(page.getByRole('checkbox', { name: 'ดำ โอนให้ฉันแล้ว' })).toBeVisible();
    await expect(page.getByText('ไม่มี — ฉันไม่ติดใคร')).toBeVisible();
  });

  test('เปลี่ยนคนออกเงินของบิลเดียว → ยอดสุทธิ/รายการโอนเปลี่ยนตาม', async ({ page }) => {
    await setupTwoPayers(page);

    // ย้ายคนออกเงินบิลกาแฟจากดำไปแดง → แดงออกทั้ง 160 รับผิดชอบ 80 = +80
    await page.goto('/bills');
    await page.waitForLoadState('networkidle');
    await page.getByText('บิลกาแฟ', { exact: true }).click();
    await expect(page.getByText('วิธีหาร')).toBeVisible();
    await pickPayer(page, 'แดง');
    // ยืนยันว่าคนออกเงินเปลี่ยนจริง 2 ทาง: ข้อความบนจอ + สถานะของ chip
    // (chip ใช้ a11y('button', { selected }) → ออกมาเป็น aria-pressed ไม่ใช่ aria-selected)
    await expect(page.getByText('แดง จ่ายเต็ม คนอื่นไม่ต้องหาร')).toBeVisible();
    await expect(page.getByRole('button', { name: 'คนออกเงิน แดง' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByRole('button', { name: 'คนออกเงิน ดำ' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );

    await page.goto('/summary');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('ออกเงิน: ดำ')).toHaveCount(0);
    await expect(page.getByText('ได้คืน ฿80.00')).toBeVisible();
    await expect(page.getByText('ต้องจ่าย ฿80.00')).toBeVisible();
    await expect(page.getByRole('checkbox', { name: 'ดำ โอนให้ แดง แล้ว' })).toBeVisible();
  });

  test('ติ๊กโอนแล้วของ multi-payer → จ่ายครบและปุ่มเคลียร์โผล่', async ({ page }) => {
    await setupTwoPayers(page);
    await page.goto('/summary');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('จ่ายครบทุกคนแล้ว!')).toHaveCount(0);
    await page.getByRole('checkbox', { name: 'ดำ โอนให้ แดง แล้ว' }).click();
    await expect(page.getByText('โอนแล้ว 1/1 รายการ')).toBeVisible();
    await expect(page.getByText('จ่ายครบทุกคนแล้ว!')).toBeVisible();
    // local mode ป้ายปุ่มคือ "เคลียร์ทั้งหมด" (ไม่ใช่ "ปิดวง"/"ออกจากวง")
    await expect(page.getByText('เคลียร์ทั้งหมด')).toBeVisible();
  });
});
