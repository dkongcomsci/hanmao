import { AppState, Bill, BillItem, Consumes, Member } from './types';

/** สมาชิกคนนี้ร่วมจ่ายบิลหมวดนี้ได้ไหม (ตามว่ากินอาหาร/เครื่องดื่ม) */
export function memberMatchesCategory(consumes: Consumes, category: Bill['category']): boolean {
  if (category === 'mixed') return true;
  if (consumes === 'both') return true;
  return consumes === category;
}

/** ช่วงเวลาที่สมาชิกอยู่ในวง คำนวณเป็น ms เทียบกับหน้าต่างเวลาของบิล */
function overlapMs(member: Member, windowStart: number, windowEnd: number): number {
  const start = member.arrivedAt ?? windowStart;
  const end = member.leftAt ?? windowEnd;
  return Math.max(0, Math.min(end, windowEnd) - Math.max(start, windowStart));
}

/** หาสมาชิกที่ร่วมบิลนี้จริง ๆ */
export function billMembers(bill: Bill, members: Member[]): Member[] {
  const pool =
    bill.memberIds.length > 0
      ? members.filter((m) => bill.memberIds.includes(m.id))
      : members;
  return pool.filter((m) => memberMatchesCategory(m.consumes, bill.category));
}

/** ยอดของเมนู หารระหว่างผู้ร่วมเมนูนั้น */
function itemShares(
  item: BillItem,
  eligible: Member[],
): Map<string, number> {
  const ids =
    item.participantIds.length > 0
      ? item.participantIds.filter((id) => eligible.some((m) => m.id === id))
      : eligible.map((m) => m.id);
  const shares = new Map<string, number>();
  if (ids.length === 0) return shares;
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
};

export function computeBill(bill: Bill, members: Member[]): BillBreakdown {
  const eligible = billMembers(bill, members);
  const subtotal = bill.items.reduce((s, it) => s + it.price, 0);

  // ยอดดิบต่อคน ตามวิธีหาร
  const raw = new Map<string, number>();
  for (const m of eligible) raw.set(m.id, 0);

  if (bill.splitMode === 'itemized') {
    for (const item of bill.items) {
      const shares = itemShares(item, eligible);
      for (const [id, amt] of shares) raw.set(id, (raw.get(id) ?? 0) + amt);
    }
  } else if (bill.splitMode === 'time') {
    // หน้าต่างเวลา = จากคนแรกมาถึง คนสุดท้ายกลับ
    const arrivals = eligible.map((m) => m.arrivedAt ?? bill.createdAt);
    const departures = eligible.map((m) => m.leftAt ?? bill.createdAt);
    const windowStart = Math.min(...arrivals, bill.createdAt);
    const windowEnd = Math.max(...departures, bill.createdAt);
    const weights = eligible.map((m) => ({
      id: m.id,
      w: overlapMs(m, windowStart, windowEnd) || 1,
    }));
    const totalW = weights.reduce((s, x) => s + x.w, 0) || 1;
    for (const { id, w } of weights) raw.set(id, (subtotal * w) / totalW);
  } else {
    // equal
    const per = eligible.length > 0 ? subtotal / eligible.length : 0;
    for (const m of eligible) raw.set(m.id, per);
  }

  // ใส่ service charge + vat + ส่วนลด แบบสัดส่วนตามยอดดิบ
  const service = (subtotal * bill.serviceChargePct) / 100;
  const vat = ((subtotal + service) * bill.vatPct) / 100;
  const total = subtotal + service + vat - bill.discount;
  const factor = subtotal > 0 ? total / subtotal : 0;

  const perMember = new Map<string, number>();
  for (const [id, amt] of raw) perMember.set(id, amt * factor);

  // บิลเลี้ยง: คนจ่ายรับผิดชอบยอดเต็ม คนอื่นเป็น 0
  if (bill.isTreat && bill.paidById) {
    for (const id of perMember.keys()) perMember.set(id, 0);
    perMember.set(bill.paidById, total);
  }

  return { perMember, subtotal, service, vat, discount: bill.discount, total };
}

