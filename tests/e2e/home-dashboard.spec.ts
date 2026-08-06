import { Page, expect, test } from '@playwright/test';
import {
  addItem,
  addMember,
  confirmPopup,
  createBill,
  freshPage,
  markArrived,
  markLeft,
  openTab,
  pickPayer,
  visibleText,
} from './helpers';

/**
 * หน้าแรก (dashboard) ตอน "มีข้อมูลแล้ว"
 *
 * ทำไมไฟล์นี้ต้องมี: navigation.spec.ts ครอบหน้าแรกแค่ตอนว่าง (onboarding 3 ขั้น)
 * ส่วนที่เป็นตัวเลขจริง — ยอดรวมทั้งหมด / "n คน · ยังอยู่ k · m บิล" / ทางลัด NavCard —
 * ไม่มีเทสไหนแตะเลย ทั้งที่ hero ใช้ computeTotals() ตัวเดียวกับหน้าสรุป
 * (ถ้าสูตรหารเพี้ยน หน้าแรกจะโชว์ยอดผิดเป็นที่แรกที่ผู้ใช้เห็น)
 */

/** เตรียม: 2 สมาชิก + บิล 100 บาท มีคนออกเงินครบ (บิลเข้าสรุปแล้ว) */
async function setupOneBill(page: Page, price = '100') {
  await freshPage(page, '/members');
  await addMember(page, 'แดง');
  await addMember(page, 'ดำ');
  await createBill(page, 'บิลข้าว');
  await addItem(page, 'ข้าวผัด', price);
  await pickPayer(page, 'แดง');
}

test.describe('หน้าแรก: hero ยอดรวม', () => {
  test('มีบิลสมบูรณ์ → hero โชว์ยอดรวมและจำนวนคน/บิลตามจริง', async ({ page }) => {
    await setupOneBill(page);
    await openTab(page, 'home');

    await expect(visibleText(page, 'ยอดรวมทั้งหมด', { exact: true })).toBeVisible();
    // hero ห่อด้วย accessible + accessibilityLabel → เช็กผ่าน aria-label ได้ตรงตัว
    await expect(page.getByLabel('ยอดรวมทั้งหมด ฿100.00')).toBeVisible();
    // ทั้งคู่ยังไม่ได้ตั้งเวลากลับ → นับเป็น "ยังอยู่" ทั้ง 2
    await expect(visibleText(page, '2 คน · ยังอยู่ 2 · 1 บิล')).toBeVisible();
  });

  test('บิลยังไม่สมบูรณ์ (ไม่มีคนออกเงิน) → ยอดรวมเป็น ฿0.00 แต่ยังนับจำนวนบิล', async ({ page }) => {
    await freshPage(page, '/members');
    await addMember(page, 'แดง');
    await createBill(page, 'บิลค้าง');
    await addItem(page, 'ข้าวผัด', '100');
    // ไม่เลือกคนออกเงิน → billComplete = false → ไม่เข้า computeTotals
    await openTab(page, 'home');

    await expect(page.getByLabel('ยอดรวมทั้งหมด ฿0.00')).toBeVisible();
    await expect(visibleText(page, '1 คน · ยังอยู่ 1 · 1 บิล')).toBeVisible();
  });

  test('หลายบิล → ยอดรวมเท่าผลบวกของทุกบิล (ตรงกับหน้าสรุป)', async ({ page }) => {
    await setupOneBill(page, '100');
    await createBill(page, 'บิลเหล้า');
    await addItem(page, 'เบียร์', '250.50');
    await pickPayer(page, 'ดำ');

    await openTab(page, 'home');
    await expect(page.getByLabel('ยอดรวมทั้งหมด ฿350.50')).toBeVisible();
    await expect(visibleText(page, '2 คน · ยังอยู่ 2 · 2 บิล')).toBeVisible();

    // ต้องตรงกับ "ยอดรวมทุกบิล" ในหน้าสรุป (ใช้ computeTotals ตัวเดียวกัน)
    await openTab(page, 'summary');
    await expect(visibleText(page, 'ยอดรวมทุกบิล')).toBeVisible();
    await expect(visibleText(page, '฿350.50').first()).toBeVisible();
  });

  test('ค่าบริการ/VAT รวมอยู่ในยอดรวมของหน้าแรกด้วย', async ({ page }) => {
    await setupOneBill(page, '100');
    await page.getByRole('textbox', { name: 'ค่าบริการ เปอร์เซ็นต์' }).fill('10');
    await page.getByRole('textbox', { name: 'ภาษีมูลค่าเพิ่ม เปอร์เซ็นต์' }).fill('7');

    await openTab(page, 'home');
    // 100 + 10 (service) + 7.70 (VAT บน 110) = 117.70
    await expect(page.getByLabel('ยอดรวมทั้งหมด ฿117.70')).toBeVisible();
  });

  test('ตั้งเวลากลับ → ตัวนับ "ยังอยู่" ลดลง (แต่จำนวนคนเท่าเดิม)', async ({ page }) => {
    await setupOneBill(page);
    await openTab(page, 'members');
    await markArrived(page, 'แดง');
    await markLeft(page, 'แดง');

    await openTab(page, 'home');
    await expect(visibleText(page, '2 คน · ยังอยู่ 1 · 1 บิล')).toBeVisible();
  });
});

