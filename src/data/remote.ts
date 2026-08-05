// แปลงข้อมูลระหว่าง Supabase (snake_case rows) กับโดเมน (camelCase) + fetch/subscribe
import { RealtimeChannel } from '@supabase/supabase-js';
import { AppState, Bill, BillItem, Consumes, Member } from '../domain/types';
import { supabase } from './supabase';

/** โยน error ที่อ่านง่ายถ้า client ยังไม่พร้อม (ไม่มี env) */
function client() {
  if (!supabase) throw new Error('Supabase ยังไม่ถูกตั้งค่า (ไม่มี env)');
  return supabase;
}

// ---------- mappers ----------
type MemberRow = {
  id: string;
  group_id: string;
  name: string;
  consumes: string;
  arrived_at: number | null;
  left_at: number | null;
  user_id: string | null;
  prompt_pay: string | null;
  /**
   * เวลาที่สร้างแถว — ใช้เป็นคอลัมน์เรียงลำดับ (DB มี default now())
   * ส่งค่าเองเฉพาะตอน migrate หลายแถวในคำสั่งเดียว เพราะ now() คงที่ทั้งทรานแซกชัน
   * → ทุกแถวจะได้เวลาเท่ากันจนลำดับเดิมหาย
   */
  created_at?: string;
};
type BillRow = {
  id: string;
  group_id: string;
  name: string;
  category: string;
  split_mode: string;
  member_ids: string[];
  paid_by_id: string | null;
  is_treat: boolean;
  discount: number;
  service_charge_pct: number;
  vat_pct: number;
  created_at_ms: number;
};
type ItemRow = {
  id: string;
  bill_id: string;
  group_id: string;
  name: string;
  price: number;
  participant_ids: string[];
  /** เวลาที่สร้างแถว — คอลัมน์เรียงลำดับเมนู (ดูคอมเมนต์ที่ MemberRow.created_at) */
  created_at?: string;
};

function rowToMember(r: MemberRow): Member {
  return {
    id: r.id,
    name: r.name,
    consumes: r.consumes as Consumes,
    arrivedAt: r.arrived_at,
    leftAt: r.left_at,
    userId: r.user_id,
    promptPay: r.prompt_pay,
  };
}

/**
 * ลำดับที่ใช้เรียงแถวหลายแถวที่ insert พร้อมกัน (ตอน migrate local → วง)
 * คืน ISO timestamp ที่ห่างกันทีละ 1 ms ตาม index เพื่อให้ order by created_at
 * ได้ลำดับเดิมกับที่ผู้ใช้เห็นตอน local (default now() ใช้ไม่ได้ เพราะคงที่ทั้งทรานแซกชัน)
 */
export function seqStamp(base: number, index: number): string {
  return new Date(base + index).toISOString();
}

/** createdAt ส่งมาเมื่อไหร่ = ล็อกลำดับแถวเอง (ดู seqStamp); ไม่ส่ง = ใช้ default now() ของ DB */
export function memberToRow(groupId: string, m: Member, createdAt?: string): MemberRow {
  return {
    id: m.id,
    group_id: groupId,
    name: m.name,
    consumes: m.consumes,
    arrived_at: m.arrivedAt,
    left_at: m.leftAt,
    user_id: m.userId ?? null,
    prompt_pay: m.promptPay ?? null,
    ...(createdAt ? { created_at: createdAt } : {}),
  };
}

export function billToRow(groupId: string, b: Bill): Omit<BillRow, 'group_id'> & { group_id: string } {
  return {
    id: b.id,
    group_id: groupId,
    name: b.name,
    category: b.category,
    split_mode: b.splitMode,
    member_ids: b.memberIds,
    paid_by_id: b.paidById,
    is_treat: b.isTreat ?? false,
    discount: b.discount,
    service_charge_pct: b.serviceChargePct,
    vat_pct: b.vatPct,
    created_at_ms: b.createdAt,
  };
}

export function itemToRow(
  groupId: string,
  billId: string,
  it: BillItem,
  createdAt?: string,
): ItemRow {
  return {
    id: it.id,
    bill_id: billId,
    group_id: groupId,
    name: it.name,
    price: it.price,
    participant_ids: it.participantIds,
    ...(createdAt ? { created_at: createdAt } : {}),
  };
}

