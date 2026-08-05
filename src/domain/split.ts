import { AppState, Bill, BillItem, Consumes, Member } from './types';

// ทุกฟังก์ชันในไฟล์นี้เป็น pure — ห้ามมี side-effect, ห้ามเรียก Date.now()/storage/network
// เวลา "ตอนนี้" ต้องส่งเข้ามาทาง asOf เท่านั้น (ไม่ส่ง = ใช้ bill.createdAt แบบเดิม)

/**
 * บวกเลขทศนิยมให้ได้ผล "เท่ากันทุกลำดับ input"
 * การบวก floating point ไม่ commutative (0.1+0.2+0.3 ≠ 0.3+0.2+0.1 ในบิตท้าย) — เรียงค่าก่อนบวก
 * ทำให้ผลรวมเป็นฟังก์ชันของ "กลุ่มของค่า" ไม่ใช่ลำดับแถวใน array (ซึ่งไม่การันตีข้ามเครื่อง)
 *
 * จำเป็นจริง: ยอดหลายเคสตกลง .5 สตางค์พอดี (เช่น 4 คนหาร ฿236.58 -> 4254.5 สตางค์)
 * ต่างกันระดับ 1e-13 ก็พลิก Math.round ไปอีกทาง -> เศษ 1 สตางค์ตกคนละคน -> key ติ๊กไม่ match
 * (บวกจากค่าน้อยไปมากยังลด rounding error โดยรวมด้วย)
 */
function sumStable(xs: number[]): number {
  return [...xs].sort((a, b) => a - b).reduce((s, x) => s + x, 0);
}

/** สมาชิกคนนี้ร่วมจ่ายบิลหมวดนี้ได้ไหม (ตามว่ากินอาหาร/เครื่องดื่ม) */
export function memberMatchesCategory(consumes: Consumes, category: Bill['category']): boolean {
  if (category === 'mixed') return true;
  if (consumes === 'both') return true;
  return consumes === category;
}

/**
 * ช่วงเวลาที่สมาชิกอยู่ในวง คำนวณเป็น ms เทียบกับหน้าต่างเวลาของบิล
 * - ยังไม่มาถึง (arrivedAt = null) = ถือว่าอยู่ตั้งแต่ต้นหน้าต่าง
 * - ยังไม่กลับ (leftAt = null) = อยู่จนถึงเวลาอ้างอิง asOf
 */
function overlapMs(member: Member, windowStart: number, windowEnd: number, asOf: number): number {
  const start = member.arrivedAt ?? windowStart;
  const end = member.leftAt ?? asOf;
  return Math.max(0, Math.min(end, windowEnd) - Math.max(start, windowStart));
}

/** หาสมาชิกที่ร่วมบิลนี้จริง ๆ (memberIds ว่าง = ทุกคนที่ consumes เข้ากับ category) */
export function billMembers(bill: Bill, members: Member[]): Member[] {
  const pool =
    bill.memberIds.length > 0
      ? members.filter((m) => bill.memberIds.includes(m.id))
      : members;
  return pool.filter((m) => memberMatchesCategory(m.consumes, bill.category));
}

/**
 * ยอดของเมนู หารระหว่างผู้ร่วมเมนูนั้น
 * - participantIds ว่าง = หารกับทุกคนในบิล
 * - ถ้าผู้ร่วมที่ระบุไว้ไม่มีใครเข้าเงื่อนไขบิลเลย (เช่น เมนูเหล้าในบิลหมวดอาหาร)
 *   ให้ **เกลี่ยเท่ากันให้ทุกคนในบิล** เพื่อไม่ให้ยอดหาย (เดิมคืน map ว่าง = เงินหาย)
 */
function itemShares(item: BillItem, eligible: Member[]): Map<string, number> {
  const named =
    item.participantIds.length > 0
      ? item.participantIds.filter((id) => eligible.some((m) => m.id === id))
      : eligible.map((m) => m.id);
  const ids = named.length > 0 ? named : eligible.map((m) => m.id);
  const shares = new Map<string, number>();
  if (ids.length === 0) return shares; // ไม่มีใครเข้าเงื่อนไขทั้งบิล -> computeBill จัดการ (คนจ่ายรับไปเอง)
  const per = item.price / ids.length;
  for (const id of ids) shares.set(id, per);
  return shares;
}

/** ผลลัพธ์ยอดที่แต่ละคนต้องจ่ายในบิลหนึ่ง (ก่อนปัดเศษ) */
export type BillBreakdown = {
  /** ยอดต่อคน (รวม service+vat, หักส่วนลดแล้ว) */
  perMember: Map<string, number>;
  subtotal: number;
  service: number;
  vat: number;
  discount: number;
  total: number;
  /**
   * คนที่ถูกยกยอดเต็มบิลให้รับไปคนเดียว ไม่ใช่ผู้ร่วมหารปกติ
   * - บิลเลี้ยง (isTreat + มีคนจ่าย)
   * - fallback: ไม่มีสมาชิกคนไหนเข้าเงื่อนไขบิลเลย แต่มีคนออกเงินแล้ว
   * null/undefined = หารปกติ
   */
  soleBearerId?: string | null;
};

