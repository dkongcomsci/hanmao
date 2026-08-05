import * as Clipboard from 'expo-clipboard';
import { Alert, Platform } from 'react-native';
import type { AccessibilityRole, AccessibilityState } from 'react-native';

// โทนสี + helper แสดงผลที่ใช้ร่วมกันทุกหน้า
//
// ไฟล์นี้เป็น pure helper module — ห้าม import store/react (จะลาก native module
// เข้ามาจน unit test ที่ครอบ baht()/a11y() พังทั้งไฟล์) hook ที่ต้องพึ่ง store
// (useTheme) แยกไปอยู่ที่ ./theme.ts
//
// มีสอง palette (ธีมมืด/สว่าง) ที่มี key ครบเท่ากันทุกตัว — หน้าจอดึง palette ปัจจุบัน
// ผ่าน useTheme() (อ่านธีมจาก store, อยู่ที่ ./theme.ts) ไม่ควรอ้าง darkColors/lightColors ตรง ๆ ในหน้าจอ
//
// darkColors = ค่าเดิมทั้งหมด (ธีมมืดเป็น default หน้าตาต้องเหมือนเดิมเป๊ะ)
export const darkColors = {
  bg: '#0f1115',
  card: '#1a1d24',
  cardAlt: '#22262f',
  border: '#2c313c',
  text: '#f2f4f8',
  sub: '#98a2b3',
  primary: '#4f8cff',
  food: '#ff8a4c',
  drink: '#3dd6c4',
  danger: '#ff5c5c',
  good: '#4cd07d',
  /** ข้อความ/ไอคอนที่วางบนพื้นสีเน้น (primary/danger/good) */
  onPrimary: '#ffffff',
  /** พื้นสว่างที่ต้องสว่างจริงเสมอ (เช่น พื้นหลัง QR ที่ต้องสแกนติด) */
  surfaceLight: '#ffffff',
  /** ข้อความ/ลายบนพื้นสว่าง (surfaceLight) */
  onLight: '#0b0d10',
};

/** ชนิดของ palette — ทั้ง dark/light ต้องมี key ตรงกันทุกตัว */
export type Palette = typeof darkColors;

// lightColors = ธีมสว่าง — พื้นสว่าง ตัวอักษรเข้ม
// primary/food/drink/danger/good ปรับให้เข้มพออ่านออกบนพื้นขาว (contrast ผ่าน)
// surfaceLight ยังเป็น #ffffff และ onLight ยังเป็นสีเข้ม (พื้น QR ต้องสแกนติด +
// การ์ด shareCard export เป็นรูปต้องอ่านออกเสมอในทั้งสองธีม — ดู ADR 0004)
export const lightColors: Palette = {
  bg: '#f4f6fa',
  card: '#ffffff',
  cardAlt: '#eef1f6',
  border: '#d5dae3',
  text: '#12151b',
  sub: '#5b6472',
  primary: '#2563eb',
  food: '#c85a1b',
  drink: '#0f857a',
  danger: '#d92d2d',
  good: '#1f9d57',
  onPrimary: '#ffffff',
  surfaceLight: '#ffffff',
  onLight: '#0b0d10',
};

/**
 * palette เดิมที่ export ไว้เพื่อ backward-compat — ชี้ไป darkColors
 * เป้าหมาย: หน้าจอทุกหน้าเลิกใช้ `colors` ตรง ๆ แล้วดึงจาก useTheme() แทน
 */
export const colors = darkColors;

