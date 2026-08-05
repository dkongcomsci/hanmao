import { Page, expect } from '@playwright/test';

/**
 * ทุกคีย์ที่ store เขียนลง storage — ต้องล้างให้ครบ ไม่งั้นข้อมูลจากเทสก่อนค้างข้ามเทส
 * (ยืนยันชื่อคีย์จาก src/data/store.tsx)
 * - hanmao:state:v1   สมาชิก/บิล/settlements
 * - hanmao:session:v1 อยู่วงไหน + เราเป็น member ไหนในวง (group mode)
 * - hanmao:me:v1      "ฉันคือ member ไหน" (local mode) → ถ้าค้าง แท็บ "ฉัน" จะเห็นคนของเทสก่อน
 * - hanmao:theme:v1   ธีมสว่าง/มืด (device preference) → ถ้าค้าง เทส default=dark จะแดงมั่ว
 */
export const STORAGE_KEYS = [
  'hanmao:state:v1',
  'hanmao:session:v1',
  'hanmao:me:v1',
  'hanmao:theme:v1',
] as const;

/** เปิดหน้า แล้วล้าง state เดิมใน localStorage ให้เริ่มสะอาดทุกเทส */
export async function freshPage(page: Page, path = '/') {
  await page.goto(path);
  await page.evaluate((keys) => {
    for (const k of keys) window.localStorage.removeItem(k);
  }, STORAGE_KEYS as unknown as string[]);
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

/**
 * สร้างบิลใหม่จากหน้า /bills แล้วเข้าหน้ารายละเอียดบิลนั้น
 * (ปุ่ม "+ เพิ่มบิล" กดแล้ว router.push ไป /bill/<id> ให้เอง)
 */
export async function createBill(page: Page, name: string) {
  await page.goto('/bills');
  await page.waitForLoadState('networkidle');
  // placeholder แบบยาวเป็นของฟอร์มสร้างบิลเท่านั้น (หน้ารายละเอียดบิลใช้ 'ชื่อบิล' สั้น ๆ)
  await page.getByPlaceholder(/^ชื่อบิล เช่น/).fill(name);
  await page.getByRole('button', { name: 'เพิ่มบิลใหม่' }).click();
  // เข้าหน้ารายละเอียดแล้ว (หัวข้อ "วิธีหาร" มีเฉพาะหน้านี้)
  await expect(page.getByText('วิธีหาร')).toBeVisible();
}

/** เพิ่มเมนู 1 รายการในหน้ารายละเอียดบิล (ต้องอยู่หน้า /bill/<id> แล้ว) */
export async function addItem(page: Page, name: string, price: string) {
  await page.getByPlaceholder('ชื่อเมนู').fill(name);
  await page.getByPlaceholder('ราคา').fill(price);
  await page.getByRole('button', { name: 'เพิ่มเมนู' }).click();
  await expect(page.getByText(name, { exact: true })).toBeVisible();
}

/**
 * เลือกคนออกเงินของบิล (ยิงด้วย aria-label เฉพาะของ chip คนจ่าย)
 * ห้ามใช้ getByText(ชื่อ) เพราะชื่อคนโผล่ทั้งใน chip คนจ่าย/ผู้ร่วมบิล/ยอดต่อคน → ชนกัน
 */
export async function pickPayer(page: Page, name: string) {
  await page.getByRole('button', { name: `คนออกเงิน ${name}` }).click();
}

/** เปิด/ปิดสวิตช์ "คนจ่ายเลี้ยง" ของบิล (ต้องเลือกคนจ่ายก่อน ไม่งั้นปุ่ม disabled) */
export async function toggleTreat(page: Page) {
  await page.getByRole('switch', { name: 'บิลนี้คนจ่ายเลี้ยง' }).click();
}

/**
 * ป้ายของแท็บล่าง (ค่าจาก tabBarAccessibilityLabel ใน app/_layout.tsx)
 * ต้องยิงด้วยชื่อเต็ม ไม่ใช่ regex สั้น ๆ: /สรุป/ ชนทั้ง "สรุปหารเงิน..." และ "ฉัน สรุปเฉพาะของคุณ"
 */
export const TABS = {
  home: 'หน้าแรก ภาพรวมยอดรวม',
  members: 'สมาชิก จัดการรายชื่อคน',
  bills: 'บิล รายการบิลทั้งหมด',
  summary: 'สรุปหารเงิน ยอดต่อคนและการโอน',
  me: 'ฉัน สรุปเฉพาะของคุณ',
} as const;

/** สลับแท็บล่าง (ใช้ชื่อแท็บจาก TABS เพื่อไม่ให้ชนกันเอง) */
export async function openTab(page: Page, tab: keyof typeof TABS) {
  await page.getByRole('tab', { name: TABS[tab] }).click();
}

/** ตัดหน้าจอของแท็บที่ไม่ได้เลือกออก (react-navigation ครอบด้วย aria-hidden="true") */
const NOT_HIDDEN = 'xpath=self::*[not(ancestor::*[@aria-hidden="true"])]';

/**
 * ยิงข้อความ "ที่ผู้ใช้เห็นจริงบนแท็บปัจจุบัน"
 *
 * ทำไมต้องมี: react-navigation bottom-tabs บน web ไม่ unmount หน้าจอแท็บที่เคยเปิด
 * มันแค่ครอบด้วย `aria-hidden="true"` แล้วซ่อนทางสายตา → `getByText()` ยังเจอข้อความ
 * จากแท็บก่อนหน้า (และ `isVisible()` ก็ยังเป็น true) จนชน strict mode
 * ยืนยันด้วยการรันจริง: หลังสลับ /bills → /summary คำว่า "ยังไม่มีบิล" เจอ 2 ตัว
 * (ของหน้าสรุป 1 + ของหน้าบิลที่คาอยู่ 1) — ตัวกรองนี้ทำให้เหลือ 1
 *
 * ใช้เฉพาะกรณีที่ข้อความชนข้ามแท็บ; ถ้าข้อความซ้ำในหน้าเดียวกันจริง ๆ ให้ใช้ toHaveCount()
 */
export function visibleText(page: Page, text: string | RegExp, opts?: { exact?: boolean }) {
  return page.getByText(text, opts).locator(NOT_HIDDEN);
}

/**
 * ปุ่ม toggle มา/กลับ ของสมาชิกคนหนึ่งที่หน้า /members
 * ปุ่มพวกนี้ใช้ aria-label ซ้ำกันทุกแถว ('มาถึง'/'กลับ') → ต้องจำกัดขอบเขตด้วยการ์ดที่มีชื่อคนนั้น
 * (`.last()` = การ์ด div ที่แคบสุดที่ยังมีทั้งชื่อและปุ่มนั้นอยู่)
 */
export function timeToggle(page: Page, name: string, label: string) {
  return page
    .locator('div')
    .filter({ hasText: name })
    .filter({ has: page.getByRole('checkbox', { name: label }) })
    .last()
    .getByRole('checkbox', { name: label });
}

/** ตั้งเวลามาถึงของสมาชิก (ต้องอยู่หน้า /members) */
export async function markArrived(page: Page, name: string) {
  await timeToggle(page, name, 'มาถึง').click();
  await expect(timeToggle(page, name, '✓ มาแล้ว')).toBeVisible();
}

/** ตั้งเวลากลับของสมาชิก (ต้องอยู่หน้า /members) */
export async function markLeft(page: Page, name: string) {
  await timeToggle(page, name, 'กลับ').click();
  await expect(timeToggle(page, name, '✓ กลับแล้ว')).toBeVisible();
}

/** ตั้งว่า "ฉันคือใคร" ในแท็บฉัน (ต้องมีสมาชิกชื่อนี้อยู่แล้ว) */
export async function pickMe(page: Page, name: string) {
  await page.goto('/me');
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: `ฉันคือ ${name}` }).click();
}