/** หารเท่ากันทุกคน */
function equalShares(eligible: Member[], amount: number): Map<string, number> {
  const raw = new Map<string, number>();
  const per = amount / eligible.length;
  for (const m of eligible) raw.set(m.id, per);
  return raw;
}

/** หารตามสัดส่วนเวลาที่อยู่; now = เวลาสิ้นสุดของคนที่ยังไม่กลับ */
function timeShares(
  bill: Bill,
  eligible: Member[],
  subtotal: number,
  now: number,
): Map<string, number> {
  // หน้าต่างเวลา = จากคนแรกมาถึง ถึงคนสุดท้ายกลับ (คนที่ยังไม่กลับ = ถึง now)
  const arrivals = eligible.map((m) => m.arrivedAt ?? bill.createdAt);
  const departures = eligible.map((m) => m.leftAt ?? now);
  const windowStart = Math.min(...arrivals, bill.createdAt);
  const windowEnd = Math.max(...departures, bill.createdAt);
  const weights = eligible.map((m) => ({
    id: m.id,
    w: overlapMs(m, windowStart, windowEnd, now),
  }));
  const totalW = sumStable(weights.map((x) => x.w));
  // ทุกคน weight 0 (degenerate: ไม่มีข้อมูลเวลาเลย) -> ตกไปหารเท่ากัน
  if (totalW <= 0) return equalShares(eligible, subtotal);
  // คนที่ weight = 0 (มาหลังบิลจบ) ได้ 0 จริง ไม่ต้องแจกเศษให้
  const raw = new Map<string, number>();
  for (const { id, w } of weights) raw.set(id, (subtotal * w) / totalW);
  return raw;
}

/** หารตามเมนูที่แต่ละคนกิน */
function itemizedShares(bill: Bill, eligible: Member[]): Map<string, number> {
  // เก็บยอดของแต่ละเมนูไว้ก่อน แล้วบวกด้วย sumStable -> ลำดับเมนูใน array ไม่เปลี่ยนผล
  const parts = new Map<string, number[]>();
  for (const m of eligible) parts.set(m.id, []);
  for (const item of bill.items) {
    for (const [id, amt] of itemShares(item, eligible)) {
      const xs = parts.get(id);
      if (xs) xs.push(amt);
      else parts.set(id, [amt]);
    }
  }
  const raw = new Map<string, number>();
  for (const [id, xs] of parts) raw.set(id, sumStable(xs));
  return raw;
}

/** ยอดดิบต่อคน (ก่อนใส่ service/vat/ส่วนลด) ตามวิธีหารของบิล */
function rawShares(bill: Bill, eligible: Member[], subtotal: number, now: number) {
  if (bill.splitMode === 'itemized') return itemizedShares(bill, eligible);
  if (bill.splitMode === 'time') return timeShares(bill, eligible, subtotal, now);
  return equalShares(eligible, subtotal);
}

