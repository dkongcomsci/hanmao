import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  amountsDrift,
  billComplete,
  billIssues,
  billMembers,
  computeBill,
  computeNetBalances,
  computeTotals,
  memberMatchesCategory,
  nothingOwed,
  pruneSettlements,
  round2,
  settleUp,
  transferKey,
  type Transfer,
} from '../../src/domain/split';
import type {
  AppState,
  Bill,
  BillCategory,
  BillItem,
  Consumes,
  Member,
  SplitMode,
} from '../../src/domain/types';

// ---------- helper สร้างข้อมูลทดสอบ ----------

const T0 = 1_700_000_000_000; // เวลาอ้างอิงคงที่ (ห้ามใช้ Date.now() ในเทส — ต้อง deterministic)

function member(id: string, extra: Partial<Member> = {}): Member {
  return { id, name: id, consumes: 'both', arrivedAt: null, leftAt: null, ...extra };
}

function item(name: string, price: number, participantIds: string[] = []): BillItem {
  return { id: `it-${name}`, name, price, participantIds };
}

function bill(extra: Partial<Bill> = {}): Bill {
  return {
    id: 'b1',
    name: 'บิล',
    category: 'mixed',
    splitMode: 'equal',
    items: [],
    memberIds: [],
    paidById: null,
    discount: 0,
    serviceChargePct: 0,
    vatPct: 0,
    createdAt: T0,
    ...extra,
  };
}

function appState(members: Member[], bills: Bill[], settlements: string[] = []): AppState {
  return { members, bills, venue: null, settlements };
}

/** ยอดต่อคนเป็น object เทียบง่าย (ปัด 2 ตำแหน่ง) */
function shares(m: Map<string, number>): Record<string, number> {
  return Object.fromEntries([...m.entries()].map(([k, v]) => [k, round2(v)]));
}

// ---------- round2 ----------

describe('round2', () => {
  test('ปัด 2 ตำแหน่งแบบสมมาตรรอบ 0', () => {
    assert.equal(round2(1.005), 1.01);
    assert.equal(round2(-1.005), -1.01);
    assert.equal(round2(1.004), 1.0);
    assert.equal(round2(0), 0);
  });

  test('ค่าที่ลอยจาก floating point ปัดได้ตรง', () => {
    assert.equal(round2(0.1 + 0.2), 0.3);
    assert.equal(round2(100 / 3), 33.33);
  });
});

// ---------- memberMatchesCategory / billMembers ----------

describe('memberMatchesCategory', () => {
  test('บิลหมวด mixed รับทุกคน', () => {
    for (const c of ['both', 'food', 'drink'] as Consumes[]) {
      assert.equal(memberMatchesCategory(c, 'mixed'), true);
    }
  });

  test('คนกินทั้งสองเข้าได้ทุกหมวด', () => {
    assert.equal(memberMatchesCategory('both', 'food'), true);
    assert.equal(memberMatchesCategory('both', 'drink'), true);
  });

  test('คนกินเฉพาะอย่างเข้าได้แค่หมวดตัวเอง', () => {
    assert.equal(memberMatchesCategory('food', 'food'), true);
    assert.equal(memberMatchesCategory('food', 'drink'), false);
    assert.equal(memberMatchesCategory('drink', 'food'), false);
  });
});

describe('billMembers', () => {
  const members = [
    member('a', { consumes: 'both' }),
    member('b', { consumes: 'food' }),
    member('c', { consumes: 'drink' }),
  ];

  test('memberIds ว่าง = ทุกคนที่ consumes ตรงกับ category', () => {
    const ids = billMembers(bill({ category: 'drink' }), members).map((m) => m.id);
    assert.deepEqual(ids, ['a', 'c']);
  });

  test('memberIds ระบุไว้ = เอาแค่คนนั้น (แต่ยังกรองด้วย category)', () => {
    const ids = billMembers(bill({ category: 'food', memberIds: ['b', 'c'] }), members).map(
      (m) => m.id,
    );
    assert.deepEqual(ids, ['b']);
  });

  test('หมวด mixed เอาทุกคน', () => {
    const ids = billMembers(bill({ category: 'mixed' }), members).map((m) => m.id);
    assert.deepEqual(ids, ['a', 'b', 'c']);
  });
});

// ---------- computeBill ----------

describe('computeBill: โหมด equal', () => {
  test('หารเท่ากันทุกคน', () => {
    const b = bill({ items: [item('หมู', 300)], paidById: 'a' });
    const bd = computeBill(b, [member('a'), member('b'), member('c')], T0);
    assert.equal(bd.subtotal, 300);
    assert.equal(bd.total, 300);
    assert.deepEqual(shares(bd.perMember), { a: 100, b: 100, c: 100 });
    assert.equal(bd.soleBearerId, null);
  });

  test('service + vat กระจายตามสัดส่วน (VAT 7% + service 10% แบบร้านไทย)', () => {
    const b = bill({ items: [item('อาหาร', 1000)], serviceChargePct: 10, vatPct: 7, paidById: 'a' });
    const bd = computeBill(b, [member('a'), member('b')], T0);
    assert.equal(bd.subtotal, 1000);
    assert.equal(bd.service, 100);
    // vat คิดบน (subtotal + service) = 1100 * 7% = 77
    assert.equal(round2(bd.vat), 77);
    assert.equal(round2(bd.total), 1177);
    assert.deepEqual(shares(bd.perMember), { a: 588.5, b: 588.5 });
  });

  test('ส่วนลดหักออกจากยอดรวมและกระจายให้ทุกคน', () => {
    const b = bill({ items: [item('อาหาร', 500)], discount: 100, paidById: 'a' });
    const bd = computeBill(b, [member('a'), member('b')], T0);
    assert.equal(bd.total, 400);
    assert.deepEqual(shares(bd.perMember), { a: 200, b: 200 });
  });

  test('ผลรวมยอดต่อคนต้องเท่ากับยอดรวมบิลเสมอ (เงินไม่หาย)', () => {
    const b = bill({ items: [item('x', 100)], paidById: 'a' });
    const bd = computeBill(b, [member('a'), member('b'), member('c')], T0);
    const sum = [...bd.perMember.values()].reduce((s, v) => s + v, 0);
    assert.equal(round2(sum), round2(bd.total));
  });
});

describe('computeBill: โหมด itemized', () => {
  test('หารตามผู้ร่วมของแต่ละเมนู', () => {
    const b = bill({
      splitMode: 'itemized',
      items: [item('สเต๊ก', 200, ['a']), item('น้ำ', 60, ['a', 'b', 'c'])],
      paidById: 'a',
    });
    const bd = computeBill(b, [member('a'), member('b'), member('c')], T0);
    // a = 200 + 20, b = 20, c = 20
    assert.deepEqual(shares(bd.perMember), { a: 220, b: 20, c: 20 });
  });

  test('participantIds ว่าง = หารกับทุกคนในบิล', () => {
    const b = bill({ splitMode: 'itemized', items: [item('รวม', 90)], paidById: 'a' });
    const bd = computeBill(b, [member('a'), member('b'), member('c')], T0);
    assert.deepEqual(shares(bd.perMember), { a: 30, b: 30, c: 30 });
  });

  test('ผู้ร่วมที่ระบุไม่เข้าเงื่อนไขบิลเลย → เกลี่ยให้ทุกคนในบิล (เงินไม่หาย)', () => {
    // เมนูระบุ c (กินเครื่องดื่ม) แต่บิลหมวดอาหาร → c ไม่เข้าเงื่อนไข
    const b = bill({
      category: 'food',
      splitMode: 'itemized',
      items: [item('เหล้า', 100, ['c'])],
      paidById: 'a',
    });
    const members = [member('a', { consumes: 'food' }), member('c', { consumes: 'drink' })];
    const bd = computeBill(b, members, T0);
    assert.deepEqual(shares(bd.perMember), { a: 100 });
    const sum = [...bd.perMember.values()].reduce((s, v) => s + v, 0);
    assert.equal(round2(sum), 100);
  });
});

describe('computeBill: โหมด time', () => {
  const HOUR = 3_600_000;

  test('หารตามสัดส่วนเวลาที่อยู่', () => {
    // หน้าต่าง 2 ชม.: a อยู่ทั้ง 2 ชม., b อยู่ 1 ชม. → 2:1
    const b = bill({ splitMode: 'time', items: [item('เบียร์', 300)], paidById: 'a', createdAt: T0 });
    const members = [
      member('a', { arrivedAt: T0, leftAt: T0 + 2 * HOUR }),
      member('b', { arrivedAt: T0 + HOUR, leftAt: T0 + 2 * HOUR }),
    ];
    const bd = computeBill(b, members, T0 + 2 * HOUR);
    assert.deepEqual(shares(bd.perMember), { a: 200, b: 100 });
  });

  test('คนที่ยังไม่กลับคิดถึงเวลา asOf', () => {
    const b = bill({ splitMode: 'time', items: [item('เบียร์', 200)], paidById: 'a', createdAt: T0 });
    const members = [
      member('a', { arrivedAt: T0, leftAt: null }),
      member('b', { arrivedAt: T0, leftAt: null }),
    ];
    const bd = computeBill(b, members, T0 + HOUR);
    assert.deepEqual(shares(bd.perMember), { a: 100, b: 100 });
  });

  test('ไม่มีข้อมูลเวลาเลย (weight รวม 0) → ตกไปหารเท่ากัน', () => {
    const b = bill({ splitMode: 'time', items: [item('x', 100)], paidById: 'a', createdAt: T0 });
    // ทุกคนมาถึงและกลับที่เวลาเดียวกัน = weight 0 ทั้งหมด
    const members = [
      member('a', { arrivedAt: T0, leftAt: T0 }),
      member('b', { arrivedAt: T0, leftAt: T0 }),
    ];
    const bd = computeBill(b, members, T0);
    assert.deepEqual(shares(bd.perMember), { a: 50, b: 50 });
  });
});

describe('computeBill: isTreat (บิลเลี้ยง)', () => {
  test('คนจ่ายรับยอดเต็ม คนอื่นเป็น 0', () => {
    const b = bill({ items: [item('หมู', 300)], paidById: 'a', isTreat: true });
    const bd = computeBill(b, [member('a'), member('b'), member('c')], T0);
    assert.deepEqual(shares(bd.perMember), { a: 300, b: 0, c: 0 });
    assert.equal(bd.soleBearerId, 'a');
    // ยอดรวมบิลไม่เปลี่ยน (เปลี่ยนแค่ว่าใครรับผิดชอบ)
    assert.equal(bd.total, 300);
  });

  test('isTreat แต่ยังไม่มีคนจ่าย → หารปกติ (เลี้ยงโดยไม่มีคนจ่ายไม่มีความหมาย)', () => {
    const b = bill({ items: [item('หมู', 300)], paidById: null, isTreat: true });
    const bd = computeBill(b, [member('a'), member('b')], T0);
    assert.deepEqual(shares(bd.perMember), { a: 150, b: 150 });
    assert.equal(bd.soleBearerId, null);
  });

  test('บิลเลี้ยงรวม service/vat แล้วคนจ่ายยังรับยอดเต็ม', () => {
    const b = bill({
      items: [item('อาหาร', 1000)],
      serviceChargePct: 10,
      vatPct: 7,
      paidById: 'a',
      isTreat: true,
    });
    const bd = computeBill(b, [member('a'), member('b')], T0);
    assert.equal(round2(bd.perMember.get('a') ?? 0), 1177);
    assert.equal(round2(bd.perMember.get('b') ?? 0), 0);
  });
});

describe('computeBill: ไม่มีใครเข้าเงื่อนไขบิล', () => {
  test('คนออกเงินรับยอดเต็มไปเอง (เงินไม่หายทั้งก้อน)', () => {
    // บิลหมวดเครื่องดื่ม แต่ทุกคนกินแค่อาหาร
    const b = bill({ category: 'drink', items: [item('เหล้า', 500)], paidById: 'a' });
    const members = [member('a', { consumes: 'food' }), member('b', { consumes: 'food' })];
    const bd = computeBill(b, members, T0);
    assert.deepEqual(shares(bd.perMember), { a: 500 });
    assert.equal(bd.soleBearerId, 'a');
  });

  test('ไม่มีใครเข้าเงื่อนไขและไม่มีคนจ่าย → perMember ว่าง', () => {
    const b = bill({ category: 'drink', items: [item('เหล้า', 500)], paidById: null });
    const bd = computeBill(b, [member('a', { consumes: 'food' })], T0);
    assert.equal(bd.perMember.size, 0);
    assert.equal(bd.soleBearerId, null);
  });
});

describe('computeBill: subtotal = 0 แต่มียอดรวม', () => {
  test('ไม่มีฐานให้เทียบสัดส่วน → เกลี่ยเท่ากัน', () => {
    // เมนูบวกลบหักกันหมด (subtotal = 0) แต่มี service charge คิดบน 0 = 0 → total = -discount
    const b = bill({
      items: [item('a', 100), item('b', -100)],
      discount: -50, // ส่วนลดติดลบ = บวกเพิ่ม → total = 0 - (-50) = 50
      paidById: 'a',
    });
    const bd = computeBill(b, [member('a'), member('b')], T0);
    assert.equal(bd.subtotal, 0);
    assert.equal(bd.total, 50);
    assert.deepEqual(shares(bd.perMember), { a: 25, b: 25 });
  });
});

