import { Page, expect, test } from '@playwright/test';
import { addItem, addMember, createBill, freshPage, openTab, pickPayer, visibleText } from './helpers';

/**
 * แก้/ลบบิล + ค่าบริการ/VAT/ส่วนลด ผ่าน UI จริง
 *
 * ทำไมไฟล์นี้ต้องมี: เทสเดิมครอบแค่ "สร้างบิล + เพิ่มเมนู + เลือกคนจ่าย"
 * ส่วนที่เงินเปลี่ยนจริง (service/VAT/ส่วนลด) กับการลบ (เมนู/บิล) ไม่มีใครยิงเลย
 * ทั้งที่บรรทัดสรุปบนจอต้องบวกกันได้เท่า "รวมบิลนี้" เป๊ะ (เพื่อนกดเครื่องคิดเลขเทียบ)
 */

/** เตรียม: 2 สมาชิก + บิลที่มีเมนู 100 บาท และแดงเป็นคนออกเงิน */
async function setupBill(page: Page, price = '100') {
  await freshPage(page, '/members');
  await addMember(page, 'แดง');
  await addMember(page, 'ดำ');
  await createBill(page, 'บิลข้าว');
  await addItem(page, 'ข้าวผัด', price);
  await pickPayer(page, 'แดง');
}

const service = (page: Page) => page.getByRole('textbox', { name: 'ค่าบริการ เปอร์เซ็นต์' });
const vat = (page: Page) => page.getByRole('textbox', { name: 'ภาษีมูลค่าเพิ่ม เปอร์เซ็นต์' });
const discount = (page: Page) => page.getByRole('textbox', { name: 'ส่วนลด บาท' });

/**
 * แถวสรุปในหน้าบิล (label ซ้าย + ยอดขวา) — คืน element ของแถวเพื่อเทียบยอดในแถวเดียวกัน
 * ต้องดูเป็น "แถว" ไม่ใช่แค่ getByText(ยอด) เพราะยอดเดียวกันโผล่หลายแถวได้ (ยอดเมนู/รวมบิลนี้)
 * `.last()` เผื่อ label ชนกับที่อื่นบนจอ (ชื่อคนโผล่ทั้ง chip คนจ่าย/ผู้ร่วมบิล/ยอดต่อคน)
 */
function sumRow(page: Page, label: string) {
  return page.getByText(label, { exact: true }).last().locator('xpath=..');
}

test.describe('ค่าบริการ / VAT / ส่วนลด ในหน้าบิล', () => {
  test('ใส่ service 10% → เห็นบรรทัด Service charge และยอดรวมเพิ่ม', async ({ page }) => {
    await setupBill(page);
    // ยังไม่ใส่อะไร: ไม่มีบรรทัดสรุป service/VAT (ซ่อนเมื่อเป็น 0)
    // ต้องใช้ exact: ป้ายช่องกรอกคือ 'Service %' / 'VAT %' ซึ่งอยู่บนจอตลอด
    await expect(page.getByText('Service charge', { exact: true })).toHaveCount(0);
    await expect(page.getByText('VAT', { exact: true })).toHaveCount(0);

    await service(page).fill('10');
    await expect(page.getByText('Service charge', { exact: true })).toBeVisible();
    await expect(sumRow(page, 'Service charge')).toContainText('฿10.00');
    await expect(sumRow(page, 'รวมบิลนี้')).toContainText('฿110.00');
  });

  test('ใส่ VAT 7% บน (ยอดเมนู + service) ตามธรรมเนียมร้านไทย', async ({ page }) => {
    await setupBill(page);
    await service(page).fill('10');
    await vat(page).fill('7');
    // VAT คิดบน 100 + 10 = 110 → 7.70
    await expect(sumRow(page, 'VAT')).toContainText('฿7.70');
    await expect(sumRow(page, 'รวมบิลนี้')).toContainText('฿117.70');
  });

  test('ใส่ส่วนลด → หักออกจากยอดรวม และแสดงเป็นค่าติดลบ', async ({ page }) => {
    await setupBill(page);
    await discount(page).fill('30');
    await expect(sumRow(page, 'ส่วนลด')).toContainText('-฿30.00');
    await expect(sumRow(page, 'รวมบิลนี้')).toContainText('฿70.00');
  });

  test('ยอดต่อคนบวกกันได้เท่ายอดรวมพอดี (เศษ 1 สตางค์ไม่หาย)', async ({ page }) => {
    // 3 คนหาร 100 → 33.33 + 33.34 + 33.33 = 100.00 (เศษไม่ตกที่คนออกเงิน)
    await setupBill(page);
    await openTab(page, 'members');
    await addMember(page, 'เขียว');
    await openTab(page, 'bills');
    await page.getByText('บิลข้าว').first().click();
    await expect(page.getByText('ยอดต่อคนในบิลนี้')).toBeVisible();

    await expect(sumRow(page, 'รวมบิลนี้')).toContainText('฿100.00');
    // คนออกเงิน (แดง) ได้ยอดตรงสัดส่วน, เศษไปตกที่คนอื่น
    await expect(sumRow(page, 'แดง')).toContainText('฿33.33');
    await expect(page.getByText('฿33.34')).toHaveCount(1);
  });

  test('กรอกค่าติดลบ → เตือน "ใส่ตัวเลขไม่ติดลบ" และยอดไม่เปลี่ยน', async ({ page }) => {
    await setupBill(page);
    await service(page).fill('-5');
    await expect(page.getByText('ใส่ตัวเลขไม่ติดลบ')).toBeVisible();
    // ค่าติดลบไม่ถูกรับเข้า state → ยอดรวมยังเป็น 100
    await expect(sumRow(page, 'รวมบิลนี้')).toContainText('฿100.00');
  });

  test('ส่วนลดมากกว่ายอดบิล → เตือนยอดรวมติดลบ + ยอดต่อคนติดลบ (รูปแบบ -฿…)', async ({ page }) => {
    await setupBill(page);
    await discount(page).fill('300');
    await expect(page.getByText('ยอดรวมติดลบ — ส่วนลดมากกว่ายอดบิล ตรวจตัวเลขอีกครั้ง')).toBeVisible();
    await expect(sumRow(page, 'รวมบิลนี้')).toContainText('-฿200.00');
    // เครื่องหมายลบอยู่หน้าสัญลักษณ์เงิน (baht() ใน src/ui/index.ts)
    await expect(sumRow(page, 'แดง')).toContainText('-฿100.00');
  });

  test('ค่าบริการที่กรอกไว้ยังอยู่หลัง reload', async ({ page }) => {
    await setupBill(page);
    await service(page).fill('7.5');
    await expect(sumRow(page, 'Service charge')).toContainText('฿7.50');

    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(service(page)).toHaveValue('7.5');
    await expect(sumRow(page, 'Service charge')).toContainText('฿7.50');
  });
});