export function baht(n: number): string {
  const v = Math.round(n * 100) / 100;
  // กัน "-฿0.00" ตอนค่าติดลบจิ๋ว ๆ ที่ปัดแล้วเป็น 0 (v === 0 จับ -0 ด้วย)
  const safe = v === 0 ? 0 : v;
  // เครื่องหมายลบต้องอยู่ "หน้า" สัญลักษณ์เงินตามธรรมเนียม (-฿50.00 ไม่ใช่ ฿-50.00)
  const sign = safe < 0 ? '-' : '';
  const body = Math.abs(safe).toLocaleString('th-TH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return sign + '฿' + body;
}

/** props ชุด a11y ที่ทำงานทั้ง native (accessibility*) และ web (aria-*) */
export type A11yProps = {
  accessibilityRole: AccessibilityRole;
  accessibilityState?: AccessibilityState;
  'aria-selected'?: boolean;
  'aria-pressed'?: boolean;
  'aria-checked'?: boolean | 'mixed';
  'aria-disabled'?: boolean;
  'aria-busy'?: boolean;
  'aria-expanded'?: boolean;
};

/**
 * บอก role + สถานะให้ screen reader ครบทั้งสองแพลตฟอร์ม — ใช้แบบ spread:
 * `<Pressable {...a11y('checkbox', { checked: on })} accessibilityLabel="..." />`
 *
 * ## ทำไมต้องมีตัวนี้ (อย่าถอด aria-* ออก)
 * `accessibilityState` เพียงตัวเดียว **หายไปเฉย ๆ บนเว็บ**: react-native-web แปลงเป็น
 * attribute ให้เฉพาะ prop ที่ชื่อ `aria-*` ตรง ๆ (createDOMProps อ่าน `aria-checked`/
 * `aria-selected`/`aria-pressed`/`aria-disabled`) ไม่ได้แตก object `accessibilityState`
 * ⇒ ปุ่มที่เลือก/ติ๊กอยู่ไม่มี `aria-checked`/`aria-pressed` ใน DOM เลย
 * screen reader บนเว็บจึงไม่รู้ว่าอะไรถูกเลือกอยู่ (บั๊กที่ฟังก์ชันนี้มาแก้)
 * จึงต้องส่ง **ทั้งคู่**: `accessibilityState` (native อ่าน) + `aria-*` (web อ่าน)
 *
 * ## ทำไมแปลงตาม role ไม่ใช่ใส่ชื่อตรงตัว
 * ยืนยันด้วย Chrome accessibility tree จริง (CDP `Accessibility.getFullAXTree`):
 * `aria-selected` บน `role="button"` **ถูก Chrome ทิ้ง** ไม่ขึ้นใน a11y tree เลย
 * (ARIA อนุญาต aria-selected แค่บาง role เช่น tab/option/row)
 * ปุ่มสองสถานะบนเว็บต้องใช้ `aria-pressed` ⇒ ที่นี่แปลง `selected` เป็น
 * - role `button` → `aria-pressed` (ปุ่มกดค้าง/เลือกอยู่)
 * - role อื่น (tab/option) → `aria-selected`
 * ส่วน `checked` → `aria-checked` (ใช้ได้กับ checkbox/switch/radio ตามที่ทดสอบแล้ว)
 *
 * ## ทำไมไม่ต้อง `as any`
 * ชื่อ `aria-selected`/`aria-checked`/`aria-disabled`/`aria-busy`/`aria-expanded`
 * ถูกประกาศไว้ใน `AccessibilityProps` ของ React Native อยู่แล้ว และ prop ที่มีขีดกลาง
 * TypeScript ยอมให้ส่งผ่าน JSX ได้ตามสเปก ⇒ ไทป์ยังตรวจได้ครบทั้ง object
 */
export function a11y(role: AccessibilityRole, state?: AccessibilityState): A11yProps {
  const out: A11yProps = { accessibilityRole: role, accessibilityState: state };
  if (state?.selected !== undefined) {
    if (role === 'button') out['aria-pressed'] = state.selected;
    else out['aria-selected'] = state.selected;
  }
  if (state?.checked !== undefined) out['aria-checked'] = state.checked;
  if (state?.disabled !== undefined) out['aria-disabled'] = state.disabled;
  if (state?.busy !== undefined) out['aria-busy'] = state.busy;
  if (state?.expanded !== undefined) out['aria-expanded'] = state.expanded;
  return out;
}

export function timeStr(ms: number | null): string {
  if (!ms) return '-';
  const d = new Date(ms);
  return d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
}

export const consumesLabel: Record<string, string> = {
  both: 'ทั้งสอง',
  food: 'อาหาร',
  drink: 'เครื่องดื่ม',
};

export const categoryLabel: Record<string, string> = {
  food: 'อาหาร',
  drink: 'เครื่องดื่ม',
  mixed: 'รวม',
};

export const splitModeLabel: Record<string, string> = {
  equal: 'หารเท่ากัน',
  itemized: 'หารตามที่กิน',
  time: 'หารตามเวลา',
};

/**
 * ยืนยันก่อนทำ action ที่ย้อนกลับไม่ได้ — รองรับทั้ง native (Alert) และ web (window.confirm)
 * ใช้ได้ทั้งการลบและการเคลียร์/ปิดวง โดยกำหนดหัวข้อ/รายละเอียด/ป้ายปุ่มเองได้
 */
export function confirmAction(opts: {
  title: string;
  message: string;
  /** ป้ายปุ่มยืนยัน (ค่าเริ่ม "ลบ") */
  confirmLabel?: string;
  onConfirm: () => void;
}) {
  const { title, message, confirmLabel = 'ลบ', onConfirm } = opts;
  if (Platform.OS === 'web') {
    // web ไม่มี Alert.alert แบบ native → ใช้ window.confirm
    if (typeof window !== 'undefined' && window.confirm(`${title}\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: 'ยกเลิก', style: 'cancel' },
    { text: confirmLabel, style: 'destructive', onPress: onConfirm },
  ]);
}

/** ยืนยันก่อนลบสิ่งที่ย้อนกลับไม่ได้ */
export function confirmRemove(name: string, onConfirm: () => void) {
  confirmAction({
    title: 'ยืนยันการลบ',
    message: `ลบ "${name}" ?`,
    confirmLabel: 'ลบ',
    onConfirm,
  });
}

/**
 * แจ้งเตือนผู้ใช้ (ข้อความสั้น ๆ) — `Alert.alert` ไม่โผล่บน web
 * web: ใช้ window.alert; native: Alert.alert
 */
export function notify(title: string, message?: string) {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') window.alert(message ? `${title}\n${message}` : title);
    return;
  }
  Alert.alert(title, message);
}

/**
 * แปลง error เป็นข้อความพร้อมแสดงบนจอ (ห้ามปล่อยให้ผู้ใช้กดแล้วเงียบ)
 * - error ที่ store ตั้งใจเขียนให้ผู้ใช้อ่าน (มีตัวอักษรไทย) → ใช้ข้อความนั้นตรง ๆ
 * - error เชิงเทคนิค/ภาษาอังกฤษ (เช่น "Failed to fetch") → ใช้ fallback ไทยแล้วต่อรายละเอียดในวงเล็บ
 * - ไม่มีข้อความอะไรเลย → fallback
 * รองรับทั้ง Error, error ของ Supabase (object ที่มี message) และ string
 */
export function friendlyError(e: unknown, fallback: string): string {
  let raw = '';
  if (typeof e === 'string') raw = e;
  else {
    const msg = (e as { message?: unknown } | null | undefined)?.message;
    if (typeof msg === 'string') raw = msg;
  }
  raw = raw.trim();
  if (!raw) return fallback;
  // มีอักษรไทย = เขียนมาให้ผู้ใช้อ่านแล้ว
  if (/[฀-๿]/.test(raw)) return raw;
  return `${fallback} (${raw})`;
}

/**
 * คัดลอกข้อความลงคลิปบอร์ด — คืน true เมื่อสำเร็จ (ให้หน้าจอเลือกแสดงผลเองได้)
 * web: ลอง navigator.clipboard ก่อน (expo-clipboard บนเว็บพลาดได้ถ้าไม่ใช่ secure context)
 */
export async function copyText(text: string): Promise<boolean> {
  if (Platform.OS === 'web') {
    try {
      const nav = globalThis.navigator as { clipboard?: { writeText: (t: string) => Promise<void> } };
      if (nav?.clipboard) {
        await nav.clipboard.writeText(text);
        return true;
      }
    } catch {
      // ตกไปลอง expo-clipboard ต่อ
    }
  }
  try {
    await Clipboard.setStringAsync(text);
    return true;
  } catch {
    return false;
  }
}

/** เหลือเฉพาะตัวเลขจากที่ผู้ใช้พิมพ์ (ตัดช่องว่าง/ขีด) */
export function digitsOnly(v: string): string {
  return v.replace(/\D/g, '');
}

/**
 * ตรวจว่าเป็นพร้อมเพย์ที่ใช้ได้ไหม: เบอร์มือถือ 10 หลัก หรือ เลขบัตร ปชช. 13 หลัก
 * (ยอมรับค่าว่าง = ไม่ระบุ)
 */
export function isValidPromptPay(v: string | null | undefined): boolean {
  if (!v) return true;
  const d = digitsOnly(v);
  return d.length === 10 || d.length === 13;
}

/** จัดรูปพร้อมเพย์ให้อ่านง่าย: เบอร์ 0XX-XXX-XXXX, บัตร X-XXXX-XXXXX-XX-X */
export function formatPromptPay(v: string | null | undefined): string {
  if (!v) return '';
  const d = digitsOnly(v);
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  if (d.length === 13) return `${d.slice(0, 1)}-${d.slice(1, 5)}-${d.slice(5, 10)}-${d.slice(10, 12)}-${d.slice(12)}`;
  return d;
}