// ---------- billIssues / billComplete ----------

describe('billIssues / billComplete', () => {
  test('บิลเปล่า: ทั้งไม่มีคนจ่ายและไม่มีเมนู', () => {
    const issues = billIssues(bill());
    assert.deepEqual(issues, ['ต้องเลือกคนออกเงิน', 'ต้องมีเมนูอย่างน้อย 1 รายการที่มีราคา']);
    assert.equal(billComplete(bill()), false);
  });

  test('บิลครบ = ไม่มี issue', () => {
    const b = bill({ items: [item('x', 100)], paidById: 'a' });
    assert.deepEqual(billIssues(b, [member('a')]), []);
    assert.equal(billComplete(b, [member('a')]), true);
  });

  test('เมนูราคา 0 ไม่นับเป็นเมนูที่มีราคา', () => {
    const b = bill({ items: [item('ฟรี', 0)], paidById: 'a' });
    assert.deepEqual(billIssues(b, [member('a')]), ['ต้องมีเมนูอย่างน้อย 1 รายการที่มีราคา']);
  });

  test('มีเมนูราคาบวกแต่ยอดรวมถูกหักจนไม่บวก → ยอดรวมต้องมากกว่า 0', () => {
    const b = bill({ items: [item('x', 80), item('คืนเงิน', -100)], paidById: 'a' });
    assert.deepEqual(billIssues(b, [member('a')]), ['ยอดรวมต้องมากกว่า 0']);
  });

  test('เจ้าหนี้ผี: paidById ชี้ไป member ที่ไม่มีอยู่ (ตรวจเฉพาะเมื่อส่ง members)', () => {
    const b = bill({ items: [item('x', 100)], paidById: 'ghost' });
    assert.deepEqual(billIssues(b, [member('a')]), ['คนออกเงินไม่อยู่ในรายชื่อสมาชิก']);
    // ไม่ส่ง members = ข้ามการตรวจข้อนี้
    assert.deepEqual(billIssues(b), []);
  });

  test('billComplete ใช้เกณฑ์เดียวกับ billIssues เป๊ะ', () => {
    const cases = [
      bill(),
      bill({ paidById: 'a' }),
      bill({ items: [item('x', 100)] }),
      bill({ items: [item('x', 100)], paidById: 'a' }),
      bill({ items: [item('x', 0)], paidById: 'a' }),
    ];
    for (const b of cases) {
      assert.equal(billComplete(b, [member('a')]), billIssues(b, [member('a')]).length === 0);
    }
  });
});

// ---------- computeTotals ----------

describe('computeTotals', () => {
  test('รวมยอดหลายบิล คนออกเงินคนละคน (multi-payer)', () => {
    const s = appState(
      [member('a'), member('b')],
      [
        bill({ id: 'b1', items: [item('x', 100)], paidById: 'a' }),
        bill({ id: 'b2', items: [item('y', 60)], paidById: 'b' }),
      ],
    );
    const { perMember, grandTotal } = computeTotals(s, T0);
    assert.equal(grandTotal, 160);
    // แต่ละคนรับผิดชอบ 50 + 30 = 80 แม้ออกเงินไม่เท่ากัน
    assert.deepEqual(shares(perMember), { a: 80, b: 80 });
  });

  test('บิลไม่สมบูรณ์ไม่เข้าสรุป', () => {
    const s = appState(
      [member('a'), member('b')],
      [
        bill({ id: 'b1', items: [item('x', 100)], paidById: 'a' }),
        bill({ id: 'b2', items: [item('y', 999)], paidById: null }), // ไม่มีคนจ่าย
      ],
    );
    const { grandTotal } = computeTotals(s, T0);
    assert.equal(grandTotal, 100);
  });
});

// ---------- computeNetBalances ----------

describe('computeNetBalances', () => {
  test('net > 0 = ออกเกิน (ควรได้คืน), net < 0 = ติดเงินคนอื่น', () => {
    const s = appState([member('a'), member('b')], [
      bill({ items: [item('x', 100)], paidById: 'a' }),
    ]);
    const net = computeNetBalances(s, T0);
    assert.equal(net.get('a'), 50);
    assert.equal(net.get('b'), -50);
  });

  test('ผลรวมทุกคนเป็น 0 พอดี (หารไม่ลงตัว 3 คน)', () => {
    const s = appState([member('a'), member('b'), member('c')], [
      bill({ items: [item('x', 100)], paidById: 'a' }),
    ]);
    const net = computeNetBalances(s, T0);
    const sum = [...net.values()].reduce((x, v) => x + v, 0);
    assert.equal(round2(sum), 0);
  });

  test('multi-payer หักกลบข้ามบิล', () => {
    const s = appState(
      [member('a'), member('b')],
      [
        bill({ id: 'b1', items: [item('x', 100)], paidById: 'a' }),
        bill({ id: 'b2', items: [item('y', 60)], paidById: 'b' }),
      ],
    );
    const net = computeNetBalances(s, T0);
    // a ออก 100 รับผิดชอบ 80 = +20; b ออก 60 รับผิดชอบ 80 = -20
    assert.equal(net.get('a'), 20);
    assert.equal(net.get('b'), -20);
  });

  test('บิลเลี้ยง: ทุกคนเสมอตัว (คนเลี้ยงออกเงิน = รับผิดชอบเอง)', () => {
    const s = appState([member('a'), member('b')], [
      bill({ items: [item('x', 300)], paidById: 'a', isTreat: true }),
    ]);
    const net = computeNetBalances(s, T0);
    assert.equal(net.get('a'), 0);
    assert.equal(net.get('b'), 0);
  });
});

// ---------- settleUp ----------

describe('settleUp', () => {
  test('เคสง่าย: 1 เจ้าหนี้ 1 ลูกหนี้', () => {
    const s = appState([member('a'), member('b')], [
      bill({ items: [item('x', 100)], paidById: 'a' }),
    ]);
    assert.deepEqual(settleUp(s, T0), [{ fromId: 'b', toId: 'a', amount: 50 }]);
  });

  test('multi-payer หักกลบแล้วเหลือรายการเดียว', () => {
    const s = appState(
      [member('a'), member('b')],
      [
        bill({ id: 'b1', items: [item('x', 100)], paidById: 'a' }),
        bill({ id: 'b2', items: [item('y', 60)], paidById: 'b' }),
      ],
    );
    assert.deepEqual(settleUp(s, T0), [{ fromId: 'b', toId: 'a', amount: 20 }]);
  });

  test('ทุกคนเสมอตัว → ไม่มีรายการโอน', () => {
    const s = appState(
      [member('a'), member('b')],
      [
        bill({ id: 'b1', items: [item('x', 100)], paidById: 'a' }),
        bill({ id: 'b2', items: [item('y', 100)], paidById: 'b' }),
      ],
    );
    assert.deepEqual(settleUp(s, T0), []);
  });

  test('ผลรวมยอดโอน = ผลรวมหนี้ และเงินไม่หายแม้หารไม่ลงตัว', () => {
    // 3 คนหาร 100 = 33.33/33.33/33.34
    const s = appState([member('a'), member('b'), member('c')], [
      bill({ items: [item('x', 100)], paidById: 'a' }),
    ]);
    const transfers = settleUp(s, T0);
    const net = computeNetBalances(s, T0);
    const totalIn = transfers.reduce((x, t) => x + t.amount, 0);
    assert.equal(round2(totalIn), round2(net.get('a') ?? 0));
    // ลูกหนี้แต่ละคนโอนออกเท่ากับหนี้ของตัวเองพอดี
    for (const id of ['b', 'c']) {
      const out = transfers.filter((t) => t.fromId === id).reduce((x, t) => x + t.amount, 0);
      assert.equal(round2(out), round2(-(net.get(id) ?? 0)));
    }
  });

  test('จำนวนรายการโอนน้อยที่สุด (greedy): 3 คน 1 เจ้าหนี้ = 2 รายการ', () => {
    const s = appState([member('a'), member('b'), member('c')], [
      bill({ items: [item('x', 300)], paidById: 'a' }),
    ]);
    const transfers = settleUp(s, T0);
    assert.equal(transfers.length, 2);
    assert.ok(transfers.every((t) => t.toId === 'a'));
  });

  test('บิลไม่สมบูรณ์ไม่สร้างรายการโอน', () => {
    const s = appState([member('a'), member('b')], [
      bill({ items: [item('x', 100)], paidById: null }),
    ]);
    assert.deepEqual(settleUp(s, T0), []);
  });
});

// ---------- transferKey ----------

describe('transferKey', () => {
  test('รูปแบบ fromId>toId@ยอด 2 ตำแหน่ง', () => {
    assert.equal(transferKey({ fromId: 'B', toId: 'A', amount: 550 }), 'B>A@550.00');
    assert.equal(transferKey({ fromId: 'b', toId: 'a', amount: 33.333 }), 'b>a@33.33');
  });

  test('ยอดเปลี่ยน → key เปลี่ยน (การติ๊กโอนแล้วเป็นโมฆะเอง)', () => {
    const k1 = transferKey({ fromId: 'b', toId: 'a', amount: 50 });
    const k2 = transferKey({ fromId: 'b', toId: 'a', amount: 60 });
    assert.notEqual(k1, k2);
  });

  test('ทิศทางต่างกัน → key ต่างกัน', () => {
    assert.notEqual(
      transferKey({ fromId: 'a', toId: 'b', amount: 50 }),
      transferKey({ fromId: 'b', toId: 'a', amount: 50 }),
    );
  });

  /**
   * แบบที่ 2 (มี stamp) ใช้กับ state ที่ยอดลอยตามเวลา — ผูกแค่ "คู่คน + ลายนิ้วมือข้อมูล"
   * เจตนา: เวลาที่เดินไปทำให้ยอดขยับ **และเครื่องหมายพลิก** ได้เอง (เจ้าหนี้กลายเป็นลูกหนี้)
   * ทั้งที่ผู้ใช้ไม่ได้แก้อะไร → ถ้า key ผูกยอด/ทิศ ติ๊ก "โอนแล้ว" จะหลุดเอง
   */
  test('มี stamp → key ผูกคู่คน ไม่ผูกทิศทาง (สลับ from/to ได้ key เดียวกัน)', () => {
    assert.equal(
      transferKey({ fromId: 'a', toId: 'b', amount: 50, stamp: 'tabc.def' }),
      transferKey({ fromId: 'b', toId: 'a', amount: 50, stamp: 'tabc.def' }),
    );
  });

  test('มี stamp → key ไม่ผูกยอด (คนละยอด คนละทิศ ก็ยังเท่ากัน)', () => {
    assert.equal(
      transferKey({ fromId: 'a', toId: 'b', amount: 1, stamp: 'tabc.def' }),
      transferKey({ fromId: 'b', toId: 'a', amount: 99999.99, stamp: 'tabc.def' }),
    );
  });

  test('มี stamp → คู่คนเรียงตาม code unit เสมอ (idน้อย|idมาก@stamp)', () => {
    assert.equal(transferKey({ fromId: 'b', toId: 'a', amount: 50, stamp: 'tabc.def' }), 'a|b@tabc.def');
    assert.equal(transferKey({ fromId: 'a', toId: 'b', amount: 50, stamp: 'tabc.def' }), 'a|b@tabc.def');
  });

  test('stamp ต่างกัน (ข้อมูลที่กำหนดยอดเปลี่ยน) → key ต่างกัน', () => {
    assert.notEqual(
      transferKey({ fromId: 'a', toId: 'b', amount: 50, stamp: 'tabc.def' }),
      transferKey({ fromId: 'a', toId: 'b', amount: 50, stamp: 'tzzz.zzz' }),
    );
  });

  test('คู่คนต่างกัน → key ต่างกันแม้ stamp เดียวกัน (key ไม่ชนกันในรายการเดียว)', () => {
    assert.notEqual(
      transferKey({ fromId: 'a', toId: 'b', amount: 50, stamp: 'tabc.def' }),
      transferKey({ fromId: 'a', toId: 'c', amount: 50, stamp: 'tabc.def' }),
    );
  });

  test('สองรูปแบบไม่มีทาง match ข้ามกัน (ตัวคั่น | vs > และค่าหลัง @)', () => {
    const stamped = transferKey({ fromId: 'a', toId: 'b', amount: 50, stamp: 'tabc.def' });
    const amountBound = transferKey({ fromId: 'a', toId: 'b', amount: 50 });
    assert.notEqual(stamped, amountBound);
    assert.ok(stamped.includes('|') && !stamped.includes('>'));
    assert.ok(amountBound.includes('>') && !amountBound.includes('|'));
  });
});

// ---------- nothingOwed ----------