test.describe('แก้ไขบิล', () => {
  test('เปลี่ยนชื่อบิล → ชื่อใหม่โผล่ในรายการบิลและหน้าสรุป', async ({ page }) => {
    await setupBill(page);
    await page.getByRole('textbox', { name: 'ชื่อบิล' }).fill('บิลข้าวมันไก่');

    await openTab(page, 'bills');
    // การ์ดบิลใช้ aria-label รวมยอด → ยิงด้วย role เพื่อไม่ชนกับข้อความชื่อบิลข้างใน
    await expect(page.getByRole('button', { name: /^บิล บิลข้าวมันไก่ ยอดรวม/ })).toBeVisible();
    await expect(page.getByText('บิลข้าว', { exact: true })).toHaveCount(0);

    await openTab(page, 'summary');
    // ชื่อบิลโผล่ทั้งในหน้าสรุป และในหน้า /bills ที่ค้างอยู่ใน DOM (aria-hidden) → กรองก่อน
    await expect(visibleText(page, 'บิลข้าวมันไก่', { exact: true })).toBeVisible();
  });

  test('ลบชื่อบิลจนว่าง → เตือนให้ตั้งชื่อ (ไม่เงียบ)', async ({ page }) => {
    await setupBill(page);
    await page.getByRole('textbox', { name: 'ชื่อบิล' }).fill('');
    await expect(page.getByText('ยังไม่ได้ตั้งชื่อบิล — ตั้งชื่อไว้จะหาง่ายกว่า')).toBeVisible();
  });

  test('เปลี่ยนคนออกเงิน → หน้าสรุปเปลี่ยนทิศทางการโอน', async ({ page }) => {
    await setupBill(page);
    await openTab(page, 'summary');
    // แดงออกเงิน → ดำโอนให้แดง
    await expect(page.getByRole('checkbox', { name: 'ดำ โอนให้ แดง แล้ว' })).toBeVisible();

    await openTab(page, 'bills');
    await page.getByText('บิลข้าว').first().click();
    await pickPayer(page, 'ดำ');

    await openTab(page, 'summary');
    // สลับทิศแล้ว: แดงโอนให้ดำ
    await expect(page.getByRole('checkbox', { name: 'แดง โอนให้ ดำ แล้ว' })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: 'ดำ โอนให้ แดง แล้ว' })).toHaveCount(0);
  });

  test('แตะ chip คนออกเงินซ้ำ → ยกเลิกคนจ่าย และบิลหลุดจากสรุป', async ({ page }) => {
    await setupBill(page);
    await pickPayer(page, 'แดง'); // แตะซ้ำ = ยกเลิก
    // ข้อความเดียวกันโผล่ทั้งในกล่องเตือนและใน aria-label ของการ์ดบิล → ระบุ bullet ในกล่องเตือน
    await expect(page.getByText('• ต้องเลือกคนออกเงิน')).toBeVisible();

    await openTab(page, 'summary');
    await expect(page.getByText('⚠️ บิลนี้ยังไม่เข้าสรุป')).toBeVisible();
  });

  test('เลือกผู้ร่วมบิลเฉพาะบางคน → คนที่ไม่ได้เลือกไม่มียอด', async ({ page }) => {
    await setupBill(page);
    // เลือกเฉพาะแดง → ยอดทั้งบิลเป็นของแดงคนเดียว
    await page.getByRole('checkbox', { name: 'ผู้ร่วมบิล แดง' }).click();
    await expect(page.getByRole('checkbox', { name: 'ผู้ร่วมบิล แดง' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expect(page.getByText('เลือกไว้ 1 คน · แตะซ้ำเพื่อเอาออก')).toBeVisible();
    await expect(sumRow(page, 'แดง')).toContainText('฿100.00');

    await openTab(page, 'summary');
    // แดงออกเงินเองและรับผิดชอบเอง → ไม่มีใครต้องโอน
    await expect(
      page.getByText('ไม่มีใครต้องโอน — ทุกคนออกเงินพอดีกับส่วนของตัวเองแล้ว'),
    ).toBeVisible();
  });
});

test.describe('ลบเมนู / ลบบิล', () => {
  test('ลบเมนู (ยืนยัน) → เมนูหายและยอดรวมลด', async ({ page }) => {
    await setupBill(page);
    await addItem(page, 'ต้มยำ', '250');
    await expect(sumRow(page, 'รวมบิลนี้')).toContainText('฿350.00');

    page.once('dialog', (d) => d.accept());
    await page.getByRole('button', { name: 'ลบเมนู ต้มยำ' }).click();

    await expect(page.getByText('ต้มยำ', { exact: true })).toHaveCount(0);
    await expect(sumRow(page, 'รวมบิลนี้')).toContainText('฿100.00');
  });

  test('ลบเมนู (กดยกเลิกใน dialog) → เมนูยังอยู่', async ({ page }) => {
    await setupBill(page);
    page.once('dialog', (d) => d.dismiss());
    await page.getByRole('button', { name: 'ลบเมนู ข้าวผัด' }).click();

    await expect(page.getByText('ข้าวผัด', { exact: true })).toBeVisible();
    await expect(sumRow(page, 'รวมบิลนี้')).toContainText('฿100.00');
  });

  test('ลบเมนูหมดทุกรายการ → บิลกลับไปสถานะยังไม่เข้าสรุป', async ({ page }) => {
    await setupBill(page);
    page.once('dialog', (d) => d.accept());
    await page.getByRole('button', { name: 'ลบเมนู ข้าวผัด' }).click();

    await expect(page.getByText('ยังไม่มีเมนู — ใส่ชื่อเมนูกับราคาด้านบนแล้วกด +')).toBeVisible();
    await expect(page.getByText('• ต้องมีเมนูอย่างน้อย 1 รายการที่มีราคา')).toBeVisible();
  });

  test('ลบบิล (ยืนยัน) → เด้งกลับหน้าบิลทั้งหมด และบิลหายจากสรุป', async ({ page }) => {
    await setupBill(page);
    page.once('dialog', (d) => d.accept());
    await page.getByRole('button', { name: 'ลบบิล บิลข้าว' }).click();

    // replace ไป /bills → เห็น empty state ของหน้าบิล
    await expect(page.getByText('ยังไม่มีบิล')).toBeVisible();
    expect(new URL(page.url()).pathname).toBe('/bills');

    await openTab(page, 'summary');
    // 'ยังไม่มีข้อมูลให้สรุป' โผล่ 2 ที่ในหน้าสรุปเอง (การ์ดแชร์ + empty state) → เช็กจำนวน
    await expect(visibleText(page, 'ยังไม่มีข้อมูลให้สรุป')).toHaveCount(2);
    // 'ยังไม่มีบิล' มีทั้งในหน้าสรุปและหน้า /bills ที่ค้างอยู่ → กรองเอาแต่แท็บปัจจุบัน
    await expect(visibleText(page, 'ยังไม่มีบิล')).toBeVisible();
  });

  test('ลบบิล (กดยกเลิกใน dialog) → บิลยังอยู่ ไม่เด้งออกจากหน้า', async ({ page }) => {
    await setupBill(page);
    page.once('dialog', (d) => d.dismiss());
    await page.getByRole('button', { name: 'ลบบิล บิลข้าว' }).click();

    await expect(page.getByText('ยอดต่อคนในบิลนี้')).toBeVisible();
    await expect(sumRow(page, 'รวมบิลนี้')).toContainText('฿100.00');
  });

  test('เข้าหน้าบิลที่ถูกลบไปแล้ว → เห็น "ไม่พบบิลนี้" + ปุ่มกลับ', async ({ page }) => {
    await setupBill(page);
    const billUrl = page.url();
    page.once('dialog', (d) => d.accept());
    await page.getByRole('button', { name: 'ลบบิล บิลข้าว' }).click();
    await expect(page.getByText('ยังไม่มีบิล')).toBeVisible();

    await page.goto(billUrl);
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('ไม่พบบิลนี้')).toBeVisible();
    await page.getByRole('button', { name: 'กลับไปหน้าบิลทั้งหมด' }).click();
    await expect(page.getByText('ยังไม่มีบิล')).toBeVisible();
  });
});
