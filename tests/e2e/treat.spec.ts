import { expect, test, type Page } from '@playwright/test';
import {
  addItem,
  addMember,
  createBill,
  freshPage,
  pickMe,
  pickPayer,
  toggleTreat,
} from './helpers';

/**
 * บิลเลี้ยง (`isTreat`) — คนจ่ายรับยอดเต็มคนเดียว คนอื่นเป็น 0
 * (ดู computeBill ใน src/domain/split.ts: isTreat + paidById → perMember ทุกคน 0 ยกเว้นคนจ่าย)
 *
 * เลขที่คาดหวัง: สมาชิก 3 คน, บิล 300฿ จ่าย+เลี้ยงโดยแดง
 *   ปกติ (ไม่เลี้ยง) → คนละ 100
 *   เลี้ยง → แดง 300, ดำ 0, ขาว 0 · ไม่มีรายการโอนเลย (ไม่มีใครติดใคร)
 */
async function setupTreatBill(page: Page) {
  await freshPage(page, '/members');
  await addMember(page, 'แดง');
  await addMember(page, 'ดำ');
  await addMember(page, 'ขาว');

  await createBill(page, 'บิลเลี้ยงส่ง');
  await addItem(page, 'หมูกระทะ', '300');
  await pickPayer(page, 'แดง');
}

