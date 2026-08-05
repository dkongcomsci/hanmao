// โดเมนหลักของแอปหารค่าอาหาร/เครื่องดื่ม (หารเมา)

/** ประเภทที่คนคนหนึ่งจะร่วมจ่าย */
export type Consumes = 'both' | 'food' | 'drink';

/** สมาชิกในวง */
export type Member = {
  id: string;
  name: string;
  /** กินเฉพาะอาหาร / เฉพาะเครื่องดื่ม / ทั้งสอง */
  consumes: Consumes;
  /** เวลามาถึง (epoch ms) — null = อยู่ตั้งแต่ต้น */
  arrivedAt: number | null;
  /** เวลากลับ (epoch ms) — null = ยังอยู่ */
  leftAt: number | null;
  /** auth uid ที่ claim member คนนี้ (group mode); null = ยังไม่มีใคร claim */
  userId?: string | null;
  /** พร้อมเพย์ (เบอร์มือถือ 10 หลัก หรือ เลขบัตร ปชช. 13 หลัก) ไว้ให้ copy ตอนโอน; null = ไม่ระบุ */
  promptPay?: string | null;
};

/** วง (กลุ่มหารเงินหนึ่งครั้ง) — มีเฉพาะ group mode */
export type Group = {
  id: string;
  name: string;
  /** โค้ดเชิญสำหรับ invite link / QR */
  inviteCode: string;
};

/** หมวดของบิล — ใช้จับคู่กับ consumes ของสมาชิก */
export type BillCategory = 'food' | 'drink' | 'mixed';

/** รายการเมนูภายในบิล */
export type BillItem = {
  id: string;
  name: string;
  price: number;
  /**
   * รายชื่อ member id ที่ร่วมหารเมนูนี้
   * ถ้าว่าง = หารกับทุกคนที่เข้าเงื่อนไข (ตาม category + ช่วงเวลา)
   */
  participantIds: string[];
};

/** วิธีหารของบิล */
export type SplitMode =
  | 'equal'      // หารเท่ากันทุกคนที่ร่วมบิล
  | 'itemized'   // หารตามเมนูที่แต่ละคนกินจริง
  | 'time';      // หารตามสัดส่วนเวลาที่อยู่ (pro-rate)

export type Bill = {
  id: string;
  name: string;
  category: BillCategory;
  splitMode: SplitMode;
  items: BillItem[];
  /**
   * member id ที่อยู่ในบิลนี้ (เผื่อคนมาทีหลัง/กลับก่อน)
   * ถ้าว่าง = ใช้ทุกคนที่เข้าเงื่อนไข category
   */
  memberIds: string[];
  /** ใครเป็นคนออกเงินบิลนี้ (member id) — แต่ละบิลอาจคนละคน; null = ยังไม่ระบุ */
  paidById: string | null;
  /** บิลนี้คนจ่ายเลี้ยง = คนจ่ายรับผิดชอบยอดเต็ม คนอื่นจ่าย 0 */
  isTreat?: boolean;
  /** ส่วนลดเป็นจำนวนเงิน (บาท) */
  discount: number;
  /** service charge เป็น % เช่น 10 */
  serviceChargePct: number;
  /** vat เป็น % เช่น 7 */
  vatPct: number;
  createdAt: number;
};

export type AppState = {
  members: Member[];
  bills: Bill[];
  /** พิกัดพื้นที่ร้าน (ไว้เช็ก geofence) */
  venue: { lat: number; lng: number; radiusM: number } | null;
  /**
   * รายการโอนที่ทำเสร็จแล้ว (ติ๊ก "โอนแล้ว/จ่ายแล้ว")
   * เก็บเป็น key จาก transferKey() ใน split.ts — **ห้ามประกอบ key เองในหน้าจอ/store**
   * มี 2 รูปแบบ:
   * - `${fromId}>${toId}@${ยอด 2 ตำแหน่ง}` เช่น 'B>A@550.00' — ปกติ (ผูกทิศ+ยอด, ADR 0003)
   * - `${idน้อย}|${idมาก}@t${hash}` เช่น 'A|B@t19v3920.12kstee' — เมื่อยอดลอยตามเวลา
   *   (บิลโหมด time ที่ยังมีคนไม่กลับ) hash = ลายนิ้วมือของข้อมูลที่กำหนดยอด ไม่ผูกนาฬิกา
   *   แบบนี้ผูกแค่ "คู่คน" ไม่ผูกทิศทาง เพราะเวลาที่เดินไปทำให้ยอดพลิกเครื่องหมายได้เอง
   *   (คนยังนั่งอยู่รับผิดชอบมากขึ้นเรื่อย ๆ จนเจ้าหนี้กลายเป็นลูกหนี้) โดยผู้ใช้ไม่ได้แก้อะไร
   *
   * ทั้งสองแบบ **เป็นโมฆะเองเมื่อข้อมูลที่กำหนดยอดเปลี่ยน** (เพิ่ม/แก้/ลบบิล เมนู สมาชิก คนจ่าย)
   * = การติ๊ก "โอนแล้ว" เดิมไม่ match ต้องติ๊กใหม่
   * (กันเคสกล่อง "จ่ายครบทุกคนแล้ว" โผล่ทั้งที่ยังค้างเงิน แล้วปลดล็อกปุ่มลบข้อมูลถาวร)
   * ต่างกันที่แบบ hash **ไม่** เป็นโมฆะเพราะเวลาเดินไปเฉย ๆ (ยอดโหมด time ขยับทุกวินาที)
   * แต่กลายเป็นโมฆะตอนคนสุดท้ายติ๊ก "กลับแล้ว" (ยอดหยุดลอย key ย้ายไปแบบผูกยอด)
   * = ต้องติ๊กใหม่บนยอดปิดจริงก่อนปิดวง ซึ่งเป็นด่านกันเงินหายที่ตั้งใจให้มี
   *
   * key รูปแบบเก่า ('B>A') จะไม่ match — ถือเป็น "ยังไม่โอน" ซึ่งปลอดภัยกว่า
   * ใช้ pruneSettlements() ตัด key ที่ไม่ตรงกับรายการโอนปัจจุบันออกได้
   */
  settlements: string[];
};