test.describe('หน้าแรก: onboarding vs ทางลัด', () => {
  test('มีข้อมูลแล้ว → onboarding หาย และทางลัด 3 การ์ดโผล่แทน', async ({ page }) => {
    await setupOneBill(page);
    await openTab(page, 'home');

    await expect(visibleText(page, 'เริ่มใช้งานใน 3 ขั้น 👋')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'สมาชิก. 2 คน' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'บิลทั้งหมด. 1 บิล' })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'สรุปหารเงิน. ยอดต่อคน + ใครโอนให้ใคร' }),
    ).toBeVisible();
  });

  test('มีแต่สมาชิก ยังไม่มีบิล → ทางลัดโผล่ พร้อมคำชวนสร้างบิล', async ({ page }) => {
    await freshPage(page, '/members');
    await addMember(page, 'แดง');
    await openTab(page, 'home');

    await expect(visibleText(page, 'เริ่มใช้งานใน 3 ขั้น 👋')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'สมาชิก. 1 คน' })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'บิลทั้งหมด. ยังไม่มีบิล — แตะเพื่อสร้าง' }),
    ).toBeVisible();
  });

  test('มีแต่บิล ยังไม่มีสมาชิก → ทางลัดโผล่ พร้อมคำชวนเพิ่มสมาชิก', async ({ page }) => {
    await freshPage(page, '/');
    await createBill(page, 'บิลเดี่ยว');
    await openTab(page, 'home');

    await expect(visibleText(page, 'เริ่มใช้งานใน 3 ขั้น 👋')).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'สมาชิก. ยังไม่มีสมาชิก — แตะเพื่อเพิ่ม' }),
    ).toBeVisible();
  });

  test('เคลียร์ข้อมูลทั้งหมด → หน้าแรกกลับไปเป็น onboarding', async ({ page }) => {
    await setupOneBill(page);
    await openTab(page, 'home');
    await expect(page.getByRole('button', { name: 'สมาชิก. 2 คน' })).toBeVisible();

    // ปุ่มเคลียร์โผล่เฉพาะเมื่อไม่มีหนี้ค้าง → ต้องติ๊ก "โอนแล้ว" ให้ครบก่อน
    await openTab(page, 'summary');
    await page.getByRole('checkbox', { name: 'ดำ โอนให้ แดง แล้ว' }).click();
    await page.getByRole('button', { name: 'ลบข้อมูลทั้งหมดถาวร' }).click();
    await confirmPopup(page);

    await openTab(page, 'home');
    await expect(visibleText(page, 'เริ่มใช้งานใน 3 ขั้น 👋')).toBeVisible();
    await expect(page.getByLabel('ยอดรวมทั้งหมด ฿0.00')).toBeVisible();
    await expect(visibleText(page, '0 คน · ยังอยู่ 0 · 0 บิล')).toBeVisible();
  });
});

test.describe('หน้าแรก: ทางลัดกดไปหน้าที่ถูกต้อง', () => {
  test('กดการ์ดสมาชิก → ไปหน้าสมาชิก', async ({ page }) => {
    await setupOneBill(page);
    await openTab(page, 'home');
    await page.getByRole('button', { name: 'สมาชิก. 2 คน' }).click();
    await expect(page.getByPlaceholder('ชื่อสมาชิก')).toBeVisible();
    expect(new URL(page.url()).pathname).toBe('/members');
  });

  test('กดการ์ดบิลทั้งหมด → ไปหน้าบิล', async ({ page }) => {
    await setupOneBill(page);
    await openTab(page, 'home');
    await page.getByRole('button', { name: 'บิลทั้งหมด. 1 บิล' }).click();
    // ต้องระบุ placeholder แบบยาว: หน้ารายละเอียดบิลที่ค้างใน DOM ก็มีช่อง placeholder 'ชื่อบิล'
    await expect(page.getByPlaceholder(/^ชื่อบิล เช่น/)).toBeVisible();
    expect(new URL(page.url()).pathname).toBe('/bills');
  });

  test('กดการ์ดสรุปหารเงิน → ไปหน้าสรุป', async ({ page }) => {
    await setupOneBill(page);
    await openTab(page, 'home');
    await page.getByRole('button', { name: 'สรุปหารเงิน. ยอดต่อคน + ใครโอนให้ใคร' }).click();
    await expect(visibleText(page, 'ยอดรวมทุกบิล')).toBeVisible();
    expect(new URL(page.url()).pathname).toBe('/summary');
  });
});

test.describe('หน้าแรก: ยอดรวมยังถูกต้องหลัง reload', () => {
  test('reload หน้าแรก → ยอดรวมเดิม (อ่านจาก storage ได้ครบ)', async ({ page }) => {
    await setupOneBill(page, '99.99');
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.getByLabel('ยอดรวมทั้งหมด ฿99.99')).toBeVisible();

    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.getByLabel('ยอดรวมทั้งหมด ฿99.99')).toBeVisible();
    await expect(visibleText(page, '2 คน · ยังอยู่ 2 · 1 บิล')).toBeVisible();
  });
});
