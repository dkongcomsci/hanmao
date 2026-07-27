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