/** คิดยอดของบิลเดียว; asOf = เวลาอ้างอิง "ตอนนี้" สำหรับคนที่ยังไม่กลับ (ไม่ส่ง = bill.createdAt) */
export function computeBill(bill: Bill, members: Member[], asOf?: number): BillBreakdown {
  const now = asOf ?? bill.createdAt;
  const eligible = billMembers(bill, members);

  // ทุกยอดของบิลคิดเป็น "สตางค์จำนวนเต็ม" (เงินจริงไม่มีเศษต่ำกว่าสตางค์)
  // → บรรทัด ยอดเมนู/service/VAT/ส่วนลด บนหน้าบิลบวกกันได้เท่า "รวมบิลนี้" พอดี
  const subtotalCents = Math.round(sumStable(bill.items.map((it) => it.price)) * 100);
  // ใส่ service charge + vat + ส่วนลด แบบสัดส่วนตามยอดดิบ (vat คิดบน subtotal + service ตามร้านไทย)
  const serviceCents = Math.round((subtotalCents * bill.serviceChargePct) / 100);
  const vatCents = Math.round(((subtotalCents + serviceCents) * bill.vatPct) / 100);
  const discountCents = Math.round(bill.discount * 100);
  const totalCents = subtotalCents + serviceCents + vatCents - discountCents;
  const subtotal = subtotalCents / 100;
  const total = totalCents / 100;
  const base = {
    subtotal,
    service: serviceCents / 100,
    vat: vatCents / 100,
    discount: discountCents / 100,
    total,
  };

  /**
   * ปิดท้าย: แจก totalCents ให้แต่ละคนตาม "น้ำหนัก" (ยอดดิบ) เป็นจำนวนเต็มสตางค์
   * ผลรวมยอดต่อคน = ยอดรวมบิลพอดี (largest remainder ดู ADR 0002)
   * ไม่ทำ = คอลัมน์บนจอบวกกันไม่เท่ายอดรวม (3 คนหาร ฿100 -> 33.33 x3 = 99.99
   * เพื่อนกดเครื่องคิดเลขบวกคอลัมน์แล้วไม่ตรง จะไม่เชื่อแอป)
   * เศษ 1 สตางค์ตกที่ "คนที่ไม่ใช่คนออกเงิน" ก่อน — คนออกเงินได้ยอดตรงตามสัดส่วนของตัวเอง
   * (3 คนหาร ฿100 คนจ่าย a -> a 33.33, b 33.34, c 33.33)
   *
   * แจกตามสัดส่วนของ **ผลรวมน้ำหนักจริง** (ไม่ใช่ factor = total/subtotal) เพราะน้ำหนักมาจาก
   * ราคาเมนูดิบที่อาจมีเศษต่ำกว่าสตางค์ — ถ้าเทียบกับ subtotal ที่ปัดแล้ว ยอดจะเพี้ยนไปหลายสตางค์
   */
  const done = (weights: Map<string, number>, soleBearerId: string | null): BillBreakdown => {
    const sumW = sumStable([...weights.values()]);
    const values = new Map<string, number>(); // หน่วยสตางค์ (ยังไม่ปัด)
    if (Math.abs(sumW) > 1e-9) {
      for (const [id, w] of weights) values.set(id, (totalCents * w) / sumW);
    } else if (weights.size > 0) {
      // ไม่มีฐานให้เทียบสัดส่วน (เมนูบวก/ลบหักกันหมด) -> เกลี่ยยอดรวมเท่ากัน
      const per = totalCents / weights.size;
      for (const id of weights.keys()) values.set(id, per);
    }
    const cents = largestRemainder(values, totalCents, (_c, id) =>
      id === bill.paidById ? 1 : 0,
    );
    return {
      ...base,
      perMember: new Map([...cents].map(([id, c]) => [id, c / 100])),
      soleBearerId,
    };
  };

  // ไม่มีใครเข้าเงื่อนไขบิลนี้เลย -> คนออกเงินรับยอดเต็มไปเอง (ไม่งั้นเงินหายทั้งก้อน)
  if (eligible.length === 0) {
    const only = new Map<string, number>();
    if (bill.paidById) only.set(bill.paidById, 1); // น้ำหนักเดียว = รับยอดเต็มบิล
    return done(only, bill.paidById ?? null);
  }

  // บิลเลี้ยง: คนจ่ายรับผิดชอบยอดเต็ม คนอื่นเป็น 0 (น้ำหนักคนจ่าย = 1, คนอื่น = 0)
  if (bill.isTreat && bill.paidById) {
    const treat = new Map<string, number>();
    for (const m of eligible) treat.set(m.id, 0);
    treat.set(bill.paidById, 1);
    return done(treat, bill.paidById);
  }

  return done(rawShares(bill, eligible, subtotal, now), null);
}

/**
 * เหตุผลที่บิลนี้ยังไม่เข้าสรุป (ว่าง = สมบูรณ์) — ข้อความไทยพร้อมแสดงบนจอ
 * ส่ง members มาด้วยจะตรวจเพิ่มว่าคนออกเงินยังอยู่ในรายชื่อจริง (ไม่ส่ง = ข้ามข้อนั้น)
 */
export function billIssues(bill: Bill, members?: Member[]): string[] {
  const issues: string[] = [];
  if (bill.paidById == null) {
    issues.push('ต้องเลือกคนออกเงิน');
  } else if (members && !members.some((m) => m.id === bill.paidById)) {
    // เจ้าหนี้ผี: paidById ชี้ไปที่ member ที่ถูกลบ/ยังไม่ sync มา
    issues.push('คนออกเงินไม่อยู่ในรายชื่อสมาชิก');
  }

  const hasPricedItem = bill.items.some((it) => it.price > 0);
  if (!hasPricedItem) {
    issues.push('ต้องมีเมนูอย่างน้อย 1 รายการที่มีราคา');
  } else {
    // มีเมนูราคา > 0 แล้วแต่ยอดรวมยังไม่บวก = มีราคาติดลบมาหักจนหมด
    // (sumStable = ลำดับเมนูใน array ต้องไม่ทำให้บิลเข้า/ไม่เข้าสรุปต่างกัน)
    const subtotal = sumStable(bill.items.map((it) => it.price));
    if (subtotal <= 0) issues.push('ยอดรวมต้องมากกว่า 0');
  }

  return issues;
}

