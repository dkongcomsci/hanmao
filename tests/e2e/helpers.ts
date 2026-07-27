import { Page, expect } from '@playwright/test';

const STORAGE_KEY = 'hanmao:state:v1';

/** เปิดหน้า แล้วล้าง state เดิมใน localStorage ให้เริ่มสะอาดทุกเทส */
export async function freshPage(page: Page, path = '/') {
  await page.goto(path);
  await page.evaluate((k) => window.localStorage.removeItem(k), STORAGE_KEY);
  await page.reload();
  await page.waitForLoadState('networkidle');
}

/** เพิ่มสมาชิกผ่าน UI หน้า /members */
export async function addMember(page: Page, name: string, consumes?: 'ทั้งสอง' | 'อาหาร' | 'เครื่องดื่ม') {
  await page.getByPlaceholder('ชื่อสมาชิก').fill(name);
  if (consumes) {
    // เลือก chip ในฟอร์ม (อันแรกของหน้า)
    await page.getByText(consumes, { exact: true }).first().click();
  }
  await page.getByText('+ เพิ่มสมาชิก').click();
  await expect(page.getByText(name).first()).toBeVisible();
}