describe('nothingOwed', () => {
  const t: Transfer[] = [
    { fromId: 'b', toId: 'a', amount: 50 },
    { fromId: 'c', toId: 'a', amount: 30 },
  ];

  test('ไม่มีรายการโอนเลย = ไม่มีหนี้ค้าง', () => {
    assert.equal(nothingOwed([], []), true);
  });

  test('ติ๊กครบทุกรายการ = ไม่มีหนี้ค้าง', () => {
    assert.equal(nothingOwed(t, t.map(transferKey)), true);
  });

  test('ติ๊กไม่ครบ = ยังมีหนี้ค้าง', () => {
    assert.equal(nothingOwed(t, [transferKey(t[0])]), false);
    assert.equal(nothingOwed(t, []), false);
  });

  test('key รูปแบบเก่า (ไม่มียอด) ไม่ match → ถือว่ายังไม่โอน (ปลอดภัยกว่า)', () => {
    assert.equal(nothingOwed(t, ['b>a', 'c>a']), false);
  });

  test('key ยอดไม่ตรงไม่ match', () => {
    assert.equal(nothingOwed([t[0]], ['b>a@99.00']), false);
  });
});

// ---------- pruneSettlements ----------

describe('pruneSettlements', () => {
  const t: Transfer[] = [
    { fromId: 'b', toId: 'a', amount: 50 },
    { fromId: 'c', toId: 'a', amount: 30 },
  ];

  test('เก็บเฉพาะ key ที่ตรงกับรายการโอนปัจจุบัน', () => {
    const kept = pruneSettlements(t, [transferKey(t[0]), 'b>a@99.00', 'zz>yy@1.00']);
    assert.deepEqual(kept, [transferKey(t[0])]);
  });

  test('ตัด key ซ้ำออก', () => {
    const k = transferKey(t[0]);
    assert.deepEqual(pruneSettlements(t, [k, k, k]), [k]);
  });

  test('ไม่มีรายการโอนเลย → ตัดทุก key', () => {
    assert.deepEqual(pruneSettlements([], [transferKey(t[0])]), []);
  });

  test('ทุก key ยังใช้ได้ → คงเดิมทั้งหมด (คงลำดับ)', () => {
    const keys = t.map(transferKey);
    assert.deepEqual(pruneSettlements(t, keys), keys);
  });
});

// ---------- amountsDrift ----------

const HOUR = 3_600_000;
const DAY = 86_400_000;

describe('amountsDrift', () => {
  test('บิลโหมด time ที่เข้าสรุปแล้ว + มีผู้ร่วมบิลยังไม่กลับ → จริง', () => {
    const s = appState(
      [member('a', { arrivedAt: T0 }), member('b', { arrivedAt: T0 + HOUR })],
      [bill({ splitMode: 'time', items: [item('เบียร์', 300)], paidById: 'a' })],
    );
    assert.equal(amountsDrift(s), true);
  });

  test('ทุกคนกลับแล้ว (leftAt ครบ) → เท็จ (ยอดนิ่ง ผูก key กับยอดได้ตามปกติ)', () => {
    const s = appState(
      [
        member('a', { arrivedAt: T0, leftAt: T0 + 2 * HOUR }),
        member('b', { arrivedAt: T0 + HOUR, leftAt: T0 + 2 * HOUR }),
      ],
      [bill({ splitMode: 'time', items: [item('เบียร์', 300)], paidById: 'a' })],
    );
    assert.equal(amountsDrift(s), false);
  });

  test('บิลโหมด time แต่ยังไม่เข้าสรุป (ไม่มีคนจ่าย) → เท็จ (ยอดยังไม่ถูกคิดเลย)', () => {
    const s = appState(
      [member('a'), member('b')],
      [bill({ splitMode: 'time', items: [item('เบียร์', 300)], paidById: null })],
    );
    assert.equal(amountsDrift(s), false);
    // ไม่มีเมนูที่มีราคาก็เข้าสรุปไม่ได้เหมือนกัน
    const noItem = appState(
      [member('a'), member('b')],
      [bill({ splitMode: 'time', items: [], paidById: 'a' })],
    );
    assert.equal(amountsDrift(noItem), false);
  });

  test('คนที่ยังไม่กลับ **ไม่ได้ร่วมบิลนั้น** (memberIds ไม่มีชื่อเขา) → เท็จ', () => {
    // เวอร์ชันเก่าใน store เช็ก s.members.some(leftAt == null) ทั้งกลุ่ม = กว้างเกินไป
    // ทำให้ state ที่ยอดนิ่งจริงถูกตีเป็น "ลอยตามเวลา" (แล้วไม่ prune key ที่หมดอายุ)
    const s = appState(
      [
        member('a', { arrivedAt: T0, leftAt: T0 + 2 * HOUR }),
        member('b', { arrivedAt: T0, leftAt: T0 + 2 * HOUR }),
        member('c', { arrivedAt: T0, leftAt: null }), // ยังนั่งอยู่ แต่ไม่ได้ร่วมบิลนี้
      ],
      [
        bill({
          splitMode: 'time',
          items: [item('เบียร์', 300)],
          paidById: 'a',
          memberIds: ['a', 'b'],
        }),
      ],
    );
    assert.equal(amountsDrift(s), false);
  });

  test('คนที่ยังไม่กลับ consumes ไม่เข้าหมวดบิล → เท็จ (ไม่ใช่ผู้ร่วมบิลจริง)', () => {
    const s = appState(
      [
        member('a', { consumes: 'food', arrivedAt: T0, leftAt: T0 + 2 * HOUR }),
        member('b', { consumes: 'food', arrivedAt: T0, leftAt: T0 + 2 * HOUR }),
        member('c', { consumes: 'drink', arrivedAt: T0, leftAt: null }),
      ],
      [bill({ category: 'food', splitMode: 'time', items: [item('ข้าว', 300)], paidById: 'a' })],
    );
    assert.equal(amountsDrift(s), false);
  });

  test('โหมด equal/itemized ไม่ลอยตามเวลา แม้ยังมีคนไม่กลับ', () => {
    for (const mode of ['equal', 'itemized'] as SplitMode[]) {
      const s = appState(
        [member('a'), member('b')],
        [bill({ splitMode: mode, items: [item('x', 100)], paidById: 'a' })],
      );
      assert.equal(amountsDrift(s), false, `โหมด ${mode}`);
    }
  });

  test('มีบิล time ที่ลอยอยู่ใบเดียวในหลายบิล → จริง (ทั้ง state ต้องใช้ stamp)', () => {
    const s = appState(
      [member('a', { arrivedAt: T0 }), member('b', { arrivedAt: T0 + HOUR })],
      [
        bill({ id: 'b1', items: [item('x', 100)], paidById: 'a' }),
        bill({ id: 'b2', splitMode: 'time', items: [item('y', 200)], paidById: 'b' }),
      ],
    );
    assert.equal(amountsDrift(s), true);
  });

  test('ไม่มีบิลเลย → เท็จ', () => {
    assert.equal(amountsDrift(appState([member('a')], [])), false);
  });
});

// ---------- โหมด time + settlements: การติ๊ก "โอนแล้ว" ต้องไม่หลุดเพราะเวลาเดิน ----------

/**
 * state ที่ยอด "ลอยตามเวลา" — บิลโหมด time ที่ b ยัง `leftAt: null` (เคสปกติที่สุด: ยังนั่งอยู่)
 * ยอดที่ b ต้องโอนให้ a เพิ่มขึ้นทุกมิลลิวินาทีตาม asOf
 */
function driftingState(settlements: string[] = []): AppState {
  return appState(
    [member('a', { arrivedAt: T0 }), member('b', { arrivedAt: T0 + HOUR })],
    [bill({ splitMode: 'time', items: [item('เบียร์', 300)], paidById: 'a', createdAt: T0 })],
    settlements,
  );
}

describe('บิลโหมด time + คนยังไม่กลับ: key ของ settlements ต้องนิ่งข้ามเวลา', () => {
  const T1 = T0 + 2 * HOUR;

  test('ยอดขยับตามเวลาจริง (ยืนยันว่าเคสนี้คือเคสยอดลอย ไม่ใช่ยอดนิ่ง)', () => {
    const s = driftingState();
    const now = settleUp(s, T1)[0];
    const later = settleUp(s, T1 + HOUR)[0];
    assert.notEqual(now.amount, later.amount);
  });

  test('key เดิมข้ามเวลา 1 ชม. / 1 วัน / 30 วัน (ติ๊ก "โอนแล้ว" ไม่หลุดเอง)', () => {
    const s = driftingState();
    const base = transferKey(settleUp(s, T1)[0]);
    for (const gap of [1, HOUR, DAY, 30 * DAY]) {
      assert.equal(transferKey(settleUp(s, T1 + gap)[0]), base, `ห่าง ${gap} ms`);
    }
  });

  test('settleUp ติด stamp ให้ทุกรายการเมื่อยอดลอย (และ key ไม่ผูกยอด/ไม่ผูกทิศ)', () => {
    const s = driftingState();
    const t = settleUp(s, T1);
    assert.equal(t.length, 1);
    assert.ok(t[0].stamp, 'ต้องมี stamp');
    // รายการโอนจริงยังมีทิศทางให้ผู้ใช้เห็น (b โอนให้ a) — แต่ key ไม่เก็บทิศไว้
    assert.equal(`${t[0].fromId}>${t[0].toId}`, 'b>a');
    // key = คู่คนเรียงแล้ว (a|b) + stamp ไม่ใช่รูปแบบผูกยอด (ยอดขึ้นต้นด้วยเลข, stamp ขึ้นต้นด้วย t)
    assert.match(transferKey(t[0]), /^a\|b@t[a-z0-9]+\.[a-z0-9]+$/);
    assert.ok(!transferKey(t[0]).includes(round2(t[0].amount).toFixed(2)));
  });

  test('ยอดนิ่ง (ทุกคนกลับแล้ว) ไม่ติด stamp → key ยังผูกยอดตามปกติ (ADR 0003)', () => {
    const s = appState(
      [
        member('a', { arrivedAt: T0, leftAt: T0 + 2 * HOUR }),
        member('b', { arrivedAt: T0 + HOUR, leftAt: T0 + 2 * HOUR }),
      ],
      [bill({ splitMode: 'time', items: [item('เบียร์', 300)], paidById: 'a', createdAt: T0 })],
    );
    const t = settleUp(s, T1);
    assert.equal(t[0].stamp, undefined);
    assert.equal(transferKey(t[0]), `b>a@${round2(t[0].amount).toFixed(2)}`);
  });

  test('nothingOwed ยังจริงข้ามเวลา (กล่อง "จ่ายครบทุกคนแล้ว" ต้องไม่หายเอง)', () => {
    const s = driftingState();
    const ticked = settleUp(s, T1).map(transferKey);
    assert.equal(nothingOwed(settleUp(s, T1), ticked), true);
    for (const gap of [1, HOUR, DAY, 30 * DAY]) {
      assert.equal(nothingOwed(settleUp(s, T1 + gap), ticked), true, `ห่าง ${gap} ms`);
    }
  });

  test('pruneSettlements ไม่ตัด key ที่ติ๊กไว้ทิ้งเมื่อเวลาเดินไป', () => {
    const ticked = settleUp(driftingState(), T1).map(transferKey);
    const later = settleUp(driftingState(), T1 + DAY);
    assert.deepEqual(pruneSettlements(later, ticked), ticked);
  });

  test('stamp ไม่ขึ้นกับลำดับ row ของ members/bills/items (realtime refetch ไม่ทำติ๊กหลุด)', () => {
    const s = driftingState();
    const shuffled = appState(
      [...s.members].reverse(),
      s.bills.map((b) => ({ ...b, memberIds: [...b.memberIds].reverse() })),
    );
    assert.equal(
      transferKey(settleUp(shuffled, T1)[0]),
      transferKey(settleUp(s, T1)[0]),
    );
  });
});

