import { expect, test } from '@playwright/test';
import { addItem, addMember, createBill, freshPage, pickMe, pickPayer } from './helpers';

/**
 * บิลที่ยังไม่สมบูรณ์ (`billComplete` = false) จะไม่เข้าสรุป — แต่ต้อง **บอกเหตุผลเป็นข้อความไทย**
 * ทุกหน้า ไม่ใช่หายเงียบ (ข้อความมาจาก billIssues() ใน src/domain/split.ts)
 *
 * เกณฑ์จาก billIssues():
 *   - ไม่มีคนออกเงิน            → 'ต้องเลือกคนออกเงิน'
 *   - ไม่มีเมนูที่มีราคา > 0    → 'ต้องมีเมนูอย่างน้อย 1 รายการที่มีราคา'
 *   - มีเมนูราคา > 0 แต่ยอดรวม <= 0 → 'ยอดรวมต้องมากกว่า 0'
 */

test.describe('บิลไม่สมบูรณ์: บอกเหตุผลที่ยังไม่เข้าสรุป (billIssues)', () => {
  test('บิลเปล่า: หน้ารายละเอียดบอกทั้ง 2 เหตุผล', async ({ page }) => {
    await freshPage(page, '/members');
    await addMember(page, 'แดง');
    await createBill(page, 'บิลเปล่า');

    await expect(page.getByText('บิลนี้ยังไม่เข้าสรุป')).toBeVisible();
    await expect(page.getByText('• ต้องเลือกคนออกเงิน')).toBeVisible();
    await expect(page.getByText('• ต้องมีเมนูอย่างน้อย 1 รายการที่มีราคา')).toBeVisible();
  });

  test('มีเมนูแล้วแต่ยังไม่เลือกคนออกเงิน → เหลือเหตุผลเดียว', async ({ page }) => {
    await freshPage(page, '/members');
    await addMember(page, 'แดง');
    await createBill(page, 'บิลไม่มีคนจ่าย');
    await addItem(page, 'ข้าวผัด', '80');

    await expect(page.getByText('• ต้องเลือกคนออกเงิน')).toBeVisible();
    await expect(page.getByText('• ต้องมีเมนูอย่างน้อย 1 รายการที่มีราคา')).toHaveCount(0);
  });

  test('เลือกคนออกเงินแล้วแต่ยังไม่มีเมนู → เหลือเหตุผลเดียว', async ({ page }) => {
    await freshPage(page, '/members');
    await addMember(page, 'แดง');
    await createBill(page, 'บิลไม่มีเมนู');
    await pickPayer(page, 'แดง');

    await expect(page.getByText('• ต้องมีเมนูอย่างน้อย 1 รายการที่มีราคา')).toBeVisible();
    await expect(page.getByText('• ต้องเลือกคนออกเงิน')).toHaveCount(0);
  });

  test('กรอกครบทั้งสองอย่าง → กล่องเตือนหายไป', async ({ page }) => {
    await freshPage(page, '/members');
    await addMember(page, 'แดง');
    await createBill(page, 'บิลครบ');
    await addItem(page, 'ข้าวผัด', '80');
    await pickPayer(page, 'แดง');

    await expect(page.getByText('บิลนี้ยังไม่เข้าสรุป')).toHaveCount(0);
  });

  test('หน้ารายการบิล: ติดป้ายเหตุผลบนการ์ดบิลที่ยังไม่ครบ', async ({ page }) => {
    await freshPage(page, '/members');
    await addMember(page, 'แดง');
    await createBill(page, 'บิลค้าง');
    await addItem(page, 'ข้าวผัด', '80');

    await page.goto('/bills');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('⚠️ ยังไม่เข้าสรุป — ต้องเลือกคนออกเงิน')).toBeVisible();
    await expect(page.getByText('คนจ่าย: — ยังไม่ระบุ')).toBeVisible();
  });

  test('หน้าสรุป: บิลไม่ครบยังโชว์อยู่พร้อมเหตุผล แต่ไม่ถูกนับเข้ายอดรวม', async ({ page }) => {
    await freshPage(page, '/members');
    await addMember(page, 'แดง');
    await addMember(page, 'ดำ');

    // บิลครบ 100฿ (เข้าสรุป)
    await createBill(page, 'บิลครบ');
    await addItem(page, 'ข้าวมันไก่', '100');
    await pickPayer(page, 'แดง');

    // บิลไม่ครบ 999฿ (ไม่มีคนจ่าย → ต้องไม่เข้ายอดรวม)
    await createBill(page, 'บิลค้าง');
    await addItem(page, 'ของแพง', '999');

    await page.goto('/summary');
    await page.waitForLoadState('networkidle');

    // ยอดรวมต้องเป็น 100 ไม่ใช่ 1099 (บิลค้างไม่ถูกนับ)
    await expect(page.getByText('฿100.00').first()).toBeVisible();
    await expect(page.getByText('฿1,099.00')).toHaveCount(0);

    // แต่บิลค้างต้องยังเห็นบนจอ + บอกเหตุผล (ไม่หายเงียบ)
    await expect(page.getByText('บิลค้าง', { exact: true })).toBeVisible();
    await expect(page.getByText('⚠️ บิลนี้ยังไม่เข้าสรุป')).toBeVisible();
    await expect(page.getByText('• ต้องเลือกคนออกเงิน')).toBeVisible();
    await expect(page.getByText('ยังไม่ระบุคนจ่าย')).toBeVisible();
  });

  test('หน้าสรุป: บิลไม่ครบไม่สร้างรายการโอน', async ({ page }) => {
    await freshPage(page, '/members');
    await addMember(page, 'แดง');
    await addMember(page, 'ดำ');
    await createBill(page, 'บิลค้าง');
    await addItem(page, 'ของแพง', '500');

    await page.goto('/summary');
    await page.waitForLoadState('networkidle');

    // ไม่มีสรุปเลย → ปุ่มดาวน์โหลดรูปต้อง disabled + ไม่มี progress การโอน
    await expect(page.getByRole('button', { name: 'ดาวน์โหลดรูปสรุป' })).toBeDisabled();
    await expect(page.getByText('ยังไม่มีข้อมูลให้สรุป').first()).toBeVisible();
    await expect(page.getByText('ยังไม่มีรายการโอน (ระบุคนจ่ายในแต่ละบิล)')).toBeVisible();
    await expect(page.getByText(/โอนแล้ว \d+\/\d+ รายการ/)).toHaveCount(0);
  });

  test('เมนูราคา 0 ไม่นับเป็นเมนูที่มีราคา → ยังไม่เข้าสรุป', async ({ page }) => {
    await freshPage(page, '/members');
    await addMember(page, 'แดง');
    await createBill(page, 'บิลของแถม');
    await addItem(page, 'น้ำเปล่าฟรี', '0');
    await pickPayer(page, 'แดง');

    // ราคา 0 → hasPricedItem = false ตาม billIssues()
    await expect(page.getByText('• ต้องมีเมนูอย่างน้อย 1 รายการที่มีราคา')).toBeVisible();

    // เพิ่มเมนูที่มีราคาจริง → ครบ
    await addItem(page, 'ข้าวผัด', '80');
    await expect(page.getByText('บิลนี้ยังไม่เข้าสรุป')).toHaveCount(0);
  });

  test('ส่วนลดมากกว่ายอดเมนู → เตือนยอดรวมติดลบ (แต่ยังเข้าสรุป เพราะยอดเมนูยังบวก)', async ({
    page,
  }) => {
    await freshPage(page, '/members');
    await addMember(page, 'แดง');
    await createBill(page, 'บิลลดเกิน');
    await addItem(page, 'ข้าวผัด', '80');
    await pickPayer(page, 'แดง');
    // ส่วนลด 200 > ยอดเมนู 80 → ยอดรวมติดลบ
    await page.getByRole('textbox', { name: 'ส่วนลด บาท' }).fill('200');

    await expect(
      page.getByText('ยอดรวมติดลบ — ส่วนลดมากกว่ายอดบิล ตรวจตัวเลขอีกครั้ง'),
    ).toBeVisible();
    // billIssues() ดูแค่ยอด "เมนู" (subtotal = 80 > 0) → ส่วนลดไม่ทำให้บิลตกเกณฑ์
    await expect(page.getByText('บิลนี้ยังไม่เข้าสรุป')).toHaveCount(0);
  });

  test('เมนูราคาติดลบหักจนยอดเมนูไม่บวก → เหตุผล "ยอดรวมต้องมากกว่า 0"', async ({ page }) => {
    await freshPage(page, '/members');
    await addMember(page, 'แดง');
    await createBill(page, 'บิลหักกลบ');
    await addItem(page, 'ข้าวผัด', '80');
    await pickPayer(page, 'แดง');
    // ครบแล้วก่อนใส่เมนูติดลบ
    await expect(page.getByText('บิลนี้ยังไม่เข้าสรุป')).toHaveCount(0);

    // เมนูติดลบ -100 → subtotal = -20 (ยังมีเมนูราคา > 0 อยู่ แต่ยอดรวมไม่บวก)
    await addItem(page, 'คืนเงินมัดจำ', '-100');
    await expect(page.getByText('• ยอดรวมต้องมากกว่า 0')).toBeVisible();
    await expect(page.getByText('• ต้องมีเมนูอย่างน้อย 1 รายการที่มีราคา')).toHaveCount(0);
  });

  test('แท็บฉัน: เตือนว่ายังมีบิลกรอกไม่ครบที่ยังไม่ถูกนับ', async ({ page }) => {
    await freshPage(page, '/members');
    await addMember(page, 'แดง');
    await addMember(page, 'ดำ');

    // บิลครบ (เข้าสรุป)
    await createBill(page, 'บิลครบ');
    await addItem(page, 'ข้าวมันไก่', '100');
    await pickPayer(page, 'แดง');

    // บิลไม่ครบ — ยังไม่มีคนจ่าย
    await createBill(page, 'บิลค้าง');
    await addItem(page, 'ของแพง', '999');

    await pickMe(page, 'ดำ');

    // hero เตือนจำนวนบิลที่ยังไม่นับ + ยอดของฉันยังเป็น 50 (จากบิลครบใบเดียว)
    await expect(
      page.getByText('⚠️ ยังไม่นับ 1 บิลที่กรอกไม่ครบ — แตะบิลด้านล่างเพื่อแก้'),
    ).toBeVisible();
    await expect(page.getByText('฿50.00', { exact: true }).first()).toBeVisible();

    // การ์ดบิลค้างบอกเหตุผลด้วย
    await expect(page.getByText('⚠️ ต้องเลือกคนออกเงิน')).toBeVisible();
  });
});