/**
 * บิลสมบูรณ์พอจะนำเข้าคำนวณสรุปไหม
 * ต้องมี (1) คนจ่าย และ (2) อย่างน้อย 1 เมนูที่มีราคา > 0
 */
export function billComplete(bill: Bill): boolean {
  const hasPayer = bill.paidById != null;
  const hasPricedItem = bill.items.some((it) => it.price > 0);
  return hasPayer && hasPricedItem;
}

/** รวมยอดทุกบิล -> ยอดที่แต่ละคนต้องจ่ายรวม */
export function computeTotals(state: AppState): {
  perMember: Map<string, number>;
  grandTotal: number;
} {
  const perMember = new Map<string, number>();
  let grandTotal = 0;
  for (const bill of state.bills) {
    if (!billComplete(bill)) continue; // บิลไม่สมบูรณ์ไม่เข้าสรุป
    const b = computeBill(bill, state.members);
    grandTotal += b.total;
    for (const [id, amt] of b.perMember) {
      perMember.set(id, (perMember.get(id) ?? 0) + amt);
    }
  }
  return { perMember, grandTotal };
}

/** ปัดเป็นทศนิยม 2 ตำแหน่ง */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** ยอดสุทธิของแต่ละคน: จ่ายไปเท่าไร (paid) เทียบกับที่ต้องรับผิดชอบ (owed) */
export function computeNetBalances(state: AppState): Map<string, number> {
  // net > 0 = คนอื่นติดเงินเรา (เราออกเกิน), net < 0 = เราติดเงินคนอื่น
  const net = new Map<string, number>();
  for (const m of state.members) net.set(m.id, 0);

  for (const bill of state.bills) {
    if (!billComplete(bill)) continue; // บิลไม่สมบูรณ์ไม่เข้าสรุป
    const b = computeBill(bill, state.members);
    // ส่วนที่แต่ละคนต้องรับผิดชอบ -> ลบออก
    for (const [id, amt] of b.perMember) {
      net.set(id, (net.get(id) ?? 0) - amt);
    }
    // คนที่ออกเงินบิลนี้ -> บวกยอดเต็มบิลคืนให้
    if (bill.paidById) {
      net.set(bill.paidById, (net.get(bill.paidById) ?? 0) + b.total);
    }
  }
  return net;
}

export type Transfer = { fromId: string; toId: string; amount: number };

/** key ประจำรายการโอน (ใครโอนให้ใคร) ไว้จำสถานะ "โอนแล้ว" */
export function transferKey(t: Pick<Transfer, 'fromId' | 'toId'>): string {
  return `${t.fromId}>${t.toId}`;
}

/** จ่ายครบทุกคนหรือยัง: มีรายการโอน และทุกรายการถูกติ๊ก "โอนแล้ว" */
export function allSettled(transfers: Transfer[], settlements: string[]): boolean {
  if (transfers.length === 0) return false;
  const done = new Set(settlements);
  return transfers.every((t) => done.has(transferKey(t)));
}

/** จับคู่ว่าใครควรโอนให้ใคร โดยให้จำนวนการโอนน้อยที่สุด (greedy settle-up) */
export function settleUp(state: AppState): Transfer[] {
  const net = computeNetBalances(state);
  const debtors: { id: string; amt: number }[] = [];
  const creditors: { id: string; amt: number }[] = [];
  for (const [id, v] of net) {
    const r = round2(v);
    if (r < -0.005) debtors.push({ id, amt: -r });
    else if (r > 0.005) creditors.push({ id, amt: r });
  }
  debtors.sort((a, b) => b.amt - a.amt);
  creditors.sort((a, b) => b.amt - a.amt);

  const transfers: Transfer[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const pay = Math.min(debtors[i].amt, creditors[j].amt);
    transfers.push({
      fromId: debtors[i].id,
      toId: creditors[j].id,
      amount: round2(pay),
    });
    debtors[i].amt -= pay;
    creditors[j].amt -= pay;
    if (debtors[i].amt < 0.005) i++;
    if (creditors[j].amt < 0.005) j++;
  }
  return transfers;
}