describe('โหมด time: การติ๊กเป็นโมฆะเมื่อ "ผู้ใช้แก้ข้อมูล" (เจตนาของ ADR 0003 ต้องไม่หาย)', () => {
  const T1 = T0 + 2 * HOUR;
  /** ติ๊กครบทุกรายการตอน T1 แล้วคืน key ที่ติ๊กไว้ */
  const tickedAtT1 = () => settleUp(driftingState(), T1).map(transferKey);

  /** แก้ state แล้วตรวจว่าการติ๊กเดิมยัง match ไหม (asOf เดินไป 1 ชม. ด้วย เหมือนใช้งานจริง) */
  const stillTicked = (edit: (s: AppState) => AppState): boolean =>
    nothingOwed(settleUp(edit(driftingState()), T1 + HOUR), tickedAtT1());

  test('แก้ราคาเมนู → ติ๊กเดิมเป็นโมฆะ', () => {
    assert.equal(
      stillTicked((s) => ({
        ...s,
        bills: s.bills.map((b) => ({ ...b, items: [item('เบียร์', 400)] })),
      })),
      false,
    );
  });

  test('เปลี่ยนคนออกเงิน → ติ๊กเดิมเป็นโมฆะ', () => {
    assert.equal(
      stillTicked((s) => ({ ...s, bills: s.bills.map((b) => ({ ...b, paidById: 'b' })) })),
      false,
    );
  });

  test('เพิ่มบิลใหม่ → ติ๊กเดิมเป็นโมฆะ', () => {
    assert.equal(
      stillTicked((s) => ({
        ...s,
        bills: [...s.bills, bill({ id: 'b2', items: [item('ของหวาน', 90)], paidById: 'a' })],
      })),
      false,
    );
  });

  test('เพิ่มสมาชิก → ติ๊กเดิมเป็นโมฆะ', () => {
    assert.equal(
      stillTicked((s) => ({ ...s, members: [...s.members, member('c', { arrivedAt: T0 })] })),
      false,
    );
  });

  test('ลบสมาชิก → ติ๊กเดิมเป็นโมฆะ', () => {
    // เหลือ a คนเดียว = ไม่มีรายการโอน; key ที่ติ๊กไว้ต้องไม่ถูกนับว่ายังใช้ได้
    const edited: AppState = { ...driftingState(), members: [member('a', { arrivedAt: T0 })] };
    assert.deepEqual(pruneSettlements(settleUp(edited, T1 + HOUR), tickedAtT1()), []);
  });

  test('ติ๊ก "กลับแล้ว" (leftAt) → ยอดหยุดนิ่ง ติ๊กเดิมเป็นโมฆะ', () => {
    assert.equal(
      stillTicked((s) => ({
        ...s,
        members: s.members.map((m) => (m.id === 'b' ? { ...m, leftAt: T1 } : m)),
      })),
      false,
    );
  });

  test('เปลี่ยนเวลามาถึง (arrivedAt) → ติ๊กเดิมเป็นโมฆะ', () => {
    assert.equal(
      stillTicked((s) => ({
        ...s,
        members: s.members.map((m) => (m.id === 'b' ? { ...m, arrivedAt: T0 } : m)),
      })),
      false,
    );
  });

  test('เปิดบิลเลี้ยง (isTreat) → ติ๊กเดิมเป็นโมฆะ', () => {
    // เลี้ยงแล้วไม่มีใครต้องโอน → key เดิมต้องไม่เหลืออยู่
    const edited: AppState = {
      ...driftingState(),
      bills: driftingState().bills.map((b) => ({ ...b, isTreat: true })),
    };
    assert.deepEqual(pruneSettlements(settleUp(edited, T1 + HOUR), tickedAtT1()), []);
  });

  test('ใส่ service charge → ติ๊กเดิมเป็นโมฆะ', () => {
    assert.equal(
      stillTicked((s) => ({ ...s, bills: s.bills.map((b) => ({ ...b, serviceChargePct: 10 })) })),
      false,
    );
  });

  test('ใส่ VAT → ติ๊กเดิมเป็นโมฆะ', () => {
    assert.equal(
      stillTicked((s) => ({ ...s, bills: s.bills.map((b) => ({ ...b, vatPct: 7 })) })),
      false,
    );
  });

  test('ใส่ส่วนลด → ติ๊กเดิมเป็นโมฆะ', () => {
    assert.equal(
      stillTicked((s) => ({ ...s, bills: s.bills.map((b) => ({ ...b, discount: 20 })) })),
      false,
    );
  });

  test('เปลี่ยนผู้ร่วมบิล (memberIds) → ติ๊กเดิมเป็นโมฆะ', () => {
    assert.equal(
      stillTicked((s) => ({ ...s, bills: s.bills.map((b) => ({ ...b, memberIds: ['a', 'b'] })) })),
      false,
    );
  });

  test('เปลี่ยนผู้ร่วมของเมนู (participantIds) → ติ๊กเดิมเป็นโมฆะ', () => {
    assert.equal(
      stillTicked((s) => ({
        ...s,
        bills: s.bills.map((b) => ({ ...b, items: [item('เบียร์', 300, ['a'])] })),
      })),
      false,
    );
  });

  test('เปลี่ยน consumes ของสมาชิก → ติ๊กเดิมเป็นโมฆะ', () => {
    assert.equal(
      stillTicked((s) => ({
        ...s,
        members: s.members.map((m) => (m.id === 'b' ? { ...m, consumes: 'food' } : m)),
      })),
      false,
    );
  });

  test('เปลี่ยนวิธีหารเป็น equal → ยอดหยุดลอย ติ๊กเดิมเป็นโมฆะ (key กลับไปผูกยอด)', () => {
    assert.equal(
      stillTicked((s) => ({ ...s, bills: s.bills.map((b) => ({ ...b, splitMode: 'equal' })) })),
      false,
    );
  });

  /**
   * ข้อนี้ **จงใจให้ติ๊กยังติด** — ชื่อ/พร้อมเพย์ไม่กระทบยอดที่ใครต้องโอนให้ใครเท่าไร
   * ถ้าทำเป็นโมฆะ ผู้ใช้แก้คำผิดในชื่อเพื่อนแล้วทุกคนต้องมาติ๊ก "โอนแล้ว" ใหม่หมด = น่ารำคาญเปล่า ๆ
   * (ถ้าเทสนี้แดงเพราะมีคนเพิ่ม name/promptPay เข้า splitStamp ให้ทบทวนว่าจำเป็นจริงไหม)
   */
  test('เปลี่ยนชื่อ/พร้อมเพย์สมาชิก → ติ๊กเดิมยังติด (จงใจ: ไม่กระทบยอด)', () => {
    assert.equal(
      stillTicked((s) => ({
        ...s,
        members: s.members.map((m) =>
          m.id === 'b' ? { ...m, name: 'สมชาย', promptPay: '0812345678' } : m,
        ),
      })),
      true,
    );
  });

  test('เปลี่ยนชื่อบิล/ชื่อเมนู → ติ๊กเดิมยังติด (จงใจ: ไม่กระทบยอด)', () => {
    const edited: AppState = {
      ...driftingState(),
      bills: driftingState().bills.map((b) => ({
        ...b,
        name: 'ชื่อบิลใหม่',
        items: b.items.map((x) => ({ ...x, name: 'ชื่อเมนูใหม่' })),
      })),
    };
    assert.equal(nothingOwed(settleUp(edited, T1 + HOUR), tickedAtT1()), true);
  });
});

/**
 * ปิดช่องที่เกิดขึ้นได้เฉพาะตอน key **ไม่ผูกทิศทาง**: กลุ่มหลายเจ้าหนี้ (คู่คนเดิมอยู่ครบ)
 * ถ้า key ไม่ผูกทิศแล้ว ต้องมั่นใจว่า **stamp** ยังจับการแก้ข้อมูลได้ทุกช่อง
 * ไม่งั้นผู้ใช้แก้ราคา/ผู้ร่วม/เวลาแล้วยอดเปลี่ยน แต่คู่คนเท่าเดิม → ติ๊กเก่าค้าง = เงินหาย
 * (เคสชุดบน :748 เป็นกลุ่ม 2 คนที่คู่คนมีคู่เดียว จึงไม่ครอบช่องนี้)
 */
describe('โหมด time หลายเจ้าหนี้: แก้ข้อมูลแล้วต้องเป็นโมฆะ แม้คู่คนไม่เปลี่ยน', () => {
  const T1 = T0 + 3 * HOUR;

  /** 4 คน 3 เจ้าหนี้ + บิล time ที่ b/d ยังไม่กลับ → star รอบ a ทุกคู่คงที่ */
  const multi = (): AppState =>
    appState(
      [
        member('a', { arrivedAt: T0 }),
        member('b', { arrivedAt: T0 + HOUR }),
        member('c', { arrivedAt: T0, leftAt: T0 + 2 * HOUR }),
        member('d', { arrivedAt: T0 + 30 * 60_000 }),
      ],
      [
        bill({ id: 'b1', splitMode: 'time', items: [item('เหล้า', 1200)], paidById: 'a' }),
        bill({ id: 'b2', splitMode: 'equal', items: [item('ข้าว', 500)], paidById: 'c' }),
        bill({ id: 'b3', splitMode: 'itemized', items: [item('ของหวาน', 300, ['b', 'd'])], paidById: 'd' }),
      ],
    );

  const tickedAtT1 = () => settleUp(multi(), T1).map(transferKey);

  /** แก้ข้อมูลแล้วคืน [ติ๊กเดิมยังครบไหม, ชุดคู่คนเปลี่ยนไหม] */
  const check = (edit: (s: AppState) => AppState): { ticked: boolean; samePairs: boolean } => {
    const before = settleUp(multi(), T1);
    const after = settleUp(edit(multi()), T1 + HOUR);
    const pairs = (ts: Transfer[]) => [...ts.map((t) => [t.fromId, t.toId].sort().join('|'))].sort().join(',');
    return { ticked: nothingOwed(after, tickedAtT1()), samePairs: pairs(before) === pairs(after) };
  };

  test('ตั้งต้น: กลุ่มนี้เป็น star หลายเส้นจริง (ไม่ใช่วง 2 คน)', () => {
    const t = settleUp(multi(), T1);
    assert.equal(amountsDrift(multi()), true);
    assert.equal(t.length, 3);
    assert.ok(t.every((x) => x.stamp), 'ทุกรายการต้องมี stamp');
  });

  test('แก้ราคาเมนู → เป็นโมฆะ ทั้งที่คู่คนยังเป็นชุดเดิม', () => {
    const r = check((s) => ({
      ...s,
      bills: s.bills.map((b) => (b.id === 'b1' ? { ...b, items: [item('เหล้า', 1500)] } : b)),
    }));
    assert.equal(r.samePairs, true, 'เคสนี้ต้องเป็นเคสที่คู่คนไม่เปลี่ยน ไม่งั้นไม่ได้ทดสอบช่องที่ต้องการ');
    assert.equal(r.ticked, false);
  });

  test('แก้ผู้ร่วมของเมนู → เป็นโมฆะ ทั้งที่คู่คนยังเป็นชุดเดิม', () => {
    const r = check((s) => ({
      ...s,
      bills: s.bills.map((b) =>
        b.id === 'b3' ? { ...b, items: [item('ของหวาน', 300, ['a', 'c'])] } : b,
      ),
    }));
    assert.equal(r.samePairs, true);
    assert.equal(r.ticked, false);
  });

  test('แก้เวลามาถึง → เป็นโมฆะ ทั้งที่คู่คนยังเป็นชุดเดิม', () => {
    const r = check((s) => ({
      ...s,
      members: s.members.map((m) => (m.id === 'b' ? { ...m, arrivedAt: T0 + 2 * HOUR } : m)),
    }));
    assert.equal(r.samePairs, true);
    assert.equal(r.ticked, false);
  });

  test('แก้เวลากลับของคนที่กลับแล้ว → เป็นโมฆะ', () => {
    const r = check((s) => ({
      ...s,
      members: s.members.map((m) => (m.id === 'c' ? { ...m, leftAt: T0 + HOUR } : m)),
    }));
    assert.equal(r.ticked, false);
  });

  test('สลับทิศทางที่ผู้ใช้ทำเอง (เปลี่ยนคนออกเงิน) → เป็นโมฆะ ไม่ใช่ "ทิศพลิกเพราะเวลา"', () => {
    // key ไม่ผูกทิศ → ต้องพึ่ง stamp จับให้ได้ ไม่งั้นเปลี่ยนคนจ่ายแล้วติ๊กเก่าค้าง
    const r = check((s) => ({
      ...s,
      bills: s.bills.map((b) => (b.id === 'b1' ? { ...b, paidById: 'b' } : b)),
    }));
    assert.equal(r.ticked, false);
  });

  test('ใส่ VAT/service/ส่วนลด → เป็นโมฆะทุกช่อง', () => {
    for (const patch of [{ vatPct: 7 }, { serviceChargePct: 10 }, { discount: 100 }] as Partial<Bill>[]) {
      const r = check((s) => ({
        ...s,
        bills: s.bills.map((b) => (b.id === 'b1' ? { ...b, ...patch } : b)),
      }));
      assert.equal(r.ticked, false, `patch ${JSON.stringify(patch)}`);
    }
  });

  test('เปลี่ยนชื่อ/พร้อมเพย์ → ยังติด (จงใจ: ไม่กระทบยอด) แม้ในกลุ่มหลายเจ้าหนี้', () => {
    const r = check((s) => ({
      ...s,
      members: s.members.map((m) =>
        m.id === 'b' ? { ...m, name: 'สมชาย', promptPay: '0812345678' } : m,
      ),
    }));
    assert.equal(r.ticked, true);
  });
});

describe('fail-safe: key รูปแบบที่ไม่รู้จักต้องอ่านเป็น "ยังไม่โอน"', () => {
  const T1 = T0 + 2 * HOUR;

  test('key รูปแบบเก่าไม่มียอด (B>A) ไม่ match กับ transfer ที่มี stamp', () => {
    const t = settleUp(driftingState(), T1);
    assert.equal(nothingOwed(t, ['b>a']), false);
  });

  test('key ผูกยอดแบบเก่าไม่ match กับ transfer ที่มี stamp (แม้ยอดจะตรง)', () => {
    const t = settleUp(driftingState(), T1);
    const amountKey = `b>a@${round2(t[0].amount).toFixed(2)}`;
    assert.equal(nothingOwed(t, [amountKey]), false);
    assert.deepEqual(pruneSettlements(t, [amountKey]), []);
  });

  test('key ที่มี stamp ไม่ match กับ transfer ที่ยอดนิ่ง (ผูกยอด)', () => {
    const stamped = transferKey(settleUp(driftingState(), T1)[0]);
    const settled = appState(
      [
        member('a', { arrivedAt: T0, leftAt: T0 + 2 * HOUR }),
        member('b', { arrivedAt: T0 + HOUR, leftAt: T0 + 2 * HOUR }),
      ],
      [bill({ splitMode: 'time', items: [item('เบียร์', 300)], paidById: 'a', createdAt: T0 })],
    );
    assert.equal(nothingOwed(settleUp(settled, T1), [stamped]), false);
  });

  test('stamp ของ state อื่นไม่ match (hash ต่างกัน)', () => {
    const other = appState(
      [member('a', { arrivedAt: T0 }), member('b', { arrivedAt: T0 + HOUR })],
      [bill({ splitMode: 'time', items: [item('เบียร์', 999)], paidById: 'a', createdAt: T0 })],
    );
    const otherKey = transferKey(settleUp(other, T1)[0]);
    assert.equal(nothingOwed(settleUp(driftingState(), T1), [otherKey]), false);
  });
});

