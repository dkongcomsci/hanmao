import { expect, test } from '@playwright/test';
import { addMember, confirmPopup, dismissPopup, freshPage } from './helpers';

test.describe('หน้าสมาชิก (members)', () => {
  test.beforeEach(async ({ page }) => {
    await freshPage(page, '/members');
  });

  test('เพิ่มสมาชิกได้เมื่อกรอกชื่อ', async ({ page }) => {
    await expect(page.getByText('ยังไม่มีสมาชิก')).toBeVisible();
    await addMember(page, 'สมชาย');
    await expect(page.getByText('ยังไม่มีสมาชิก')).toHaveCount(0);
    await expect(page.getByText('สมชาย')).toBeVisible();
  });

  test('ปุ่มเพิ่มถูก disable เมื่อยังไม่กรอกชื่อ', async ({ page }) => {
    // ปุ่มเพิ่มเป็น disabled (aria-disabled) ตอนช่องว่าง → กดไม่ได้
    const btn = page.getByRole('button', { name: 'เพิ่มสมาชิก' });
    await expect(btn).toBeDisabled();
    await expect(page.getByText('ยังไม่มีสมาชิก')).toBeVisible();

    // พอพิมพ์ชื่อ ปุ่มจะกดได้
    await page.getByPlaceholder('ชื่อสมาชิก').fill('ทดสอบ');
    await expect(btn).toBeEnabled();
  });

  test('ช่องชื่อถูกล้างหลังเพิ่มสำเร็จ', async ({ page }) => {
    await addMember(page, 'อาทิตย์');
    await expect(page.getByPlaceholder('ชื่อสมาชิก')).toHaveValue('');
  });

  test('เพิ่มได้หลายคน', async ({ page }) => {
    await addMember(page, 'เอ');
    await addMember(page, 'บี');
    await addMember(page, 'ซี');
    await expect(page.getByText('เอ')).toBeVisible();
    await expect(page.getByText('บี')).toBeVisible();
    await expect(page.getByText('ซี')).toBeVisible();
  });

  test('เลือกประเภทการกิน (อาหาร) แล้วเพิ่มได้', async ({ page }) => {
    await addMember(page, 'ดี', 'อาหาร');
    await expect(page.getByText('ดี')).toBeVisible();
  });

  test('toggle มาถึง/กลับ', async ({ page }) => {
    await addMember(page, 'อี');
    await page.getByText('มาถึง').click();
    await expect(page.getByText('✓ มาแล้ว')).toBeVisible();
    await page.getByText('กลับ', { exact: true }).click();
    await expect(page.getByText('✓ กลับแล้ว')).toBeVisible();
  });

  test('ลบสมาชิก (ยืนยันก่อนลบ)', async ({ page }) => {
    await addMember(page, 'เอฟ');
    // กดลบ → popup ยืนยันในแอป (แทน window.confirm เดิม) → กดยืนยัน
    await page.getByText('ลบ', { exact: true }).click();
    await confirmPopup(page);
    await expect(page.getByText('เอฟ')).toHaveCount(0);
    await expect(page.getByText('ยังไม่มีสมาชิก')).toBeVisible();
  });

  test('ยกเลิกการลบ → สมาชิกยังอยู่', async ({ page }) => {
    await addMember(page, 'จี');
    await page.getByText('ลบ', { exact: true }).click();
    await dismissPopup(page);
    await expect(page.getByText('จี')).toBeVisible();
  });
});