/** บิลสมบูรณ์พอจะนำเข้าคำนวณสรุปไหม (เกณฑ์เดียวกับ billIssues เป๊ะ) */
export function billComplete(bill: Bill, members?: Member[]): boolean {
  return billIssues(bill, members).length === 0;
}

/**
 * รวมยอดทุกบิล -> ยอดที่แต่ละคนต้องจ่ายรวม
 * บวกกันบน "สตางค์จำนวนเต็ม" -> ผลรวมคอลัมน์ยอดต่อคนบนจอ = grandTotal เป๊ะ
 * (เพื่อนกดเครื่องคิดเลขบวกคอลัมน์แล้วต้องได้ยอดรวมพอดี ไม่ขาด/เกิน 1-3 สตางค์)
 */
export function computeTotals(
  state: AppState,
  asOf?: number,
): {
  perMember: Map<string, number>;
  grandTotal: number;
} {
  const cents = new Map<string, number>();
  let grandCents = 0;
  for (const bill of state.bills) {
    if (!billComplete(bill, state.members)) continue; // บิลไม่สมบูรณ์ไม่เข้าสรุป
    const b = computeBill(bill, state.members, asOf);
    grandCents += Math.round(b.total * 100);
    for (const [id, amt] of b.perMember) {
      cents.set(id, (cents.get(id) ?? 0) + Math.round(amt * 100));
    }
  }
  const perMember = new Map<string, number>();
  for (const [id, c] of cents) perMember.set(id, c / 100);
  return { perMember, grandTotal: grandCents / 100 };
}

/** ปัดเป็นทศนิยม 2 ตำแหน่ง (สมมาตรรอบ 0: 1.005 -> 1.01, -1.005 -> -1.01) */
export function round2(n: number): number {
  const sign = n < 0 ? -1 : 1;
  return (sign * Math.round((Math.abs(n) + Number.EPSILON) * 100)) / 100;
}

/**
 * ปัดค่า (หน่วยสตางค์) ให้เป็นจำนวนเต็ม โดยผลรวมเท่ากับ target พอดี — largest remainder (ADR 0002)
 * ใช้กันเงิน "หาย/งอก" 1-2 สตางค์เวลาปัดทีละคน (เลขบนจอต้องบวกกันได้เท่ายอดรวม)
 *
 * วิธี: ปัดใกล้สุดแบบสมมาตรก่อน แล้วเกลี่ยเศษที่เกิน/ขาด (drift) ทีละ 1 สตางค์
 * ลำดับคนที่ถูกปรับ: ปัดห่างค่าจริงมากสุดก่อน (largest remainder)
 * เท่ากัน -> เรียงด้วย tieRank (ค่าน้อยถูกปรับก่อน) -> เท่ากันอีก -> เรียงด้วยรหัสสมาชิก (byCode)
 * ทั้ง 3 ชั้นขึ้นกับ "ข้อมูล" เท่านั้น ไม่มีชั้นไหนขึ้นกับลำดับแถวใน array
 *
 * @param target ผลรวมที่ต้องได้ (สตางค์จำนวนเต็ม)
 * @param tieRank จัดลำดับตอนเศษเท่ากันเป๊ะ — ค่าน้อยกว่าถูกปรับ 1 สตางค์ก่อน
 *   เสมอกันอีกชั้น -> ตัดสินด้วย **รหัสสมาชิก** (byCode) ไม่ใช่ลำดับแถวใน array
 *   เพราะสองเครื่องที่มีข้อมูลเดียวกันอาจได้ members มาคนละลำดับ (Postgres ไม่การันตีลำดับแถว)
 *   ถ้าตัดสินด้วยลำดับแถว เศษ 1 สตางค์จะไปตกคนละคน -> net/คู่โอน/key ต่างกัน -> ติ๊ก "โอนแล้ว" หลุด
 */
function largestRemainder(
  values: Map<string, number>,
  target: number,
  tieRank: (cents: number, id: string) => number,
): Map<string, number> {
  const rows = [...values.entries()].map(([id, v]) => ({
    id,
    v,
    // ปัดใกล้สุดแบบสมมาตรรอบ 0 (|-1.5| ปัดเป็น -2 เหมือน 1.5 ปัดเป็น 2)
    cents: (Math.sign(v) * Math.round(Math.abs(v))) || 0,
  }));
  let drift = rows.reduce((s, r) => s + r.cents, 0) - target;
  if (drift === 0) {
    const exact = new Map<string, number>();
    for (const r of rows) exact.set(r.id, r.cents);
    return exact;
  }

  const step = drift > 0 ? -1 : 1; // ทิศที่ต้องปรับเพื่อดึงผลรวมกลับเข้าเป้า
  // "กำไรจากการปรับ" = ปรับแล้วเข้าใกล้ค่าจริงขึ้นเท่าไร; ตัดเศษ noise ระดับ 1e-6 สตางค์ทิ้ง
  // เพื่อให้กรณีเศษเท่ากันจริง (เช่น 3 คนหาร 100) ตกไปตัดสินด้วย tieRank
  const gain = (r: { v: number; cents: number }) => Math.round((r.v - r.cents) * step * 1e6) / 1e6;
  const order = [...rows].sort(
    (a, b) =>
      gain(b) - gain(a) ||
      tieRank(a.cents, a.id) - tieRank(b.cents, b.id) ||
      byCode(a.id, b.id), // ชั้นสุดท้าย: รหัสสมาชิก ไม่ใช่ลำดับแถว -> ทุกเครื่องได้ผลเดียวกัน
  );

  let k = 0;
  while (drift !== 0 && k < order.length * 2) {
    order[k % order.length].cents += step;
    drift += step;
    k++;
  }

  const out = new Map<string, number>();
  for (const r of rows) out.set(r.id, r.cents);
  return out;
}