// ---------- invariant / property test (seed คงที่ ห้ามสุ่มจริง) ----------

/**
 * PRNG แบบ mulberry32 — seed คงที่เพื่อให้เทส **deterministic** เหมือนกันทุกเครื่อง/ทุกรอบ
 * (ห้ามใช้ Math.random ที่นี่: เคสที่แดงจะรีโปรไม่ได้)
 */
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** จำนวนเงิน (บาท) → สตางค์จำนวนเต็ม สำหรับเทียบผลรวมแบบไม่มี error ลอย */
function cents(n: number): number {
  return Math.round(n * 100);
}

const SPLIT_MODES: SplitMode[] = ['equal', 'itemized', 'time'];
const CATEGORIES: BillCategory[] = ['food', 'drink', 'mixed'];
const CONSUMES: Consumes[] = ['both', 'food', 'drink'];

/**
 * สร้าง state สุ่ม (จาก seed คงที่) ที่ครอบเคสยาก:
 * ราคาเศษต่ำกว่าสตางค์ (1000/3), ราคาติดลบ, ส่วนลดเกิน subtotal, isTreat,
 * ทุก splitMode, ทุก category, คนที่ยังไม่มา/ยังไม่กลับ, บิลที่ไม่มีคนจ่าย
 *
 * @param maxMembers จำนวนสมาชิกมากสุด (สุ่ม 1..maxMembers) — ใช้ 10 เพื่อวัดกลุ่มใหญ่
 *   ที่การจับคู่โอนซับซ้อนกว่า (เจ้าหนี้/ลูกหนี้หลายคนพร้อมกัน)
 */
function randomState(rand: () => number, maxMembers = 5): AppState {
  const memberCount = 1 + Math.floor(rand() * maxMembers);
  const members: Member[] = [];
  for (let i = 0; i < memberCount; i++) {
    members.push({
      id: `m${i}`,
      name: `คน${i}`,
      consumes: CONSUMES[Math.floor(rand() * CONSUMES.length)],
      arrivedAt: rand() < 0.5 ? T0 + Math.floor(rand() * 3 * HOUR) : null,
      leftAt: rand() < 0.5 ? T0 + Math.floor(rand() * 5 * HOUR) : null,
    });
  }

  const billCount = 1 + Math.floor(rand() * 3);
  const bills: Bill[] = [];
  for (let j = 0; j < billCount; j++) {
    const items: BillItem[] = [];
    const itemCount = Math.floor(rand() * 4);
    for (let k = 0; k < itemCount; k++) {
      const kind = rand();
      let price: number;
      if (kind < 0.15) price = -Math.round(rand() * 20000) / 100; // ราคาติดลบ (คืนเงิน/หักส่วน)
      else if (kind < 0.4) price = (rand() * 1000) / 3; // เศษต่ำกว่าสตางค์ (3.666...)
      else price = Math.round(rand() * 100000) / 100;
      items.push({
        id: `b${j}i${k}`,
        name: `เมนู${k}`,
        price,
        participantIds: members.filter(() => rand() < 0.4).map((m) => m.id),
      });
    }
    bills.push({
      id: `b${j}`,
      name: `บิล${j}`,
      category: CATEGORIES[Math.floor(rand() * CATEGORIES.length)],
      splitMode: SPLIT_MODES[Math.floor(rand() * SPLIT_MODES.length)],
      items,
      memberIds: rand() < 0.4 ? members.filter(() => rand() < 0.6).map((m) => m.id) : [],
      paidById: rand() < 0.9 ? members[Math.floor(rand() * members.length)].id : null,
      isTreat: rand() < 0.15,
      // ส่วนลดอาจมากกว่ายอดเมนู (ยอดรวมติดลบ) — ต้องยังไม่ทำเงินหาย
      discount: rand() < 0.3 ? Math.round(rand() * 150000) / 100 : 0,
      serviceChargePct: rand() < 0.5 ? [0, 10, 7.5, 3.333][Math.floor(rand() * 4)] : 0,
      vatPct: rand() < 0.5 ? [0, 7, 7.5][Math.floor(rand() * 3)] : 0,
      createdAt: T0 + Math.floor(rand() * HOUR),
    });
  }
  return { members, bills, venue: null, settlements: [] };
}

/**
 * "ศูนย์กลาง" ของรายการโอน = id ที่เป็นปลายด้านหนึ่งของ **ทุก** รายการ
 * คืน null ถ้าไม่ชัดเจน (เหลือเส้นเดียว → ทั้งสองฝ่ายเข้าเงื่อนไข) เพื่อไม่ให้เทสเดาผิด
 */
function soleHub(transfers: Transfer[]): string | null {
  const ids = new Set<string>();
  for (const t of transfers) {
    ids.add(t.fromId);
    ids.add(t.toId);
  }
  const hubs = [...ids].filter((h) => transfers.every((t) => t.fromId === h || t.toId === h));
  return hubs.length === 1 ? hubs[0] : null;
}

/**
 * จำนวนรายการโอนที่ greedy (min-transfer) จะใช้ — ใช้เป็น **baseline วัดต้นทุนของ star** เท่านั้น
 * เขียนซ้ำในเทสโดยเจตนา เพราะ settleUp โหมดยอดลอยไม่ใช่ greedy แล้ว
 * (ถ้า import ตัวจริงมาเทียบ จะกลายเป็นเทสที่เทียบตัวเองกับตัวเอง = ไม่จับอะไรได้)
 */
function greedyTransferCount(state: AppState, asOf: number): number {
  const debtors: number[] = [];
  const creditors: number[] = [];
  for (const v of computeNetBalances(state, asOf).values()) {
    const c = cents(v);
    if (c < 0) debtors.push(-c);
    else if (c > 0) creditors.push(c);
  }
  debtors.sort((a, b) => b - a);
  creditors.sort((a, b) => b - a);
  let i = 0;
  let j = 0;
  let n = 0;
  while (i < debtors.length && j < creditors.length) {
    const pay = Math.min(debtors[i], creditors[j]);
    if (pay > 0) n++;
    debtors[i] -= pay;
    creditors[j] -= pay;
    if (debtors[i] === 0) i++;
    if (creditors[j] === 0) j++;
  }
  return n;
}

/**
 * เงินต้องไม่หาย/ไม่งอก **ทุกเคส** ไม่ใช่แค่เคสที่นึกออก
 * เคยเพี้ยนถึง ฿0.03 ใน 1947/8000 เคส (reviewer fuzz เจอ) ก่อนย้ายมาคิดบนสตางค์จำนวนเต็ม
 * เทสนี้ต้องเป็น 0 เคสเสมอ — แดง = สูตรปัดเศษใน split.ts พลาด อย่าลดจำนวนรอบเพื่อให้ผ่าน
 */
