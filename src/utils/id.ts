import 'react-native-get-random-values';

/**
 * สร้าง UUID v4 — ใช้แทน local counter เดิม
 * กัน id ชนกันเมื่อหลายเครื่องสร้าง entity พร้อมกันใน group mode
 */
export function uuid(): string {
  // crypto.randomUUID มีทั้งบน web และ RN (ผ่าน react-native-get-random-values)
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  // fallback: ประกอบเองจาก getRandomValues
  const bytes = new Uint8Array(16);
  c.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0'));
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex
    .slice(6, 8)
    .join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10, 16).join('')}`;
}

/** โค้ดเชิญเข้ากลุ่มแบบสั้น อ่านง่าย (ไม่ใช้ตัวที่สับสน 0/O/1/I) สำหรับลิงก์/QR */
export function inviteCode(len = 6): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(len);
  globalThis.crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < len; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}
