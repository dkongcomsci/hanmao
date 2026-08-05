import { Page, expect, test } from '@playwright/test';
import {
  addItem,
  addMember,
  createBill,
  freshPage,
  markArrived,
  markLeft,
  openTab,
  pickPayer,
} from './helpers';

/**
 * บิลโหมด "หารตามเวลา" ผ่าน UI จริง
 *
 * ทำไมไฟล์นี้ต้องมี: บั๊ก BLOCKER ที่หลุดไปถึง reviewer เกิดกับบิลโหมดนี้เท่านั้น
 * (ยอดขยับทุกมิลลิวินาทีเมื่อมีคน `leftAt = null` → key ของ settlements เปลี่ยนทุก render
 * → ติ๊ก "โอนแล้ว" หลุดเอง → กล่อง "จ่ายครบทุกคนแล้ว" ไม่โผล่ → ปุ่มเคลียร์กลุ่มไม่โผล่)
 * เทส E2E เดิมทุกไฟล์ใช้แค่โหมด equal/itemized จึงไม่มีอะไรจับได้เลย
 *
 * หมายเหตุเรื่องเวลา: หน้าจอใช้ `Date.now()` จริง (ส่งเวลาปลอมเข้าไปไม่ได้จาก E2E)
 * → เทสนี้อาศัยว่าเวลาเดินไปเองระหว่าง reload/สลับแท็บ ซึ่งพอสำหรับจับบั๊กเดิม
 * เพราะยอดเปลี่ยนทุกมิลลิวินาที (ไม่ต้องรอเป็นนาที) การเทียบเชิงตัวเลขละเอียด
 * ทำที่ tests/unit/split.test.ts ที่คุม asOf ได้เต็มที่
 */

/**
 * เตรียมสถานะที่ "ยอดลอยตามเวลา" จริง:
 * แดง มาถึงแล้ว + กลับแล้ว / ดำ มาถึงแล้วแต่ยังไม่กลับ (leftAt = null)
 * บิล 300 บาท โหมดหารตามเวลา แดงออกเงิน
 */
async function setupTimeBill(page: Page) {
  await freshPage(page, '/members');
  await addMember(page, 'แดง');
  await addMember(page, 'ดำ');
  // ทั้งคู่มาถึง แล้วให้แดงกลับก่อน (ดำยังนั่งอยู่ = เคสที่ทำให้ยอดลอย)
  await markArrived(page, 'แดง');
  await markArrived(page, 'ดำ');
  await markLeft(page, 'แดง');

  await createBill(page, 'บิลเหล้า');
  await addItem(page, 'เหล้า', '300');
  await pickPayer(page, 'แดง');
  await page.getByRole('button', { name: 'วิธีหาร หารตามเวลา' }).click();
  await expect(
    page.getByText('ใช้เวลามา-กลับของแต่ละคน (ตั้งที่แท็บสมาชิก) · คนที่ยังไม่กลับคิดถึงตอนนี้'),
  ).toBeVisible();
}