/** map field ของ Bill (โดเมน) → คอลัมน์ (snake_case) สำหรับ update บางส่วน */
export function billPatchToRow(patch: Partial<Bill>): Record<string, unknown> {
  const map: Record<string, string> = {
    name: 'name',
    category: 'category',
    splitMode: 'split_mode',
    memberIds: 'member_ids',
    paidById: 'paid_by_id',
    isTreat: 'is_treat',
    discount: 'discount',
    serviceChargePct: 'service_charge_pct',
    vatPct: 'vat_pct',
    createdAt: 'created_at_ms',
  };
  const row: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (map[k]) row[map[k]] = v;
  }
  return row;
}

export function memberPatchToRow(patch: Partial<Member>): Record<string, unknown> {
  const map: Record<string, string> = {
    name: 'name',
    consumes: 'consumes',
    arrivedAt: 'arrived_at',
    leftAt: 'left_at',
    userId: 'user_id',
    promptPay: 'prompt_pay',
  };
  const row: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (map[k]) row[map[k]] = v;
  }
  return row;
}

export function itemPatchToRow(patch: Partial<BillItem>): Record<string, unknown> {
  const map: Record<string, string> = {
    name: 'name',
    price: 'price',
    participantIds: 'participant_ids',
  };
  const row: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (map[k]) row[map[k]] = v;
  }
  return row;
}

// ---------- เรียงลำดับแถวให้นิ่ง ----------
/** เวลาสำหรับเปรียบเทียบ (timestamptz string → ms); ไม่มี/พาร์สไม่ได้ = 0 เพื่อให้ผลนิ่ง */
function timeOf(v: string | undefined): number {
  if (!v) return 0;
  const t = Date.parse(v);
  return Number.isNaN(t) ? 0 : t;
}

/**
 * เรียงตาม (เวลา, id) — id เป็น tiebreak ชั้นสองเพราะ unique จริง (primary key)
 * ทำซ้ำฝั่ง client อีกชั้นแม้ query จะ order มาแล้ว: เป็นด่านสุดท้ายที่การันตีว่า
 * ทุกเครื่องเห็นลำดับเดียวกัน แม้วันหน้าจะมีใครแก้ query/เพิ่ม limit หรือคอลัมน์เวลาหายไป
 * (ถ้าไม่มีคอลัมน์เวลา ทุกแถวได้ 0 → เหลือเรียงตาม id ซึ่งก็ยังนิ่งเหมือนกันทุกเครื่อง)
 */
function sortByTimeThenId<T extends { id: string }>(rows: T[], time: (r: T) => number): T[] {
  return [...rows].sort((a, b) => time(a) - time(b) || a.id.localeCompare(b.id));
}

type Res<T> = { data: T[] | null; error: { code?: string } | null };

/**
 * ยิง select พร้อม order; ถ้า project เก่ายังไม่มีคอลัมน์ที่ใช้เรียง (42703 undefined_column
 * / PGRST204 ไม่รู้จักคอลัมน์) ให้ถอยไปดึงแบบไม่ order แทน — ดีกว่าทำให้ทั้งวงพัง
 * ลำดับยังนิ่งอยู่เพราะ sortByTimeThenId เรียงซ้ำฝั่ง client (ตกไปเรียงตาม id)
 */
async function selectOrdered<T>(
  withOrder: () => PromiseLike<Res<T>>,
  withoutOrder: () => PromiseLike<Res<T>>,
): Promise<Res<T>> {
  const res = await withOrder();
  const code = res.error?.code;
  if (code === '42703' || code === 'PGRST204') return withoutOrder();
  return res;
}

// ---------- fetch ทั้งวง → ประกอบเป็น AppState ----------
/**
 * ประกอบ AppState ของวงจาก rows
 *
 * ทุก query ที่คืนหลายแถว **ต้องมี order ที่นิ่ง (deterministic)**:
 * Postgres ไม่การันตีลำดับแถวถ้าไม่ระบุ `order by` — ลำดับเปลี่ยนได้ตาม query plan/vacuum/index
 * ⇒ สองเครื่องในวงเดียวกันอาจได้ `state.members` ลำดับต่างกัน ทำให้
 *   1. รายชื่อบนจอสลับตำแหน่งเองระหว่าง refetch/realtime (กวนผู้ใช้)
 *   2. การเกลี่ยเศษสตางค์ (largest remainder ใน split.ts) ที่ tiebreak ตามลำดับรายชื่อ
 *      ได้คู่โอน/transferKey ต่างกัน → คนหนึ่งติ๊ก "โอนแล้ว" อีกคนเห็น "ยังไม่โอน"
 *
 * คอลัมน์เวลาอย่างเดียวไม่พอ (ซ้ำกันได้: created_at default now() คงที่ทั้งทรานแซกชัน
 * → insert หลายแถวในคำสั่งเดียวตอน migrate ได้เวลาเท่ากันหมด; created_at_ms ก็ซ้ำได้ถ้า
 * สร้างบิลในมิลลิวินาทีเดียวกัน) จึงต่อ tiebreak ชั้นสองด้วย `id` (primary key — unique จริง)
 * ⇒ ลำดับนิ่งเสมอและเหมือนกันทุกเครื่อง
 */
