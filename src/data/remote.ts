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

export function memberToRow(groupId: string, m: Member): MemberRow {
  return {
    id: m.id,
    group_id: groupId,
    name: m.name,
    consumes: m.consumes,
    arrived_at: m.arrivedAt,
    left_at: m.leftAt,
    user_id: m.userId ?? null,
    prompt_pay: m.promptPay ?? null,
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

export function itemToRow(groupId: string, billId: string, it: BillItem): ItemRow {
  return {
    id: it.id,
    bill_id: billId,
    group_id: groupId,
    name: it.name,
    price: it.price,
    participant_ids: it.participantIds,
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

// ---------- fetch ทั้งวง → ประกอบเป็น AppState ----------
export async function fetchGroupState(groupId: string): Promise<AppState> {
  const sb = client();
  const [membersRes, billsRes, itemsRes, groupRes] = await Promise.all([
    sb.from('members').select('*').eq('group_id', groupId),
    sb.from('bills').select('*').eq('group_id', groupId).order('created_at_ms', { ascending: true }),
    sb.from('bill_items').select('*').eq('group_id', groupId).order('created_at', { ascending: true }),
    sb.from('groups').select('venue, settlements').eq('id', groupId).single(),
  ]);
  if (membersRes.error) throw membersRes.error;
  if (billsRes.error) throw billsRes.error;
  if (itemsRes.error) throw itemsRes.error;

  const itemsByBill = new Map<string, BillItem[]>();
  for (const r of (itemsRes.data ?? []) as ItemRow[]) {
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

  const members = ((membersRes.data ?? []) as MemberRow[]).map(rowToMember);
  const bills: Bill[] = ((billsRes.data ?? []) as BillRow[]).map((r) => ({
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

  const groupMeta = groupRes.data as { venue: AppState['venue']; settlements: string[] | null } | null;
  const venue = groupMeta?.venue ?? null;
  const settlements = groupMeta?.settlements ?? [];
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