/**
 * ปัดยอดสุทธิ (หน่วยสตางค์) ให้เป็นจำนวนเต็ม โดยผลรวมยังเท่ากับผลรวมเดิมพอดี
 * เศษเท่ากัน -> ให้ **ลูกหนี้** รับเศษก่อน (คนออกเงินจะได้คืนครบตามที่ควักจริง)
 */
function roundNetCents(values: Map<string, number>): Map<string, number> {
  const target = Math.round(sumStable([...values.values()]));
  return largestRemainder(values, target, (c) => (c < 0 ? 0 : 1));
}

/**
 * ยอดสุทธิเป็น "สตางค์" (จำนวนเต็ม) — ใช้ภายใน settleUp/computeNetBalances
 * ทำงานบนจำนวนเต็มเพื่อให้เลขที่โชว์บนจอกับรายการโอนตรงกันเป๊ะ และผลรวมเป็น 0 พอดี
 */
function netBalanceCents(state: AppState, asOf?: number): Map<string, number> {
  // net > 0 = คนอื่นติดเงินเรา (เราออกเกิน), net < 0 = เราติดเงินคนอื่น
  const raw = new Map<string, number>();
  for (const m of state.members) raw.set(m.id, 0);

  for (const bill of state.bills) {
    if (!billComplete(bill, state.members)) continue; // บิลไม่สมบูรณ์ไม่เข้าสรุป
    const b = computeBill(bill, state.members, asOf);
    // ส่วนที่แต่ละคนต้องรับผิดชอบ -> ลบออก (computeBill คืนค่าที่ลงตัวเป็นสตางค์แล้ว)
    for (const [id, amt] of b.perMember) {
      raw.set(id, (raw.get(id) ?? 0) - Math.round(amt * 100));
    }
    // คนที่ออกเงินบิลนี้ (แต่ละบิลอาจคนละคน) -> บวกยอดเต็มบิลคืนให้
    if (bill.paidById) {
      raw.set(bill.paidById, (raw.get(bill.paidById) ?? 0) + Math.round(b.total * 100));
    }
  }
  return roundNetCents(raw);
}

/**
 * ยอดสุทธิของแต่ละคน: จ่ายไปเท่าไร (paid) เทียบกับที่ต้องรับผิดชอบ (owed)
 * คืนค่าที่ปัด 2 ตำแหน่งแล้ว และผลรวมทุกคนเป็น 0 พอดี (ตรงกับ settleUp เสมอ)
 */
export function computeNetBalances(state: AppState, asOf?: number): Map<string, number> {
  const net = new Map<string, number>();
  for (const [id, cents] of netBalanceCents(state, asOf)) net.set(id, cents / 100);
  return net;
}

export type Transfer = {
  fromId: string;
  toId: string;
  amount: number;
  /**
   * ตัวผูก key แทนยอดเงิน — ใช้เฉพาะ state ที่ยอด "ลอยตามเวลา" (ดู amountsDrift)
   * เป็นลายนิ้วมือของข้อมูลที่กำหนดยอด (บิล/เมนู/สมาชิก) **ไม่ผูกนาฬิกา**
   * → บิลโหมด time ที่ยังมีคนไม่กลับ ติ๊ก "โอนแล้ว" แล้วยอดขยับทุกวินาที ติ๊กก็ยังติด
   * ไม่มี = ผูกกับยอดเงินตามปกติ (ADR 0003)
   */
  stamp?: string;
};