describe('invariant: ผลรวมยอดต่อคนต้องเท่ากับยอดรวมเป๊ะ (seeded fuzz 8000 เคส)', () => {
  const ROUNDS = 8000;
  const ASOF = T0 + 4 * HOUR;

  test('sum(computeBill().perMember) === computeBill().total ทุกบิล', () => {
    const rand = mulberry32(20260731);
    const bad: string[] = [];
    for (let i = 0; i < ROUNDS; i++) {
      const s = randomState(rand);
      for (const b of s.bills) {
        const bd = computeBill(b, s.members, ASOF);
        if (bd.perMember.size === 0) continue; // ไม่มีใครรับผิดชอบ (ไม่มีคนจ่าย + ไม่มีคนเข้าเงื่อนไข)
        const sum = [...bd.perMember.values()].reduce((x, v) => x + cents(v), 0);
        if (sum !== cents(bd.total)) {
          bad.push(`รอบ ${i} บิล ${b.id}: ผลรวม ${sum} ≠ ยอดรวม ${cents(bd.total)} สตางค์`);
        }
      }
    }
    assert.deepEqual(bad, []);
  });

  test('sum(computeTotals().perMember) === grandTotal', () => {
    const rand = mulberry32(20260731);
    const bad: string[] = [];
    for (let i = 0; i < ROUNDS; i++) {
      const s = randomState(rand);
      const { perMember, grandTotal } = computeTotals(s, ASOF);
      // บิลที่ไม่มีใครรับผิดชอบเลย (perMember ว่าง) ทำให้ยอดรวมมีส่วนที่ไม่มีเจ้าของ — ข้ามเคสนั้น
      const orphan = s.bills.some(
        (b) => billComplete(b, s.members) && computeBill(b, s.members, ASOF).perMember.size === 0,
      );
      if (orphan) continue;
      const sum = [...perMember.values()].reduce((x, v) => x + cents(v), 0);
      if (sum !== cents(grandTotal)) {
        bad.push(`รอบ ${i}: ผลรวม ${sum} ≠ grandTotal ${cents(grandTotal)} สตางค์`);
      }
    }
    assert.deepEqual(bad, []);
  });

  test('sum(computeNetBalances()) === 0 (ไม่มีเงินโผล่มาจากไหน)', () => {
    const rand = mulberry32(20260731);
    const bad: string[] = [];
    for (let i = 0; i < ROUNDS; i++) {
      const s = randomState(rand);
      const net = computeNetBalances(s, ASOF);
      const sum = [...net.values()].reduce((x, v) => x + cents(v), 0);
      if (sum !== 0) bad.push(`รอบ ${i}: ผลรวมสุทธิ ${sum} สตางค์ (ต้องเป็น 0)`);
    }
    assert.deepEqual(bad, []);
  });

  test('settleUp: ยอดรับ-จ่ายของทุกคนตรงกับ net ของตัวเองเป๊ะ', () => {
    const rand = mulberry32(20260731);
    const bad: string[] = [];
    for (let i = 0; i < ROUNDS; i++) {
      const s = randomState(rand);
      const net = computeNetBalances(s, ASOF);
      const transfers = settleUp(s, ASOF);
      for (const [id, v] of net) {
        const out = transfers
          .filter((t) => t.fromId === id)
          .reduce((x, t) => x + cents(t.amount), 0);
        const inn = transfers.filter((t) => t.toId === id).reduce((x, t) => x + cents(t.amount), 0);
        if (inn - out !== cents(v)) {
          bad.push(`รอบ ${i} คน ${id}: โอนสุทธิ ${inn - out} ≠ net ${cents(v)} สตางค์`);
        }
      }
    }
    assert.deepEqual(bad, []);
  });

  test('transferKey ของ state เดียวกันคงที่ และไม่ชนกันในรายการเดียว', () => {
    const rand = mulberry32(20260731);
    const bad: string[] = [];
    for (let i = 0; i < ROUNDS; i++) {
      const s = randomState(rand);
      const t1 = settleUp(s, ASOF).map(transferKey);
      const t2 = settleUp(s, ASOF).map(transferKey);
      if (t1.join('|') !== t2.join('|')) bad.push(`รอบ ${i}: key ไม่คงที่ระหว่างการเรียกซ้ำ`);
      if (new Set(t1).size !== t1.length) bad.push(`รอบ ${i}: key ซ้ำในรายการเดียว (${t1.join(',')})`);
    }
    assert.deepEqual(bad, []);
  });

  test('state ที่ยอดลอย: stamp เดียวกันทุกรายการ และไม่ขยับตามเวลา', () => {
    const rand = mulberry32(1122334455);
    let drifting = 0;
    const bad: string[] = [];
    for (let i = 0; i < ROUNDS; i++) {
      const s = randomState(rand);
      if (!amountsDrift(s)) continue;
      drifting++;
      const all = [...settleUp(s, ASOF), ...settleUp(s, ASOF + DAY)];
      if (all.length === 0) continue; // หารลงตัวพอดี ไม่มีรายการโอนให้ติ๊ก
      const stamps = new Set(all.map((t) => t.stamp));
      if (stamps.size !== 1 || stamps.has(undefined)) {
        bad.push(`รอบ ${i}: stamp ไม่นิ่ง (${[...stamps].join(',')})`);
      }
    }
    assert.deepEqual(bad, []);
    // ยืนยันว่าชุดข้อมูลสุ่มครอบเคส "ยอดลอย" จริง (ไม่ใช่ผ่านเพราะไม่เจอเคสเลย)
    assert.ok(drifting > 100, `เจอเคสยอดลอยแค่ ${drifting} เคส — ชุดข้อมูลไม่ครอบ`);
  });

  test('state ที่ยอดลอย: key ที่เวลาถัดไปต้องเป็นชุดย่อยของ key เดิมเสมอ (ไม่มี key ใหม่)', () => {
    // invariant ที่แข็งกว่าเดิม: เดิมล็อกได้แค่ "คู่ที่ยังอยู่ได้ key เดิม" (เพราะ greedy สลับคู่เอง)
    // วันนี้ล็อกได้ว่า **ไม่มี key ใหม่โผล่เลย** → ติ๊กเดิมครอบรายการที่เหลือได้ครบเสมอ
    // (key หายได้ตามปกติเมื่อ net ของคนนั้นลงตัวที่ 0 = ไม่ต้องโอนแล้วจริง)
    const rand = mulberry32(1122334455);
    const bad: string[] = [];
    for (let i = 0; i < ROUNDS; i++) {
      const s = randomState(rand);
      if (!amountsDrift(s)) continue;
      const before = new Set(settleUp(s, ASOF).map(transferKey));
      for (const k of settleUp(s, ASOF + DAY).map(transferKey)) {
        if (!before.has(k)) bad.push(`รอบ ${i}: key ใหม่ ${k} โผล่หลังเวลาเดินไป 1 วัน`);
      }
    }
    assert.deepEqual(bad, []);
  });

  /**
   * regression ของบั๊กชั้นที่สอง (แก้แล้วที่ src/domain/split.ts — settleUp โหมด star)
   *
   * เดิม settleUp เป็น greedy จับคู่จากลำดับ net balance ซึ่งลอยไปตามเวลาด้วย
   * เวลาเดินไปไม่กี่ชั่วโมง ลำดับสลับ/มีคนข้ามเส้นศูนย์ → **คู่โอนเปลี่ยนตัวคนเอง**
   * ทั้งที่ผู้ใช้ไม่ได้แก้ข้อมูลอะไร → ติ๊ก "โอนแล้ว" ของคู่ที่หายไปหลุด
   * → กล่อง "จ่ายครบทุกคนแล้ว" + ปุ่มปิดกลุ่มหายเอง (วัดได้ 133/1946 เคส ~6.8%)
   *
   * วันนี้ต้องเป็น 0 เคส ทั้งกลุ่มเล็ก (≤5 คน) และกลุ่มใหญ่ (≤10 คน)
   * ห้ามลด ROUNDS / ห้ามลดขอบเขตเพื่อให้เขียว — แดง = star หรือ hub เพี้ยน
   */
  for (const maxMembers of [5, 10]) {
    test(`state ที่ยอดลอย: ติ๊กครบแล้วยังครบเมื่อเวลาเดินไป 1 วัน (กลุ่มไม่เกิน ${maxMembers} คน)`, () => {
      const rand = mulberry32(1122334455);
      const bad: string[] = [];
      let drifting = 0;
      for (let i = 0; i < ROUNDS; i++) {
        const s = randomState(rand, maxMembers);
        if (!amountsDrift(s)) continue;
        drifting++;
        const ticked = settleUp(s, ASOF).map(transferKey);
        if (!nothingOwed(settleUp(s, ASOF + DAY), ticked)) {
          bad.push(`รอบ ${i}: ติ๊กหลุดหลังเวลาเดินไป 1 วัน`);
        }
      }
      assert.deepEqual(bad, []);
      assert.ok(drifting > 100, `เจอเคสยอดลอยแค่ ${drifting} เคส — ชุดข้อมูลไม่ครอบ`);
    });

    test(`state ที่ยอดลอย: โครงสร้างเป็นดาวรอบ hub เดียวทุกเคส (กลุ่มไม่เกิน ${maxMembers} คน)`, () => {
      const rand = mulberry32(1122334455);
      const bad: string[] = [];
      let checked = 0;
      for (let i = 0; i < ROUNDS; i++) {
        const s = randomState(rand, maxMembers);
        if (!amountsDrift(s)) continue;
        const t = settleUp(s, ASOF);
        if (t.length === 0) continue;
        checked++;
        const ids = new Set<string>();
        for (const x of t) {
          ids.add(x.fromId);
          ids.add(x.toId);
        }
        const hubs = [...ids].filter((h) => t.every((x) => x.fromId === h || x.toId === h));
        if (t.length >= 2 && hubs.length !== 1) {
          bad.push(`รอบ ${i}: hub ไม่ชัดเจน (${hubs.join(',')})`);
          continue;
        }
        const hub = hubs[0];
        const net = computeNetBalances(s, ASOF);
        // ดาวเป๊ะ: ทุกคนที่ net != 0 (นอกจาก hub) มีเส้นกับ hub เส้นเดียว ไม่มีเส้นอื่นเลย
        const expected = new Set(
          [...net.entries()]
            .filter(([id, v]) => id !== hub && cents(v) !== 0)
            .map(([id]) => [hub, id].sort().join('|')),
        );
        const pairs = t.map((x) => [x.fromId, x.toId].sort().join('|'));
        if (new Set(pairs).size !== pairs.length) bad.push(`รอบ ${i}: มีคู่ซ้ำ`);
        if (pairs.length !== expected.size || !pairs.every((p) => expected.has(p))) {
          bad.push(`รอบ ${i}: ไม่ใช่ดาวเป๊ะ (${pairs.join(',')})`);
        }
        if (t.some((x) => x.fromId === x.toId)) bad.push(`รอบ ${i}: โอนให้ตัวเอง`);
        if (t.some((x) => x.amount <= 0)) bad.push(`รอบ ${i}: ยอดโอน <= 0`);
      }
      assert.deepEqual(bad, []);
      assert.ok(checked > 100, `ตรวจได้แค่ ${checked} เคส — ชุดข้อมูลไม่ครอบ`);
    });

    /**
     * hub เลือกจาก **ข้อมูล** (เหตุการณ์ล่าสุดที่บันทึกไว้) ไม่ใช่จากยอดปัจจุบัน
     * → เวลาเดินไปนานแค่ไหน hub ต้องเป็นคนเดิม และ **ห้ามมีคู่คนใหม่โผล่**
     *
     * หมายเหตุที่ทำให้ invariant นี้ไม่ใช่ "ชุดคู่เท่ากันเป๊ะ": คู่ **หายไป** ได้ตามปกติ
     * เมื่อ net ของคนนั้นลอยมาลงตัวที่ 0 พอดี (ไม่ต้องโอนแล้วจริง ๆ) ซึ่งไม่ทำติ๊กหลุด
     * (nothingOwed มองแค่รายการที่เหลือ) — ที่อันตรายคือ **คู่ใหม่** ซึ่งต้องเป็น 0 เสมอ
     */
    test(`state ที่ยอดลอย: hub ไม่ขยับตาม asOf และไม่มีคู่คนใหม่โผล่ (กลุ่มไม่เกิน ${maxMembers} คน)`, () => {
      const rand = mulberry32(1122334455);
      const bad: string[] = [];
      let checked = 0;
      for (let i = 0; i < ROUNDS; i++) {
        const s = randomState(rand, maxMembers);
        if (!amountsDrift(s)) continue;
        const base = settleUp(s, ASOF);
        if (base.length === 0) continue;
        checked++;
        const baseHub = soleHub(base);
        const basePairs = new Set(base.map((x) => [x.fromId, x.toId].sort().join('|')));
        for (const gap of [HOUR, DAY, 30 * DAY, 365 * DAY]) {
          const t = settleUp(s, ASOF + gap);
          const hub = soleHub(t);
          if (baseHub && hub && hub !== baseHub) {
            bad.push(`รอบ ${i}: hub ขยับ ${baseHub} → ${hub} ที่ห่าง ${gap} ms`);
          }
          for (const x of t) {
            const pair = [x.fromId, x.toId].sort().join('|');
            if (!basePairs.has(pair)) {
              bad.push(`รอบ ${i}: คู่ใหม่ ${pair} โผล่ที่ห่าง ${gap} ms`);
            }
          }
        }
      }
      assert.deepEqual(bad, []);
      assert.ok(checked > 100, `ตรวจได้แค่ ${checked} เคส — ชุดข้อมูลไม่ครอบ`);
    });

    /**
     * คู่ที่ "หายไป" ตอนเวลาเดิน ต้องหายเพราะ **คนนั้นไม่มีหนี้แล้วจริง ๆ** (net = 0 พอดี)
     * ไม่ใช่เพราะการจับคู่สลับตัวคน — ถ้าหายโดยที่ net ยังไม่เป็น 0 คือเงินหาย
     */
    test(`state ที่ยอดลอย: คู่ที่หายไปต้องเป็นคนที่ net = 0 พอดี (กลุ่มไม่เกิน ${maxMembers} คน)`, () => {
      const rand = mulberry32(1122334455);
      const bad: string[] = [];
      for (let i = 0; i < ROUNDS; i++) {
        const s = randomState(rand, maxMembers);
        if (!amountsDrift(s)) continue;
        const base = settleUp(s, ASOF);
        if (base.length === 0) continue;
        for (const gap of [HOUR, DAY, 30 * DAY, 365 * DAY]) {
          const at = ASOF + gap;
          const t = settleUp(s, at);
          const pairs = new Set(t.map((x) => [x.fromId, x.toId].sort().join('|')));
          const net = computeNetBalances(s, at);
          for (const b of base) {
            if (pairs.has([b.fromId, b.toId].sort().join('|'))) continue;
            // คู่นี้หายไป → ต้องมีปลายด้านใดด้านหนึ่งที่ไม่มีหนี้เหลือแล้ว
            if (cents(net.get(b.fromId) ?? 0) !== 0 && cents(net.get(b.toId) ?? 0) !== 0) {
              bad.push(`รอบ ${i}: คู่ ${b.fromId}>${b.toId} หายที่ห่าง ${gap} ms แต่ทั้งคู่ยังมีหนี้`);
            }
          }
        }
      }
      assert.deepEqual(bad, []);
    });

    /**
     * ตาข่ายกันเงินหาย: ติ๊กครบตอนยอดลอย แล้วทุกคนกด "กลับแล้ว" (ปิดกลุ่ม)
     * ⇒ ยอดหยุดลอย → key ย้ายกลับไปแบบผูกยอด ⇒ ติ๊กชุดเดิม **ต้องเป็นโมฆะทั้งชุด**
     * ไม่ใช่ "หลุดบางส่วน" — ต้องไม่เหลือ key เดิมแม้ตัวเดียว ไม่งั้นสรุปจะโชว์ว่าโอนแล้วบางคน
     * ทั้งที่ยอดที่เห็นตอนนี้ยังไม่มีใครโอนตามนั้น
     */
    test(`ตาข่าย: ปิดกลุ่มแล้วติ๊กชุดเดิมเป็นโมฆะทั้งชุด ทุกเคส (กลุ่มไม่เกิน ${maxMembers} คน)`, () => {
      const rand = mulberry32(1122334455);
      const bad: string[] = [];
      let checked = 0;
      for (let i = 0; i < ROUNDS; i++) {
        const s = randomState(rand, maxMembers);
        if (!amountsDrift(s)) continue;
        const ticked = settleUp(s, ASOF).map(transferKey);
        if (ticked.length === 0) continue;
        // ทุกคนกด "กลับแล้ว" ที่เวลาเดียวกัน = ยอดปิดจริง
        const closed: AppState = {
          ...s,
          members: s.members.map((m) => ({ ...m, leftAt: m.leftAt ?? ASOF })),
        };
        if (amountsDrift(closed)) {
          bad.push(`รอบ ${i}: ปิดกลุ่มแล้วยอดยังลอย`);
          continue;
        }
        const after = settleUp(closed, ASOF);
        checked++;
        if (nothingOwed(after, ticked)) bad.push(`รอบ ${i}: ติ๊กเดิมยังนับว่าครบหลังปิดกลุ่ม`);
        if (pruneSettlements(after, ticked).length !== 0) {
          bad.push(`รอบ ${i}: ยังมี key เดิมเหลือรอดหลังปิดกลุ่ม`);
        }
      }
      assert.deepEqual(bad, []);
      assert.ok(checked > 100, `ตรวจได้แค่ ${checked} เคส — ชุดข้อมูลไม่ครอบ`);
    });

    /**
     * ต้นทุนของ star: อาจใช้รายการโอนมากกว่า greedy ในกลุ่มที่มีเจ้าหนี้หลายคน
     * ล็อกเพดานไว้ไม่ให้ถอยหลัง — วัดได้ +0.39% (≤5 คน) / +0.17% (≤10 คน), แย่ลงสุด +1 รายการ
     * ถ้าเทสนี้แดงเพราะเลขโตขึ้น = การจับคู่เพี้ยน (ไม่ใช่ star แล้ว) ต้องดูที่ split.ts
     */
    test(`ต้นทุน star: รายการโอนแพงกว่า greedy ไม่เกิน 2% และไม่เกิน +1 ต่อเคส (กลุ่มไม่เกิน ${maxMembers} คน)`, () => {
      const rand = mulberry32(1122334455);
      let starTotal = 0;
      let greedyTotal = 0;
      let worst = 0;
      const bad: string[] = [];
      for (let i = 0; i < ROUNDS; i++) {
        const s = randomState(rand, maxMembers);
        if (!amountsDrift(s)) continue;
        const star = settleUp(s, ASOF).length;
        const greedy = greedyTransferCount(s, ASOF);
        starTotal += star;
        greedyTotal += greedy;
        if (star - greedy > 1) bad.push(`รอบ ${i}: star ${star} vs greedy ${greedy}`);
        worst = Math.max(worst, star - greedy);
      }
      assert.deepEqual(bad, []);
      assert.ok(worst <= 1, `แย่ลงสุด +${worst} รายการ (เพดาน +1)`);
      assert.ok(greedyTotal > 0);
      const overhead = starTotal / greedyTotal - 1;
      assert.ok(overhead <= 0.02, `star แพงกว่า greedy ${(overhead * 100).toFixed(2)}% (เพดาน 2%)`);
    });
  }
});