export async function fetchGroupState(groupId: string): Promise<AppState> {
  const sb = client();
  const rowsOf = (table: string) => sb.from(table).select('*').eq('group_id', groupId);
  const [membersRes, billsRes, itemsRes, groupRes] = await Promise.all([
    selectOrdered<MemberRow>(
      () =>
        rowsOf('members')
          .order('created_at', { ascending: true })
          .order('id', { ascending: true }),
      () => rowsOf('members'),
    ),
    selectOrdered<BillRow>(
      () =>
        rowsOf('bills')
          .order('created_at_ms', { ascending: true })
          .order('id', { ascending: true }),
      () => rowsOf('bills'),
    ),
    selectOrdered<ItemRow>(
      () =>
        rowsOf('bill_items')
          .order('created_at', { ascending: true })
          .order('id', { ascending: true }),
      () => rowsOf('bill_items'),
    ),
    sb.from('groups').select('venue, settlements').eq('id', groupId).single(),
  ]);
  // ทุก query ต้องเช็ก error — ถ้าปล่อยผ่านจะได้ AppState ที่ "ว่างแบบเนียน ๆ"
  // แล้ว store จะเอาไปทับ state จริง (ข้อมูลเหมือนหายทั้งวง)
  for (const res of [membersRes, billsRes, itemsRes, groupRes]) {
    if (res.error) throw res.error;
  }
  if (!groupRes.data) throw new Error('ไม่พบวงนี้ (อาจถูกปิดไปแล้ว)');

  const itemRows = sortByTimeThenId(itemsRes.data ?? [], (r) => timeOf(r.created_at));
  const itemsByBill = new Map<string, BillItem[]>();
  for (const r of itemRows) {
    const it: BillItem = {
      id: r.id,
      name: r.name,
      price: Number(r.price),
      participantIds: r.participant_ids ?? [],
    };
    const arr = itemsByBill.get(r.bill_id) ?? [];
    arr.push(it);
    itemsByBill.set(r.bill_id, arr);
  }

  const memberRows = sortByTimeThenId(membersRes.data ?? [], (r) => timeOf(r.created_at));
  const billRows = sortByTimeThenId(billsRes.data ?? [], (r) => Number(r.created_at_ms) || 0);

  const members = memberRows.map(rowToMember);
  const bills: Bill[] = billRows.map((r) => ({
    id: r.id,
    name: r.name,
    category: r.category as Bill['category'],
    splitMode: r.split_mode as Bill['splitMode'],
    items: itemsByBill.get(r.id) ?? [],
    memberIds: r.member_ids ?? [],
    paidById: r.paid_by_id,
    isTreat: r.is_treat ?? false,
    discount: Number(r.discount),
    serviceChargePct: Number(r.service_charge_pct),
    vatPct: Number(r.vat_pct),
    createdAt: Number(r.created_at_ms),
  }));

  const groupMeta = groupRes.data as { venue: AppState['venue']; settlements: string[] | null };
  const venue = groupMeta.venue ?? null;
  // settlements เป็น jsonb — กัน type แปลก ๆ จาก DB (null/object) ไม่ให้หลุดเข้าโดเมน
  const settlements = Array.isArray(groupMeta.settlements)
    ? groupMeta.settlements.filter((k): k is string => typeof k === 'string')
    : [];
  return { members, bills, venue, settlements };
}

/** subscribe ทุกตารางของวง แล้วเรียก onChange เมื่อมีการเปลี่ยน (store จะ refetch) */
export function subscribeGroup(groupId: string, onChange: () => void): RealtimeChannel {
  const sb = client();
  const filter = `group_id=eq.${groupId}`;
  const channel = sb
    .channel(`group:${groupId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'members', filter }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'bills', filter }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'bill_items', filter }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'groups', filter: `id=eq.${groupId}` }, onChange)
    .subscribe();
  return channel;
}