/**
 * key ประจำรายการโอน มี 2 รูปแบบ ตามว่ายอดของ state นั้นนิ่งหรือลอยตามเวลา
 *
 * 1. ยอดนิ่ง (ไม่มี `stamp`) — `${fromId}>${toId}@ยอด` ผูก **ทิศทาง + ยอดเงิน** ตาม ADR 0003
 *    ยอดเปลี่ยน (เพิ่ม/แก้บิล) = ติ๊ก "โอนแล้ว" เดิมไม่ match อีก = เป็นโมฆะเอง
 *
 * 2. ยอดลอยตามเวลา (มี `stamp`) — `${idน้อย}|${idมาก}@${stamp}` ผูก **คู่คน + ลายนิ้วมือข้อมูล**
 *    ไม่ผูกทั้งยอดและทิศทาง เพราะเวลาที่เดินไปทำให้ยอดที่คนยังนั่งอยู่ต้องรับผิดชอบโตขึ้น
 *    จนยอดขยับ **และเครื่องหมายพลิก** ได้เอง (เจ้าหนี้กลายเป็นลูกหนี้) ทั้งที่ผู้ใช้ไม่ได้แก้อะไร
 *    ถ้าผูกทิศทาง คู่ที่พลิกจะได้ key ใหม่ → ติ๊กหลุด → กล่อง "จ่ายครบทุกคนแล้ว" กับปุ่มปิดวงหายเอง
 *    ทิศทางเป็น "ผลลัพธ์ของยอดที่ลอย" เหมือนตัวเลขยอด จึงต้องไม่อยู่ใน key ชุดเดียวกัน
 *    (settleUp การันตีว่า state ยอดลอยจะมีเส้นโอนไม่เกิน 1 เส้นต่อคู่ → key ไม่ชนกันเอง)
 *
 * ทั้งสองแบบยังเป็นโมฆะเมื่อ **ผู้ใช้แก้ข้อมูลที่กำหนดยอด** (แบบ 2 ผ่าน stamp)
 * และตอนทุกคนติ๊ก "กลับแล้ว" ยอดจะหยุดลอย → key ย้ายจากแบบ 2 กลับไปแบบ 1
 * = ติ๊กชุดเดิมเป็นโมฆะ ต้องติ๊กใหม่บน "ยอดปิดจริง" ก่อนปิดวง (ตาข่ายกันเงินหายชั้นสุดท้าย)
 *
 * รูปแบบต่างกันทั้งตัวคั่น ('|' vs '>') และค่าหลัง '@' (stamp ขึ้นต้น 't', ยอดขึ้นต้นเลข/'-')
 * → key สองแบบไม่มีทาง match ข้ามกัน (fail-safe: ไม่รู้จัก = "ยังไม่โอน")
 */
export function transferKey(t: Transfer): string {
  if (t.stamp) {
    // เรียงคู่ให้เป็นระเบียบเดียวกันเสมอ ไม่ว่าใครจะเป็นคนโอนในรอบนี้
    const [lo, hi] = byCode(t.fromId, t.toId) <= 0 ? [t.fromId, t.toId] : [t.toId, t.fromId];
    return `${lo}|${hi}@${t.stamp}`;
  }
  return `${t.fromId}>${t.toId}@${round2(t.amount).toFixed(2)}`;
}

/**
 * ยอดโอนของ state นี้ "ลอยไปตามเวลา" ไหม
 * = มีบิลโหมด time ที่เข้าสรุปแล้ว และมีผู้ร่วมบิลที่ยังไม่กลับ (leftAt = null → คิดถึง asOf)
 * เคสนี้ยอดเปลี่ยนทุกมิลลิวินาที ห้ามผูก key ของ settlements กับยอด
 */
export function amountsDrift(state: AppState): boolean {
  return state.bills.some(
    (b) =>
      b.splitMode === 'time' &&
      billComplete(b, state.members) &&
      billMembers(b, state.members).some((m) => m.leftAt == null),
  );
}

