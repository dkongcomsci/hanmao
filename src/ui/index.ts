import * as Clipboard from 'expo-clipboard';
import { Alert, Platform } from 'react-native';

// โทนสี + helper แสดงผลที่ใช้ร่วมกันทุกหน้า
export const colors = {
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
};

export function baht(n: number): string {
  return '฿' + (Math.round(n * 100) / 100).toLocaleString('th-TH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
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

/** ยืนยันก่อนทำสิ่งที่ย้อนกลับไม่ได้ (เช่น ลบ) — รองรับทั้ง native และ web */
export function confirmRemove(name: string, onConfirm: () => void) {
  const title = 'ยืนยันการลบ';
  const message = `ลบ "${name}" ?`;
  if (Platform.OS === 'web') {
    // eslint-disable-next-line no-alert
    if (typeof window !== 'undefined' && window.confirm(`${title}\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: 'ยกเลิก', style: 'cancel' },
    { text: 'ลบ', style: 'destructive', onPress: onConfirm },
  ]);
}

/** คัดลอกข้อความลงคลิปบอร์ด (รองรับทั้ง native และ web) */
export async function copyText(text: string): Promise<void> {
  await Clipboard.setStringAsync(text);
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