test.describe('บิลเลี้ยง (isTreat)', () => {
  test('สวิตช์เลี้ยงถูก disable จนกว่าจะเลือกคนออกเงิน', async ({ page }) => {
    await freshPage(page, '/members');
    await addMember(page, 'แดง');
    await createBill(page, 'บิลทดสอบ');

    // ยังไม่เลือกคนจ่าย → กดเลี้ยงไม่ได้ + บอกให้เลือกคนจ่ายก่อน
    const sw = page.getByRole('switch', { name: 'บิลนี้คนจ่ายเลี้ยง' });
    await expect(sw).toBeDisabled();
    await expect(page.getByText('เลือกคนออกเงินก่อน')).toBeVisible();

    // เลือกคนจ่ายแล้ว → กดได้ + ข้อความเปลี่ยนเป็นชื่อคนจ่าย
    await pickPayer(page, 'แดง');
    await expect(sw).toBeEnabled();
    await expect(page.getByText('แดง จ่ายเต็ม คนอื่นไม่ต้องหาร')).toBeVisible();
  });

  test('หน้าบิล: เปิดเลี้ยง → คนจ่ายรับยอดเต็ม คนอื่นเป็น ฿0.00', async ({ page }) => {
    await setupTreatBill(page);

    // ก่อนเลี้ยง: หารเท่ากัน 3 คน คนละ 100
    await expect(page.getByText('฿100.00', { exact: true })).toHaveCount(3);

    await toggleTreat(page);

    // หลังเลี้ยง: แดงรับ 300 คนเดียว อีกสองคนได้ 0
    await expect(page.getByText('🎁 แดง เลี้ยงบิลนี้ — คนอื่นไม่ต้องหาร')).toBeVisible();
    await expect(page.getByText('฿0.00', { exact: true })).toHaveCount(2);
    await expect(page.getByText('฿100.00', { exact: true })).toHaveCount(0);
    // ยอดรวมบิลยังเป็น 300 (การเลี้ยงเปลี่ยนแค่ว่าใครรับผิดชอบ ไม่ใช่ยอดบิล)
    await expect(page.getByText('฿300.00', { exact: true }).first()).toBeVisible();
  });

  test('หน้าสรุป: บิลเลี้ยงไม่ทำให้เกิดรายการโอน + ทุกคนเสมอตัว', async ({ page }) => {
    await setupTreatBill(page);
    await toggleTreat(page);

    await page.goto('/summary');
    await page.waitForLoadState('networkidle');

    // มีข้อมูลสรุปจริง (ยอดรวม 300) แต่ไม่มีใครต้องโอน
    await expect(page.getByText('฿300.00').first()).toBeVisible();
    await expect(page.getByText('🎁 แดง เลี้ยง — คนอื่นไม่ต้องหาร')).toBeVisible();
    await expect(
      page.getByText('ไม่มีใครต้องโอน — ทุกคนออกเงินพอดีกับส่วนของตัวเองแล้ว'),
    ).toBeVisible();
    await expect(page.getByText('ทุกคนเสมอตัว ไม่มีใครค้างใคร')).toBeVisible();

    // ไม่มีหนี้ค้าง → เคลียร์ได้เลย (nothingOwed = true เพราะ transfers ว่าง)
    await expect(page.getByText('จ่ายครบทุกคนแล้ว!')).toBeVisible();
  });

  test('หน้ารายการบิล: บิลเลี้ยงติดไอคอน 🎁', async ({ page }) => {
    await setupTreatBill(page);
    await toggleTreat(page);

    await page.goto('/bills');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('บิลเลี้ยงส่ง 🎁')).toBeVisible();
    await expect(page.getByText('คนจ่าย: แดง')).toBeVisible();
  });

  test('แท็บฉัน: คนที่ถูกเลี้ยงเห็นยอด ฿0.00 และไม่ติดใคร', async ({ page }) => {
    await setupTreatBill(page);
    await toggleTreat(page);
    await pickMe(page, 'ดำ');

    await expect(page.getByText('ยอดที่ฉันต้องจ่ายรวม', { exact: false })).toBeVisible();
    await expect(page.getByText('฿0.00', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('เคลียร์แล้ว ไม่มียอดค้าง ✓')).toBeVisible();
    await expect(page.getByText('ไม่มี — ฉันไม่ติดใคร')).toBeVisible();
    await expect(page.getByText('ไม่มี — ไม่มีใครติดฉัน')).toBeVisible();
    // ยังเห็นบิลที่ร่วม (ยอดของฉัน 0 แต่ไม่หายไปจากรายการ)
    await expect(page.getByText('บิลที่ฉันร่วม (1)')).toBeVisible();
  });

  test('แท็บฉัน: คนเลี้ยงเห็นว่าตัวเองรับยอดเต็ม', async ({ page }) => {
    await setupTreatBill(page);
    await toggleTreat(page);
    await pickMe(page, 'แดง');

    // แดงรับผิดชอบ 300 และออกเงิน 300 → สุทธิเสมอตัว ไม่มีใครต้องโอน
    await expect(page.getByText('฿300.00', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('เคลียร์แล้ว ไม่มียอดค้าง ✓')).toBeVisible();
    await expect(page.getByText(/ฉันเป็นคนออกเงิน/)).toBeVisible();
  });

  test('ปิดเลี้ยงกลับ → ยอดกลับมาหารเท่ากันและเกิดรายการโอนใหม่', async ({ page }) => {
    await setupTreatBill(page);
    await toggleTreat(page);
    await expect(page.getByText('฿0.00', { exact: true })).toHaveCount(2);

    // แตะซ้ำเพื่อปิดเลี้ยง
    await toggleTreat(page);
    await expect(page.getByText('฿100.00', { exact: true })).toHaveCount(3);
    await expect(page.getByText('🎁 แดง เลี้ยงบิลนี้ — คนอื่นไม่ต้องหาร')).toHaveCount(0);

    // สรุป: ดำ/ขาว ต้องโอนให้แดงคนละ 100
    await page.goto('/summary');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('โอนแล้ว 0/2 รายการ')).toBeVisible();
    await expect(page.getByRole('checkbox', { name: 'ดำ โอนให้ แดง แล้ว' })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: 'ขาว โอนให้ แดง แล้ว' })).toBeVisible();
  });

  test('ยกเลิกคนออกเงินของบิลเลี้ยง → ปลดสถานะเลี้ยงด้วย', async ({ page }) => {
    await setupTreatBill(page);
    await toggleTreat(page);
    await expect(page.getByText('🎁 แดง เลี้ยงบิลนี้ — คนอื่นไม่ต้องหาร')).toBeVisible();

    // แตะ chip คนจ่ายคนเดิมซ้ำ = ยกเลิกคนจ่าย → isTreat ต้องถูกปลดตาม
    await pickPayer(page, 'แดง');
    await expect(page.getByText('เลือกคนออกเงินก่อน')).toBeVisible();
    await expect(page.getByRole('switch', { name: 'บิลนี้คนจ่ายเลี้ยง' })).toBeDisabled();
    await expect(page.getByText('🎁 แดง เลี้ยงบิลนี้ — คนอื่นไม่ต้องหาร')).toHaveCount(0);
    // ไม่มีคนจ่ายแล้ว = บิลไม่เข้าสรุป ต้องบอกเหตุผล
    await expect(page.getByText('• ต้องเลือกคนออกเงิน')).toBeVisible();
  });
});