describe('regression: ยอดลอย + เครื่องหมายพลิก → คู่คนต้องไม่เปลี่ยน (ติ๊กไม่หลุด)', () => {
  /**
   * เคสเล็กสุดของอาการเดิม: **ทิศทาง** การโอนพลิกเองเมื่อเวลาเดิน โดยผู้ใช้ไม่ได้แก้อะไร
   *
   * a ออกเงินบิลโหมด time (b มาสาย 1 ชม. และยังไม่กลับ), b ออกเงินบิล equal
   * ตอน 2 ชม. b ยังเป็นเจ้าหนี้ (a โอนให้ b) แต่เมื่อเวลาเดินไป ยอดที่ b ต้องรับผิดชอบ
   * ในบิล time เพิ่มขึ้นเรื่อย ๆ จนพลิกเป็นลูกหนี้ (b โอนให้ a)
   *
   * พฤติกรรมที่ถูก (ล็อกไว้ด้านล่าง): ยอดลอย → settleUp จับคู่แบบ **ดาว** รอบ hub ที่เลือกจาก
   * ข้อมูล ไม่ใช่จากยอดปัจจุบัน → **ชุดคู่คนเหมือนกันเป๊ะทั้งสองเวลา** (a|b, a|c, a|d)
   * เปลี่ยนแค่ทิศทางกับยอดที่แสดง ซึ่ง transferKey ไม่ผูกทั้งสองอย่าง → ติ๊กเดิมยังติด
   */
  const s = appState(
    [
      member('a', { arrivedAt: T0 }),
      member('b', { arrivedAt: T0 + HOUR }),
      member('c', { arrivedAt: T0, leftAt: T0 + HOUR }),
      member('d', { arrivedAt: T0, leftAt: T0 + HOUR }),
    ],
    [
      bill({ id: 'b1', splitMode: 'time', items: [item('เหล้า', 400)], paidById: 'a' }),
      bill({ id: 'b2', splitMode: 'equal', items: [item('ข้าว', 200)], paidById: 'b' }),
    ],
  );

  test('ทิศทาง b↔a พลิกเมื่อเวลาเดิน แต่ชุดคู่คนยังเป็นชุดเดิม', () => {
    const early = settleUp(s, T0 + 2 * HOUR);
    const late = settleUp(s, T0 + 6 * HOUR);
    assert.equal(early[0].stamp, late[0].stamp);
    // ตอน 2 ชม. b ยังเป็นเจ้าหนี้ (a โอนให้ b)
    assert.deepEqual(
      early.map((t) => `${t.fromId}>${t.toId}`),
      ['a>b', 'c>a', 'd>a'],
    );
    assert.deepEqual(early.map((t) => t.amount), [70, 130, 130]);
    // ตอน 6 ชม. b พลิกเป็นลูกหนี้ (b โอนให้ a) — คู่คนชุดเดิม แค่กลับทิศ
    assert.deepEqual(
      late.map((t) => `${t.fromId}>${t.toId}`),
      ['b>a', 'c>a', 'd>a'],
    );
    assert.deepEqual(late.map((t) => t.amount), [3.85, 80.77, 80.77]);
    // หัวใจของ regression นี้: ชุด "คู่คน" ต้องเหมือนกันเป๊ะทั้งสองเวลา
    const pairs = (ts: Transfer[]) =>
      ts.map((t) => [t.fromId, t.toId].sort().join('|')).sort();
    assert.deepEqual(pairs(early), pairs(late));
    assert.deepEqual(pairs(early), ['a|b', 'a|c', 'a|d']);
  });

  test('ยอดกับทิศเปลี่ยน แต่ key ของทุกรายการเหมือนเดิมเป๊ะ', () => {
    const early = settleUp(s, T0 + 2 * HOUR);
    const late = settleUp(s, T0 + 6 * HOUR);
    // ยอดเปลี่ยนจริง (ยืนยันว่านี่คือเคสยอดลอย ไม่ใช่ผ่านเพราะยอดนิ่ง)
    assert.notDeepEqual(early.map((t) => t.amount), late.map((t) => t.amount));
    assert.deepEqual([...late.map(transferKey)].sort(), [...early.map(transferKey)].sort());
  });

  test('ติ๊กครบตอน 2 ชม. → กล่อง "จ่ายครบทุกคนแล้ว" ยังอยู่ตอน 6 ชม. / 1 วัน / 30 วัน', () => {
    const ticked = settleUp(s, T0 + 2 * HOUR).map(transferKey);
    assert.equal(nothingOwed(settleUp(s, T0 + 2 * HOUR), ticked), true);
    // ไม่มีใครแก้ข้อมูล → ต้องยังครบ (เดิมเป็น false = ปุ่มปิดกลุ่มหายเอง)
    assert.equal(nothingOwed(settleUp(s, T0 + 6 * HOUR), ticked), true);
    for (const gap of [DAY, 30 * DAY, 365 * DAY]) {
      assert.equal(nothingOwed(settleUp(s, T0 + 2 * HOUR + gap), ticked), true, `ห่าง ${gap} ms`);
    }
  });

  test('pruneSettlements ไม่ตัดติ๊กชุดนี้ทิ้งตอนทิศพลิก', () => {
    const ticked = settleUp(s, T0 + 2 * HOUR).map(transferKey);
    const late = settleUp(s, T0 + 6 * HOUR);
    assert.deepEqual([...pruneSettlements(late, ticked)].sort(), [...ticked].sort());
  });
});

// ---------- โครงสร้าง "ดาว" ของ state ที่ยอดลอย (ประโยชน์ที่ได้จากการแก้) ----------

describe('settleUp โหมดยอดลอย: โครงสร้างต้องเป็นดาวรอบ hub เดียว', () => {
  /**
   * 5 คน มีเจ้าหนี้ 3 คน (a, c, e ออกเงินคนละบิล) + บิลโหมด time ที่ b/d ยังไม่กลับ
   * เคสนี้ greedy เดิมจะจับคู่ข้ามกันไปมาตามลำดับยอด — star ต้องให้ทุกคนมีเส้นเดียวกับ hub
   */
  const five = appState(
    [
      member('a', { arrivedAt: T0 }),
      member('b', { arrivedAt: T0 + HOUR }),
      member('c', { arrivedAt: T0, leftAt: T0 + 2 * HOUR }),
      member('d', { arrivedAt: T0 + 30 * 60_000 }),
      member('e', { arrivedAt: T0, leftAt: T0 + HOUR }),
    ],
    [
      bill({ id: 'b1', splitMode: 'time', items: [item('เหล้า', 1200)], paidById: 'a' }),
      bill({ id: 'b2', splitMode: 'equal', items: [item('ข้าว', 500)], paidById: 'c' }),
      bill({ id: 'b3', splitMode: 'itemized', items: [item('ของหวาน', 300, ['b', 'd'])], paidById: 'e' }),
    ],
  );

  /** id ที่เป็นปลายด้านหนึ่งของ **ทุก** รายการโอน (= hub); ต้องมีตัวเดียวเมื่อมีเส้น ≥ 2 */
  const hubsOf = (ts: Transfer[]): string[] => {
    const ids = new Set<string>();
    for (const t of ts) {
      ids.add(t.fromId);
      ids.add(t.toId);
    }
    return [...ids].filter((h) => ts.every((t) => t.fromId === h || t.toId === h)).sort();
  };

  test('ทุกรายการโอนมี hub เป็นปลายด้านหนึ่ง และ hub มีตัวเดียว', () => {
    const t = settleUp(five, T0 + 3 * HOUR);
    assert.ok(t.length >= 3, `ต้องมีรายการโอนหลายเส้น (ได้ ${t.length})`);
    assert.deepEqual(hubsOf(t), ['a']);
  });

  test('ไม่มีคู่ซ้ำ ไม่มีใครโอนให้ตัวเอง และทุกยอด > 0', () => {
    const t = settleUp(five, T0 + 3 * HOUR);
    const pairs = t.map((x) => [x.fromId, x.toId].sort().join('|'));
    assert.equal(new Set(pairs).size, pairs.length, 'มีคู่ซ้ำ = key ชนกันเอง');
    assert.ok(t.every((x) => x.fromId !== x.toId), 'มีคนโอนให้ตัวเอง');
    assert.ok(t.every((x) => x.amount > 0), 'มียอดโอน <= 0');
  });

  test('คนที่ net ไม่เป็น 0 ทุกคน (ที่ไม่ใช่ hub) มีเส้นกับ hub เส้นเดียวพอดี', () => {
    const at = T0 + 3 * HOUR;
    const t = settleUp(five, at);
    const net = computeNetBalances(five, at);
    const expected = [...net.entries()]
      .filter(([id, v]) => id !== 'a' && cents(v) !== 0)
      .map(([id]) => ['a', id].sort().join('|'))
      .sort();
    assert.deepEqual(t.map((x) => [x.fromId, x.toId].sort().join('|')).sort(), expected);
  });

  test('hub ไม่ขยับตาม asOf — ชั่วโมง/วัน/เดือน/ปี ได้ชุดคู่คนเดิมเป๊ะ', () => {
    const base = settleUp(five, T0 + 3 * HOUR);
    const basePairs = base.map((x) => [x.fromId, x.toId].sort().join('|')).sort();
    for (const gap of [HOUR, DAY, 30 * DAY, 365 * DAY]) {
      const t = settleUp(five, T0 + 3 * HOUR + gap);
      assert.deepEqual(hubsOf(t), ['a'], `hub ขยับที่ห่าง ${gap} ms`);
      assert.deepEqual(
        t.map((x) => [x.fromId, x.toId].sort().join('|')).sort(),
        basePairs,
        `คู่คนเปลี่ยนที่ห่าง ${gap} ms`,
      );
      assert.deepEqual([...t.map(transferKey)].sort(), [...base.map(transferKey)].sort());
    }
  });

  test('ยอดโอนของทุกคนตรงกับ net ของตัวเองเป๊ะ (เงินไม่หาย/ไม่งอกจากการทำ star)', () => {
    const at = T0 + 3 * HOUR;
    const t = settleUp(five, at);
    for (const [id, v] of computeNetBalances(five, at)) {
      const out = t.filter((x) => x.fromId === id).reduce((sum, x) => sum + cents(x.amount), 0);
      const inn = t.filter((x) => x.toId === id).reduce((sum, x) => sum + cents(x.amount), 0);
      assert.equal(inn - out, cents(v), `คน ${id} โอนสุทธิไม่ตรง net`);
    }
  });

  test('ยอดนิ่ง (ทุกคนกลับแล้ว) ไม่เป็นดาว — greedy เดิมยังทำงานตามเดิม', () => {
    // ยืนยันว่า star ใช้เฉพาะเคสยอดลอย ไม่ได้ไปเปลี่ยนพฤติกรรมของ state ปกติ (ADR 0003)
    const closed: AppState = {
      ...five,
      members: five.members.map((m) => ({ ...m, leftAt: m.leftAt ?? T0 + 6 * HOUR })),
    };
    assert.equal(amountsDrift(closed), false);
    const t = settleUp(closed, T0 + 6 * HOUR);
    assert.ok(t.every((x) => x.stamp === undefined), 'ยอดนิ่งต้องไม่ติด stamp');
    // b โอนให้หลายคน (a, c, e) = ไม่ใช่โครงสร้างดาวรอบคนเดียว
    assert.deepEqual(hubsOf(t), []);
  });
});

// ---------- ตาข่ายกันเงินหาย: ปิดกลุ่ม = ต้องติ๊กใหม่บนยอดปิดจริง ----------

