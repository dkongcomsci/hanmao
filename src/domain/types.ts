// โดเมนหลักของแอปหารค่าอาหาร/เครื่องดื่ม (ฮารเหมา)

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
};