test.describe('เลือกวิธีหารในหน้าบิล', () => {
  test('สลับวิธีหารได้ 3 โหมด + โหมดที่เลือกอยู่ถูกทำเครื่องหมายไว้', async ({ page }) => {
    await freshPage(page, '/members');
    await addMember(page, 'แดง');
    await createBill(page, 'บิลทดสอบ');

    const equal = page.getByRole('button', { name: 'วิธีหาร หารเท่ากัน' });
    const itemized = page.getByRole('button', { name: 'วิธีหาร หารตามที่กิน' });
    const time = page.getByRole('button', { name: 'วิธีหาร หารตามเวลา' });

    // ค่าเริ่มต้นของบิลใหม่ = หารเท่ากัน
    await expect(equal).toHaveAttribute('aria-pressed', 'true');
    await expect(itemized).toHaveAttribute('aria-pressed', 'false');
    await expect(time).toHaveAttribute('aria-pressed', 'false');

    await itemized.click();
    await expect(itemized).toHaveAttribute('aria-pressed', 'true');
    await expect(equal).toHaveAttribute('aria-pressed', 'false');

    await time.click();
    await expect(time).toHaveAttribute('aria-pressed', 'true');
    // คำใบ้ของโหมดเวลาโผล่เฉพาะโหมดนี้
    await expect(page.getByText('ใช้เวลามา-กลับของแต่ละคน', { exact: false })).toBeVisible();

    await equal.click();
    await expect(page.getByText('ใช้เวลามา-กลับของแต่ละคน', { exact: false })).toHaveCount(0);
  });

  test('วิธีหารที่เลือกไว้ยังอยู่หลัง reload (persist ลง storage)', async ({ page }) => {
    await freshPage(page, '/members');
    await addMember(page, 'แดง');
    await createBill(page, 'บิลทดสอบ');
    await page.getByRole('button', { name: 'วิธีหาร หารตามเวลา' }).click();

    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('button', { name: 'วิธีหาร หารตามเวลา' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  test('เปลี่ยนเป็นหารตามเวลา → ยอดต่อคนไม่เท่ากันแล้ว (คนอยู่นานจ่ายมากกว่า)', async ({ page }) => {
    await setupTimeBill(page);

    // โหมดเวลา: ดำยังไม่กลับ → อยู่นานกว่าแดง → ยอดของดำต้องมากกว่าครึ่ง (150)
    await page.goto('/summary');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('บิลเหล้า')).toBeVisible();
    // หมวดบิลเริ่มต้นของฟอร์มคือ "อาหาร" (chip แรก) — สมาชิกทั้งคู่ consumes = ทั้งสอง จึงเข้าเงื่อนไข
    await expect(page.getByText('อาหาร · หารตามเวลา · ออกเงิน: แดง')).toBeVisible();
    // ยอดรวมยังเป็น 300 เสมอ ไม่ว่าหารแบบไหน
    await expect(page.getByText('฿300.00').first()).toBeVisible();
    // ไม่ใช่การหารเท่ากัน (ถ้าเท่ากันจะเห็น 150.00 ทั้งสองแถว)
    await expect(page.getByText('฿150.00')).toHaveCount(0);
    // ดำยังไม่กลับ = อยู่นานกว่า → ต้องเป็นฝ่ายโอนให้แดง (คนออกเงิน)
    await expect(page.getByRole('checkbox', { name: 'ดำ โอนให้ แดง แล้ว' })).toBeVisible();
  });
});

test.describe('regression: ติ๊ก "โอนแล้ว" ในบิลหารตามเวลาต้องไม่หลุดเอง', () => {
  /**
   * นี่คือเทสของบั๊กจริง — ก่อนแก้ที่ domain (เพิ่ม `stamp` ให้ transfer ที่ยอดลอย)
   * เทสนี้จะแดงตรงบรรทัด "ยังต้องเห็น ✓ โอนแล้ว" เพราะยอดเปลี่ยนไปแล้วตอน re-render
   */
  test('ติ๊กโอนแล้ว → สลับแท็บออกไปแล้วกลับมา ยังติ๊กอยู่', async ({ page }) => {
    await setupTimeBill(page);
    await page.goto('/summary');
    await page.waitForLoadState('networkidle');

    // มีรายการโอน 1 รายการ (ดำ → แดง) ยังไม่ติ๊ก
    await expect(page.getByText('โอนแล้ว 0/1 รายการ')).toBeVisible();
    await page.getByRole('checkbox', { name: 'ดำ โอนให้ แดง แล้ว' }).click();
    await expect(page.getByText('โอนแล้ว 1/1 รายการ')).toBeVisible();
    await expect(page.getByText('จ่ายครบทุกคนแล้ว!')).toBeVisible();

    // สลับไปแท็บอื่นแล้วกลับมา (เวลาเดินไป → ยอดของโหมดเวลาขยับ)
    await openTab(page, 'members');
    await expect(page.getByPlaceholder('ชื่อสมาชิก')).toBeVisible();
    await openTab(page, 'summary');

    // ติ๊กต้องยังอยู่ — ยอดขยับเพราะเวลาเดิน ไม่ใช่เพราะผู้ใช้แก้ข้อมูล
    await expect(page.getByText('โอนแล้ว 1/1 รายการ')).toBeVisible();
    await expect(page.getByRole('checkbox', { name: 'ดำ โอนให้ แดง แล้ว' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expect(page.getByText('จ่ายครบทุกคนแล้ว!')).toBeVisible();
    // ปุ่มเคลียร์ต้องโผล่ (อาการเดิมของบั๊ก: ปิดกลุ่มไม่ได้เลย)
    await expect(page.getByRole('button', { name: 'ลบข้อมูลทั้งหมดถาวร' })).toBeVisible();
  });

  test('ติ๊กโอนแล้ว → reload หน้า ยังติ๊กอยู่ (ผ่านการ prune ตอนโหลด state)', async ({ page }) => {
    await setupTimeBill(page);
    await page.goto('/summary');
    await page.waitForLoadState('networkidle');
    await page.getByRole('checkbox', { name: 'ดำ โอนให้ แดง แล้ว' }).click();
    await expect(page.getByText('โอนแล้ว 1/1 รายการ')).toBeVisible();

    // reload = store โหลดจาก storage แล้วเรียก pruneState() ด้วย Date.now() ใหม่
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('โอนแล้ว 1/1 รายการ')).toBeVisible();
    await expect(page.getByText('จ่ายครบทุกคนแล้ว!')).toBeVisible();
  });

  test('ติ๊กในแท็บฉัน (บิลหารตามเวลา) → หน้าสรุปเห็นตรงกัน', async ({ page }) => {
    await setupTimeBill(page);
    await page.goto('/me');
    await page.evaluate(() => window.localStorage.removeItem('hanmao:me:v1'));
    await page.reload();
    await page.waitForLoadState('networkidle');

    // ฉันคือดำ (คนที่ต้องโอน) — แท็บฉันใช้ป้ายมุมมองบุคคลที่หนึ่ง ('ฉันโอนให้ …')
    await page.getByRole('button', { name: 'ฉันคือ ดำ' }).click();
    await expect(page.getByText('ฉันต้องโอนให้ใคร')).toBeVisible();
    await page.getByRole('checkbox', { name: 'ฉันโอนให้ แดง แล้ว' }).click();
    await expect(page.getByText('✓ โอนแล้ว')).toBeVisible();

    await openTab(page, 'summary');
    await expect(page.getByText('โอนแล้ว 1/1 รายการ')).toBeVisible();
  });

  test('แก้ราคาเมนูหลังติ๊กแล้ว → ติ๊กเป็นโมฆะ (กันกล่อง "จ่ายครบ" โผล่ผิด)', async ({ page }) => {
    await setupTimeBill(page);
    await page.goto('/summary');
    await page.waitForLoadState('networkidle');
    await page.getByRole('checkbox', { name: 'ดำ โอนให้ แดง แล้ว' }).click();
    await expect(page.getByText('จ่ายครบทุกคนแล้ว!')).toBeVisible();

    // กลับไปเพิ่มเมนูอีกรายการ = ยอดที่ต้องโอนเปลี่ยน → ติ๊กเดิมต้องไม่นับ
    await openTab(page, 'bills');
    await page.getByText('บิลเหล้า').first().click();
    await expect(page.getByText('วิธีหาร')).toBeVisible();
    await addItem(page, 'กับแกล้ม', '200');

    await openTab(page, 'summary');
    await expect(page.getByText('โอนแล้ว 0/1 รายการ')).toBeVisible();
    await expect(page.getByText('จ่ายครบทุกคนแล้ว!')).toHaveCount(0);
  });

  test('กดปุ่มเคลียร์ทั้งหมดได้จริงหลังติ๊กครบ (บิลหารตามเวลา)', async ({ page }) => {
    await setupTimeBill(page);
    await page.goto('/summary');
    await page.waitForLoadState('networkidle');
    await page.getByRole('checkbox', { name: 'ดำ โอนให้ แดง แล้ว' }).click();

    page.once('dialog', (d) => d.accept());
    await page.getByRole('button', { name: 'ลบข้อมูลทั้งหมดถาวร' }).click();

    await expect(page.getByText('ยังไม่มีบิล')).toBeVisible();
    await openTab(page, 'members');
    await expect(page.getByText('ยังไม่มีสมาชิก')).toBeVisible();
  });
});

test.describe('บิลหารตามเวลา: ทุกคนกลับแล้ว = ยอดหยุดนิ่ง', () => {
  test('ทุกคนกลับแล้ว → ยอดทุกตัวเลขคงเดิมข้าม reload (ไม่ลอยตามเวลาอีก)', async ({ page }) => {
    await setupTimeBill(page);
    // ให้ดำกลับด้วย → ไม่มีใคร leftAt = null แล้ว → ยอดหยุดนิ่ง
    await openTab(page, 'members');
    await markLeft(page, 'ดำ');

    await page.goto('/summary');
    await page.waitForLoadState('networkidle');
    const money = page.locator('text=/฿[0-9,]+\\.[0-9]{2}/');
    const before = await money.allInnerTexts();
    expect(before.length).toBeGreaterThan(0);

    await page.reload();
    await page.waitForLoadState('networkidle');
    // เวลาเดินไประหว่าง reload แต่ทุกคนกลับแล้ว → ตัวเลขต้องเป๊ะเดิมทุกตัว
    await expect(money).toHaveText(before);
  });
});