describe('ตาข่ายกันเงินหาย: ยอดหยุดลอย → ติ๊กชุดเดิมเป็นโมฆะทั้งชุด', () => {
  /**
   * เคสที่อันตรายที่สุดถ้าพลาด: ผู้ใช้ติ๊กครบตอนยอดยังลอย (ยอดยัง "ไม่ใช่ยอดจริง" เพราะคนยังนั่งอยู่)
   * แล้วทุกคนกด "กลับแล้ว" → ยอดปิดจริงต่างจากตอนติ๊ก → key ย้ายจากแบบ stamp กลับไปแบบผูกยอด
   * ⇒ ติ๊กเดิม **ต้องเป็นโมฆะทั้งชุด** ไม่งั้นกล่อง "จ่ายครบทุกคนแล้ว" ปลดล็อกปุ่มปิดกลุ่ม
   * ทั้งที่ยอดที่ทุกคนเห็นตอนนี้ยังไม่มีใครโอน = เงินหายจริง
   */
  const T1 = T0 + 2 * HOUR;

  test('2 คน: ติ๊กตอนยอดลอย แล้วทุกคนกลับ → key เดิมไม่ match เลย', () => {
    const ticked = settleUp(driftingState(), T1).map(transferKey);
    const closed: AppState = {
      ...driftingState(),
      members: driftingState().members.map((m) => ({ ...m, leftAt: m.leftAt ?? T1 })),
    };
    const after = settleUp(closed, T1);
    assert.ok(after.length > 0, 'ปิดกลุ่มแล้วยังต้องมีรายการโอนค้าง (ไม่งั้นเทสไม่มีความหมาย)');
    assert.equal(amountsDrift(closed), false);
    assert.equal(nothingOwed(after, ticked), false);
    assert.deepEqual(pruneSettlements(after, ticked), []);
    // key ใหม่ต้องเป็นแบบผูกยอด (ADR 0003) ไม่ใช่แบบ stamp
    assert.ok(after.every((t) => t.stamp === undefined));
    assert.ok(after.every((t) => transferKey(t).includes('>')));
  });

  test('5 คน หลายเจ้าหนี้: ติ๊กตอนยอดลอย แล้วทุกคนกลับ → เป็นโมฆะทั้งชุด', () => {
    const five = appState(
      [
        member('a', { arrivedAt: T0 }),
        member('b', { arrivedAt: T0 + HOUR }),
        member('c', { arrivedAt: T0, leftAt: T0 + 2 * HOUR }),
        member('d', { arrivedAt: T0 + 30 * 60_000 }),
        member('e', { arrivedAt: T0, leftAt: T0 + HOUR }),
      ],
      [
        bill({ id: 'b1', splitMode: 'time', items: [item('เหล้า', 1200)], paidById: 'a' }),
        bill({ id: 'b2', splitMode: 'equal', items: [item('ข้าว', 500)], paidById: 'c' }),
        bill({ id: 'b3', splitMode: 'itemized', items: [item('ของหวาน', 300, ['b', 'd'])], paidById: 'e' }),
      ],
    );
    const ticked = settleUp(five, T0 + 3 * HOUR).map(transferKey);
    assert.equal(ticked.length, 4);
    const closed: AppState = {
      ...five,
      members: five.members.map((m) => ({ ...m, leftAt: m.leftAt ?? T0 + 6 * HOUR })),
    };
    const after = settleUp(closed, T0 + 6 * HOUR);
    assert.ok(after.length > 0);
    assert.equal(nothingOwed(after, ticked), false);
    assert.deepEqual(pruneSettlements(after, ticked), []);
  });

  test('ปิดกลุ่มแล้วติ๊กใหม่บนยอดจริง → ครบแล้วนิ่งจริง (ยอดไม่ลอยอีก)', () => {
    const closed: AppState = {
      ...driftingState(),
      members: driftingState().members.map((m) => ({ ...m, leftAt: m.leftAt ?? T1 })),
    };
    const after = settleUp(closed, T1);
    const reTicked = after.map(transferKey);
    assert.equal(nothingOwed(after, reTicked), true);
    // ยอดนิ่งแล้ว เวลาเดินต่อไปก็ไม่กระทบ
    for (const gap of [HOUR, DAY, 30 * DAY]) {
      assert.equal(nothingOwed(settleUp(closed, T1 + gap), reTicked), true, `ห่าง ${gap} ms`);
    }
  });
});

// ---------- ลำดับแถวสมาชิกต้องไม่เปลี่ยนผลลัพธ์ ----------

/**
 * ผลการหารต้องขึ้นกับ **ข้อมูล** ไม่ใช่ "ลำดับที่สมาชิกเรียงอยู่ใน array"
 * สองเครื่องที่มีข้อมูลเหมือนกันเป๊ะแต่ได้ member มาคนละลำดับ ต้องเห็นยอด/คู่โอน/key เหมือนกัน
 * ไม่งั้นคนหนึ่งติ๊ก "โอนแล้ว" แต่อีกคนเห็นเป็น "ยังไม่โอน" = เถียงกันว่าโอนแล้วหรือยัง
 *
 * เคสนี้เกิดได้จริงในโหมดกลุ่ม: src/data/remote.ts:153 ดึง members โดย **ไม่มี** .order()
 * (ต่างจาก bills:154 / bill_items:155 ที่สั่ง order ไว้) → ลำดับแถวจาก Postgres ไม่การันตี
 */
describe('ลำดับแถวสมาชิกต้องไม่กระทบผลลัพธ์ (สองเครื่องต้องเห็นเหมือนกัน)', () => {
  const ASOF = T0 + 4 * HOUR;
  const keysOf = (s: AppState, at: number) => [...settleUp(s, at).map(transferKey)].sort();
  const reversed = (s: AppState): AppState => ({ ...s, members: [...s.members].reverse() });

  test(
    'ยอดต่อคนไม่ขึ้นกับลำดับแถว (3 คนหาร 100 — เศษ 1 สตางค์ต้องตกที่คนเดิม)',
    {
      todo:
        'บั๊กจริงใน src/domain/split.ts:291-296 — tiebreak สุดท้ายของ largestRemainder ใช้ ' +
        '`a.index - b.index` (ลำดับแถวใน array) จึงย้ายเศษ 1 สตางค์ไปตกคนอื่นเมื่อลำดับแถวเปลี่ยน ' +
        '(กลับลำดับ a,b,c → c,b,a ได้ b:33.33 c:33.34 แทน b:33.34 c:33.33). ' +
        'ควรใช้ byCode(a.id, b.id) เป็น tiebreak สุดท้ายแทน — ดูรายละเอียดในเทสถัดไป',
    },
    () => {
      const s = appState(
        [member('a'), member('b'), member('c')],
        [bill({ items: [item('x', 100)], paidById: 'a' })],
      );
      assert.deepEqual(shares(computeBill(s.bills[0], s.members, ASOF).perMember), {
        a: 33.33,
        b: 33.34,
        c: 33.33,
      });
      // กลับลำดับ → ยอดของแต่ละ "คน" ต้องเท่าเดิม (ไม่ใช่เศษย้ายไปตกคนอื่น)
      assert.deepEqual(
        shares(computeBill(s.bills[0], reversed(s).members, ASOF).perMember),
        shares(computeBill(s.bills[0], s.members, ASOF).perMember),
      );
    },
  );

  test(
    'ยอดลอย: กลับลำดับแถวสมาชิกแล้ว hub/คู่โอนต้องไม่เปลี่ยน (ติ๊กเดิมต้องไม่หลุด)',
    {
      todo:
        'บั๊กจริงใน src/domain/split.ts:291-296 — largestRemainder ตัดสินตอนเศษเสมอกันด้วย ' +
        '`a.index - b.index` (ลำดับแถวใน array) ทำให้ net ต่างกัน 1 สตางค์ตามลำดับแถว ' +
        '→ settleHub (:505) เลือกเจ้าหนี้รายใหญ่ผิดตัว → คู่โอนเปลี่ยน → key ไม่ match. ' +
        'ควรเปลี่ยน tiebreak สุดท้ายเป็น byCode(a.id, b.id) แทน index (ขัดกับคอมเมนต์ :503 ' +
        'ที่บอกว่า "ยอดเท่ากัน -> เรียงด้วยรหัสสมาชิก เพื่อให้ผลเหมือนกันทุกเครื่อง" อยู่แล้ว). ' +
        'ผลข้างเคียงที่ควรแก้ควบ: src/data/remote.ts:153 ควรใส่ .order() ให้ members. ' +
        'ความถี่ที่วัดได้ (seed 20240915, 4000 เคส/ขนาด): ยอดลอย 9/944 เคส (≤5 คน), ' +
        '19/1158 (≤10 คน) ที่ติ๊กหลุด; โหมดยอดนิ่งเดิมต่างกัน 350/3056 และ 676/2842 (มาก่อนแล้ว) ' +
        'แก้ที่ split.ts เท่านั้น อยู่นอกขอบเขต tests/**',
    },
    () => {
      // ทำซ้ำได้เป๊ะ: 3 คน, บิล time ฿100.01 (b ออก) + บิล equal ฿100 (c ออก)
      // net ณ เวลาอ้างอิงของข้อมูล: b = 33.34, c = 33.33 → ต่างกัน 1 สตางค์จากการเกลี่ยเศษ
      const s = appState(
        [member('a', { arrivedAt: T0 }), member('b', { arrivedAt: T0 }), member('c', { arrivedAt: T0 })],
        [
          bill({ id: 'b1', splitMode: 'time', items: [item('เหล้า', 100.01)], paidById: 'b' }),
          bill({ id: 'b2', splitMode: 'equal', items: [item('ข้าว', 100)], paidById: 'c' }),
        ],
      );
      assert.equal(amountsDrift(s), true);
      assert.equal(amountsDrift(reversed(s)), true);

      // ยอดรวมต่อคนต้องเท่ากันทั้งสองลำดับ (ถ้าข้อนี้แดง = เกลี่ยเศษขึ้นกับลำดับแถว)
      const netOf = (x: AppState) =>
        [...computeNetBalances(x, ASOF).entries()].sort().map(([id, v]) => `${id}:${v}`);
      assert.deepEqual(netOf(reversed(s)), netOf(s));

      // และคู่โอน/key ต้องเหมือนกัน → ติ๊กจากเครื่องหนึ่งใช้ได้กับอีกเครื่อง
      assert.deepEqual(keysOf(reversed(s), ASOF), keysOf(s, ASOF));
      const ticked = keysOf(s, ASOF);
      assert.equal(nothingOwed(settleUp(reversed(s), ASOF), ticked), true);
    },
  );

  test('ยอดลอย: อย่างน้อย stamp ต้องไม่ขึ้นกับลำดับแถว (ลายนิ้วมือข้อมูลเรียงก่อน hash)', () => {
    // ส่วนนี้ถูกต้องอยู่แล้ว (splitStamp เรียง parts ก่อน hash) — ล็อกไว้ไม่ให้ถอยหลัง
    const s = appState(
      [member('a', { arrivedAt: T0 }), member('b', { arrivedAt: T0 }), member('c', { arrivedAt: T0 })],
      [
        bill({ id: 'b1', splitMode: 'time', items: [item('เหล้า', 100.01)], paidById: 'b' }),
        bill({ id: 'b2', splitMode: 'equal', items: [item('ข้าว', 100)], paidById: 'c' }),
      ],
    );
    const stampOf = (x: AppState) => [...new Set(settleUp(x, ASOF).map((t) => t.stamp))];
    assert.equal(stampOf(s).length, 1);
    assert.deepEqual(stampOf(reversed(s)), stampOf(s));
  });
});

// ---------- เคสปัดเศษที่ระบุชัด (จับ regression ตรงจุด อ่านง่ายกว่า fuzz) ----------

describe('computeBill: เคสปัดเศษเฉพาะจุด', () => {
  test('ราคามีเศษต่ำกว่าสตางค์ (11/3) → ยอดรวมและยอดต่อคนลงตัวเป็นสตางค์', () => {
    const b = bill({ items: [item('x', 11 / 3)], paidById: 'a' });
    const bd = computeBill(b, [member('a'), member('b'), member('c')], T0);
    assert.equal(bd.total, 3.67);
    // เศษ 1 สตางค์ต้องไม่ตกที่คนออกเงิน (a ได้ยอดตรงสัดส่วน)
    assert.deepEqual(shares(bd.perMember), { a: 1.22, b: 1.23, c: 1.22 });
    const sum = [...bd.perMember.values()].reduce((x, v) => x + cents(v), 0);
    assert.equal(sum, cents(bd.total));
  });

  test('ส่วนลดมากกว่ายอดเมนู → ยอดรวมติดลบ แต่ผลรวมยอดต่อคนยังตรง', () => {
    const b = bill({ items: [item('x', 100)], discount: 250, paidById: 'a' });
    const bd = computeBill(b, [member('a'), member('b')], T0);
    assert.equal(bd.total, -150);
    assert.deepEqual(shares(bd.perMember), { a: -75, b: -75 });
  });

  test('เมนูราคาติดลบมีเศษ (-30.005) → ผลรวมยอดต่อคนยังเท่ายอดรวม', () => {
    const b = bill({ items: [item('x', 100), item('y', -30.005)], paidById: 'a' });
    const bd = computeBill(b, [member('a'), member('b'), member('c')], T0);
    const sum = [...bd.perMember.values()].reduce((x, v) => x + cents(v), 0);
    assert.equal(sum, cents(bd.total));
  });

  test('service+vat มีเศษ (subtotal 3.333%) → ผลรวมยอดต่อคนยังเท่ายอดรวม', () => {
    const b = bill({
      items: [item('x', 333.33)],
      serviceChargePct: 3.333,
      vatPct: 7,
      paidById: 'a',
    });
    const bd = computeBill(b, [member('a'), member('b'), member('c')], T0);
    const sum = [...bd.perMember.values()].reduce((x, v) => x + cents(v), 0);
    assert.equal(sum, cents(bd.total));
  });

  test('computeTotals หลายบิลเศษเยอะ → ผลรวมคอลัมน์ต่อคน = grandTotal', () => {
    const s = appState(
      [member('a'), member('b'), member('c')],
      [
        bill({ id: 'b1', items: [item('x', 100 / 3)], paidById: 'a', vatPct: 7 }),
        bill({ id: 'b2', items: [item('y', 1000 / 7)], paidById: 'b', serviceChargePct: 10 }),
        bill({ id: 'b3', items: [item('z', 0.01)], paidById: 'c' }),
      ],
    );
    const { perMember, grandTotal } = computeTotals(s, T0);
    const sum = [...perMember.values()].reduce((x, v) => x + cents(v), 0);
    assert.equal(sum, cents(grandTotal));
  });
});