/** hash 32-bit แบบ FNV-1a (deterministic, ไม่ต้องพึ่ง crypto — ใช้แค่เทียบว่าข้อมูลเปลี่ยนไหม) */
function fnv1a(s: string, seed: number): number {
  let h = seed;
  for (let i = 0; i < s.length; i++) {
    h ^= s.codePointAt(i) ?? 0;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * เรียงสตริงตามลำดับ code unit (ไม่ใช่ locale) — ต้อง deterministic ข้ามเครื่อง/ภาษา
 * ห้ามใช้ localeCompare ที่นี่: ผลต่างกันตาม locale จะทำให้ stamp ของเครื่องต่างกันเอง
 */
function byCode(a: string, b: string): number {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

/**
 * ลายนิ้วมือของข้อมูลทุกอย่างที่กำหนด "ใครโอนให้ใครเท่าไร" — ยกเว้นเวลา "ตอนนี้"
 * เก็บเฉพาะฟิลด์ที่มีผลต่อยอด: เปลี่ยนชื่อ/พร้อมเพย์ไม่ทำให้การติ๊ก "โอนแล้ว" เป็นโมฆะ
 * เรียงก่อน hash → ลำดับ row ที่ต่างกัน (realtime refetch) ให้ค่าเดียวกัน ไม่ทำติ๊กหลุดเอง
 */
function splitStamp(state: AppState): string {
  const parts: string[] = [];
  for (const m of state.members) {
    parts.push(`M${m.id}|${m.consumes}|${m.arrivedAt ?? ''}|${m.leftAt ?? ''}`);
  }
  for (const b of state.bills) {
    parts.push(
      [
        `B${b.id}`,
        b.category,
        b.splitMode,
        [...b.memberIds].sort(byCode).join(','),
        b.paidById ?? '',
        b.isTreat ? 1 : 0,
        b.discount,
        b.serviceChargePct,
        b.vatPct,
        b.createdAt,
      ].join('|'),
    );
    for (const it of b.items) {
      parts.push(`I${b.id}.${it.id}|${it.price}|${[...it.participantIds].sort(byCode).join(',')}`);
    }
  }
  const s = [...parts].sort(byCode).join('\n');
  // สอง hash คนละ seed ต่อกัน = 64 บิต ลดโอกาสชนกันให้เหลือระดับที่ไม่ต้องสนใจ
  const a = fnv1a(s, 0x811c9dc5).toString(36);
  const b = fnv1a(s, 0x7fffffff).toString(36);
  return `t${a}.${b}`;
}

/**
 * ไม่มีหนี้ค้างเลย: ไม่มีรายการโอนตั้งแต่แรก (หารลงตัวพอดี) หรือโอนครบทุกรายการแล้ว
 * key รูปแบบเก่าใน settlements จะไม่ match เฉย ๆ (แสดงเป็นยังไม่โอน) ไม่ throw
 */
export function nothingOwed(transfers: Transfer[], settlements: string[]): boolean {
  if (transfers.length === 0) return true;
  const done = new Set(settlements);
  return transfers.every((t) => done.has(transferKey(t)));
}

/** ตัด settlements ที่ไม่ตรงกับรายการโอนปัจจุบันออก (กัน key ค้าง/ซ้ำ จากยอดที่เปลี่ยนไปแล้ว) */
export function pruneSettlements(transfers: Transfer[], settlements: string[]): string[] {
  const valid = new Set(transfers.map(transferKey));
  const seen = new Set<string>();
  return settlements.filter((k) => {
    if (!valid.has(k) || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/**
 * เวลาอ้างอิงที่ "ข้อมูลกำหนดเอง" = เหตุการณ์ล่าสุดที่บันทึกไว้ (สร้างบิล / มาถึง / กลับ)
 * ใช้เลือกศูนย์กลางการโอนของ state ที่ยอดลอย — ต้องไม่ขึ้นกับนาฬิกา ไม่งั้นศูนย์กลางขยับเอง
 * (ทุกฟิลด์ที่ใช้อยู่ใน splitStamp แล้ว → ผู้ใช้แก้เวลาเมื่อไร ติ๊กเดิมเป็นโมฆะตามเจตนา ADR 0003)
 */
function referenceAsOf(state: AppState): number {
  let t = -Infinity;
  for (const b of state.bills) t = Math.max(t, b.createdAt);
  for (const m of state.members) {
    if (m.arrivedAt != null) t = Math.max(t, m.arrivedAt);
    if (m.leftAt != null) t = Math.max(t, m.leftAt);
  }
  return t === -Infinity ? 0 : t;
}

/**
 * เลือก "ศูนย์กลางการโอน" ของ state ที่ยอดลอย = เจ้าหนี้รายใหญ่สุด ณ เวลาอ้างอิงของข้อมูล
 * (ปกติคือคนที่ควักเงินให้วงมากที่สุด → ทิศทางที่ได้ตรงกับที่คนคาด: ทุกคนโอนคืนคนที่ออกเงิน)
 * ยอดเท่ากัน -> เรียงด้วยรหัสสมาชิก เพื่อให้ผลเหมือนกันทุกเครื่อง
 * และ net ที่รับเข้ามาก็ไม่ขึ้นกับลำดับแถวใน array ด้วย (largestRemainder/sumStable)
 * — ไม่งั้นเจ้าหนี้สองคนที่ยอดต่างกัน 1 สตางค์จากการเกลี่ยเศษ จะสลับกันเป็นศูนย์กลางตามลำดับแถว
 */
function settleHub(state: AppState): string | null {
  const ref = netBalanceCents(state, referenceAsOf(state));
  let hub: string | null = null;
  let best = -Infinity;
  for (const id of [...ref.keys()].sort(byCode)) {
    const v = ref.get(id) ?? 0;
    if (v > best) {
      best = v;
      hub = id;
    }
  }
  return hub;
}

/**
 * จับคู่ว่าใครควรโอนให้ใคร โดยให้จำนวนการโอนน้อยที่สุด (greedy settle-up)
 * คิดบนหน่วยสตางค์จำนวนเต็ม -> ผลรวมยอดโอน = ผลรวมหนี้ = ผลรวมยอดที่เจ้าหนี้ต้องได้ เป๊ะ
 *
 * **สองโหมดการจับคู่** ตามว่ายอดของ state นี้นิ่งหรือลอยตามเวลา:
 *
 * - ยอดนิ่ง -> greedy (ลูกหนี้ยอดมากจับกับเจ้าหนี้ยอดมาก) = จำนวนรายการโอนน้อยที่สุด
 * - ยอดลอย (บิลโหมด time + ยังมีคนไม่กลับ) -> **ดาว (star)**: ทุกคนมีเส้นเดียวกับศูนย์กลาง
 *   เพราะ greedy จับคู่จาก "ลำดับยอดมาก→น้อย" ซึ่งลอยไปตามเวลาด้วย เวลาเดินไปไม่กี่ชั่วโมง
 *   ลำดับสลับ/มีคนข้ามเส้นศูนย์ -> **คู่โอนเปลี่ยนตัวคนเอง** ทั้งที่ผู้ใช้ไม่ได้แก้ข้อมูลอะไรเลย
 *   -> ติ๊ก "โอนแล้ว" ของคู่ที่หายไปหลุด -> กล่อง "จ่ายครบทุกคนแล้ว" และปุ่มปิดวงหายเอง
 *   ศูนย์กลางเลือกจากข้อมูล (settleHub) ไม่ใช่จากยอดปัจจุบัน -> ชุดคู่โอนนิ่งตลอดวง
 *   ต้นทุน: รายการโอนอาจมากกว่า greedy 1 รายการในวงที่มีเจ้าหนี้หลายคน (วัดได้ +0.4%)
 *
 * ทั้งสองโหมดคืนยอดที่ตรงกับ net ของทุกคนเป๊ะ (ผลรวม net = 0 อยู่แล้ว) เงินไม่หาย/ไม่งอก
 * โหมดยอดลอยติด `stamp` ให้ทุกรายการ -> transferKey ผูกคู่คน+ลายนิ้วมือข้อมูล ไม่ผูกยอด/ทิศ
 */
export function settleUp(state: AppState, asOf?: number): Transfer[] {
  const cents = netBalanceCents(state, asOf);
  // ยอดลอยตามเวลา -> ผูก key กับลายนิ้วมือข้อมูลแทนยอด (คิดครั้งเดียวต่อการเรียก)
  const stamp = amountsDrift(state) ? splitStamp(state) : undefined;

  if (stamp) {
    const hub = settleHub(state);
    if (hub == null) return [];
    // เส้นเดียวต่อคน: ยอดของแต่ละคนตรงกับ net ของตัวเองพอดี, ศูนย์กลางรับส่วนที่เหลือ
    // (ผลรวม net = 0 -> ยอดที่ศูนย์กลางได้รับสุทธิ = net ของศูนย์กลางเอง อัตโนมัติ)
    const transfers: Transfer[] = [];
    for (const id of [...cents.keys()].sort(byCode)) {
      if (id === hub) continue;
      const c = cents.get(id) ?? 0;
      if (c === 0) continue;
      transfers.push(
        c < 0
          ? { fromId: id, toId: hub, amount: round2(-c / 100), stamp }
          : { fromId: hub, toId: id, amount: round2(c / 100), stamp },
      );
    }
    return transfers;
  }

  const debtors: { id: string; amt: number }[] = [];
  const creditors: { id: string; amt: number }[] = [];
  for (const [id, c] of cents) {
    if (c < 0) debtors.push({ id, amt: -c });
    else if (c > 0) creditors.push({ id, amt: c });
  }
  // เรียงจากยอดมากไปน้อย เพื่อให้จำนวนรายการโอนน้อยที่สุด
  // ยอดเท่ากัน -> เรียงด้วย **รหัสสมาชิก** ไม่ใช่ลำดับแถวใน array
  // (ลำดับแถวต่างกันระหว่างเครื่องได้ -> จะจับคู่โอนคนละคู่ -> key ไม่ match -> ติ๊ก "โอนแล้ว" หลุด)
  const byAmtDesc = (a: { id: string; amt: number }, b: { id: string; amt: number }) =>
    b.amt - a.amt || byCode(a.id, b.id);
  debtors.sort(byAmtDesc);
  creditors.sort(byAmtDesc);

  const transfers: Transfer[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const pay = Math.min(debtors[i].amt, creditors[j].amt);
    if (pay > 0) {
      transfers.push({
        fromId: debtors[i].id,
        toId: creditors[j].id,
        amount: round2(pay / 100),
      });
    }
    debtors[i].amt -= pay;
    creditors[j].amt -= pay;
    if (debtors[i].amt === 0) i++;
    if (creditors[j].amt === 0) j++;
  }
  return transfers;
}
