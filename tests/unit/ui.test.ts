import assert from 'node:assert/strict';
import { afterEach, describe, mock, test } from 'node:test';
import {
  baht,
  confirmAction,
  confirmRemove,
  copyText,
  digitsOnly,
  formatPromptPay,
  friendlyError,
  isValidPromptPay,
  notify,
  timeStr,
} from '../../src/ui';

/**
 * เทส helper ใน src/ui/index.ts บน node (Platform.OS = 'web' จาก stub ใน tests/unit/stubs/)
 * ทำไมเทสที่นี่ ไม่ใช่ E2E: helper พวกนี้เป็นฟังก์ชันบริสุทธิ์/แตะ browser API ตรง ๆ
 * (baht(-0), friendlyError, confirmAction) — E2E ยิงได้แค่ผลลัพธ์ทางอ้อมบนจอ
 * เคสขอบอย่าง "-฿0.00 ต้องไม่โผล่" (baht(-0)) ต้องเทสที่ตัวฟังก์ชันจึงครอบได้ครบ
 */

// ---------- baht ----------

describe('baht', () => {
  test('จัดรูปเงินบาท 2 ตำแหน่งพร้อมสัญลักษณ์', () => {
    assert.equal(baht(0), '฿0.00');
    assert.equal(baht(50), '฿50.00');
    assert.equal(baht(1234.5), '฿1,234.50');
  });

  test('ปัด 2 ตำแหน่ง', () => {
    assert.equal(baht(33.333), '฿33.33');
    assert.equal(baht(33.335), '฿33.34');
  });

  test('ค่าติดลบจิ๋วที่ปัดแล้วเป็น 0 ต้องไม่โชว์ -฿0.00', () => {
    assert.equal(baht(-0), '฿0.00');
    assert.equal(baht(-0.001), '฿0.00');
    assert.equal(baht(-0.004), '฿0.00');
    // ต้องไม่มีเครื่องหมายลบติดมาเลย
    assert.ok(!baht(-0.001).includes('-'));
    assert.ok(!baht(-0).includes('-'));
  });

  test('ค่าติดลบจริงโชว์เครื่องหมายลบไว้หน้าสัญลักษณ์เงิน', () => {
    // ธรรมเนียมการเขียนจำนวนเงินติดลบ: ลบมาก่อนสัญลักษณ์ ('-฿50.00' ไม่ใช่ '฿-50.00')
    assert.equal(baht(-50), '-฿50.00');
    assert.equal(baht(-1234.5), '-฿1,234.50');
    assert.equal(baht(-0.01), '-฿0.01');
    // ลบต้องอยู่ตัวแรกสุดเสมอ ไม่ใช่แทรกกลาง
    assert.ok(baht(-0.01).startsWith('-฿'));
  });
});

// ---------- timeStr ----------

describe('timeStr', () => {
  test('null / 0 → ขีด', () => {
    assert.equal(timeStr(null), '-');
    assert.equal(timeStr(0), '-');
  });

  test('epoch ms → เวลา ชม:นาที', () => {
    const out = timeStr(Date.UTC(2024, 0, 1, 5, 30));
    assert.match(out, /^\d{2}:\d{2}$/);
  });
});

// ---------- friendlyError ----------

describe('friendlyError', () => {
  test('error ภาษาไทย (เขียนให้ผู้ใช้อ่านแล้ว) → ใช้ข้อความนั้นตรง ๆ', () => {
    const e = new Error('ชื่อนี้มีคนเลือกไปแล้ว เลือกชื่ออื่นหรือเพิ่มชื่อใหม่');
    assert.equal(
      friendlyError(e, 'ลองใหม่อีกครั้ง'),
      'ชื่อนี้มีคนเลือกไปแล้ว เลือกชื่ออื่นหรือเพิ่มชื่อใหม่',
    );
  });

  test('error ภาษาอังกฤษเชิงเทคนิค → fallback ไทย + รายละเอียดในวงเล็บ', () => {
    assert.equal(
      friendlyError(new Error('Failed to fetch'), 'ลองใหม่อีกครั้ง'),
      'ลองใหม่อีกครั้ง (Failed to fetch)',
    );
  });

  test('ไม่มีข้อความเลย → fallback ล้วน', () => {
    assert.equal(friendlyError(new Error(''), 'ลองใหม่'), 'ลองใหม่');
    assert.equal(friendlyError(null, 'ลองใหม่'), 'ลองใหม่');
    assert.equal(friendlyError(undefined, 'ลองใหม่'), 'ลองใหม่');
    assert.equal(friendlyError({}, 'ลองใหม่'), 'ลองใหม่');
    assert.equal(friendlyError('   ', 'ลองใหม่'), 'ลองใหม่');
  });

  test('รับ string ตรง ๆ ได้', () => {
    assert.equal(friendlyError('boom', 'ลองใหม่'), 'ลองใหม่ (boom)');
    assert.equal(friendlyError('พลาดแล้ว', 'ลองใหม่'), 'พลาดแล้ว');
  });

  test('error ของ Supabase (object ที่มี message) ก็รองรับ', () => {
    assert.equal(
      friendlyError({ message: 'duplicate key value' }, 'บันทึกไม่สำเร็จ'),
      'บันทึกไม่สำเร็จ (duplicate key value)',
    );
  });

  test('message ที่ไม่ใช่ string ถือว่าไม่มีข้อความ', () => {
    assert.equal(friendlyError({ message: 500 }, 'ลองใหม่'), 'ลองใหม่');
  });
});

// ---------- digitsOnly / isValidPromptPay / formatPromptPay ----------

describe('digitsOnly', () => {
  test('เหลือเฉพาะตัวเลข', () => {
    assert.equal(digitsOnly('081-234-5678'), '0812345678');
    assert.equal(digitsOnly(' 08 1234 5678 '), '0812345678');
    assert.equal(digitsOnly('abc'), '');
  });
});

describe('isValidPromptPay', () => {
  test('ว่าง/null = ไม่ระบุ ถือว่าใช้ได้', () => {
    assert.equal(isValidPromptPay(null), true);
    assert.equal(isValidPromptPay(undefined), true);
    assert.equal(isValidPromptPay(''), true);
  });

  test('เบอร์มือถือ 10 หลัก หรือเลขบัตร 13 หลัก = ใช้ได้', () => {
    assert.equal(isValidPromptPay('0812345678'), true);
    assert.equal(isValidPromptPay('081-234-5678'), true);
    assert.equal(isValidPromptPay('1234567890123'), true);
  });

  test('จำนวนหลักอื่น = ใช้ไม่ได้', () => {
    assert.equal(isValidPromptPay('123'), false);
    assert.equal(isValidPromptPay('081234567'), false);
    assert.equal(isValidPromptPay('12345678901'), false);
  });
});

describe('formatPromptPay', () => {
  test('เบอร์ 10 หลัก → 0XX-XXX-XXXX', () => {
    assert.equal(formatPromptPay('0812345678'), '081-234-5678');
  });

  test('เลขบัตร 13 หลัก → X-XXXX-XXXXX-XX-X', () => {
    assert.equal(formatPromptPay('1234567890123'), '1-2345-67890-12-3');
  });

  test('ว่าง → string ว่าง', () => {
    assert.equal(formatPromptPay(null), '');
    assert.equal(formatPromptPay(''), '');
  });

  test('จำนวนหลักไม่เข้าเกณฑ์ → คืนเฉพาะตัวเลขที่เหลือ', () => {
    assert.equal(formatPromptPay('12-34'), '1234');
  });
});

// ---------- copyText (web path) ----------

describe('copyText', () => {
  // node 24 มี globalThis.navigator เป็น getter-only → ต้องใช้ defineProperty ทับ
  const setNavigator = (value: unknown) => {
    Object.defineProperty(globalThis, 'navigator', {
      value,
      configurable: true,
      writable: true,
    });
  };

  afterEach(() => {
    setNavigator(undefined);
  });

  test('ใช้ navigator.clipboard ได้ → คืน true', async () => {
    const writeText = mock.fn(async (_t: string) => {});
    setNavigator({ clipboard: { writeText } });
    assert.equal(await copyText('0812345678'), true);
    assert.equal(writeText.mock.callCount(), 1);
    assert.equal(writeText.mock.calls[0].arguments[0], '0812345678');
  });

  test('navigator.clipboard พลาด → ถอยไป expo-clipboard (stub คืนสำเร็จ)', async () => {
    const writeText = mock.fn(async (_t: string) => {
      throw new Error('not a secure context');
    });
    setNavigator({ clipboard: { writeText } });
    // ไม่ throw ออกมา และยังคัดลอกได้ผ่านทางสำรอง
    assert.equal(await copyText('abc'), true);
    assert.equal(writeText.mock.callCount(), 1);
  });

  test('ไม่มี navigator.clipboard เลย → ถอยไป expo-clipboard', async () => {
    setNavigator({});
    assert.equal(await copyText('abc'), true);
  });
});

// ---------- notify / confirmAction (web path ใช้ window) ----------

/** ติดตั้ง window ปลอมสำหรับเทส (web path ของ notify/confirmAction) */
function withWindow<T>(win: Record<string, unknown>, fn: () => T): T {
  const g = globalThis as { window?: unknown };
  const had = 'window' in g;
  const prev = g.window;
  g.window = win;
  try {
    return fn();
  } finally {
    if (had) g.window = prev;
    else delete g.window;
  }
}

describe('notify (web)', () => {
  test('มีข้อความประกอบ → รวมหัวข้อกับข้อความด้วยขึ้นบรรทัดใหม่', () => {
    const alert = mock.fn((_m: string) => {});
    withWindow({ alert }, () => notify('คัดลอกแล้ว', 'พร้อมเพย์ของ แดง'));
    assert.equal(alert.mock.callCount(), 1);
    assert.equal(alert.mock.calls[0].arguments[0], 'คัดลอกแล้ว\nพร้อมเพย์ของ แดง');
  });

  test('ไม่มีข้อความประกอบ → หัวข้อล้วน', () => {
    const alert = mock.fn((_m: string) => {});
    withWindow({ alert }, () => notify('บันทึกแล้ว'));
    assert.equal(alert.mock.calls[0].arguments[0], 'บันทึกแล้ว');
  });
});

describe('confirmAction (web)', () => {
  test('ผู้ใช้ยืนยัน → เรียก onConfirm', () => {
    const onConfirm = mock.fn();
    const confirm = mock.fn((_m: string) => true);
    withWindow({ confirm }, () =>
      confirmAction({ title: 'ลบถาวร?', message: 'กู้คืนไม่ได้', onConfirm }),
    );
    assert.equal(onConfirm.mock.callCount(), 1);
    // ข้อความที่ผู้ใช้เห็น = หัวข้อ + รายละเอียด
    assert.equal(confirm.mock.calls[0].arguments[0], 'ลบถาวร?\nกู้คืนไม่ได้');
  });

  test('ผู้ใช้ยกเลิก → ไม่เรียก onConfirm (ของไม่ถูกลบ)', () => {
    const onConfirm = mock.fn();
    withWindow({ confirm: () => false }, () =>
      confirmAction({ title: 'ลบถาวร?', message: 'กู้คืนไม่ได้', onConfirm }),
    );
    assert.equal(onConfirm.mock.callCount(), 0);
  });
});

describe('confirmRemove (web)', () => {
  test('ถามชื่อสิ่งที่จะลบ แล้วเรียก onConfirm เมื่อยืนยัน', () => {
    const onConfirm = mock.fn();
    const confirm = mock.fn((_m: string) => true);
    withWindow({ confirm }, () => confirmRemove('แดง', onConfirm));
    assert.equal(onConfirm.mock.callCount(), 1);
    assert.match(confirm.mock.calls[0].arguments[0], /ยืนยันการลบ/);
    assert.match(confirm.mock.calls[0].arguments[0], /แดง/);
  });

  test('ยกเลิก → ไม่ลบ', () => {
    const onConfirm = mock.fn();
    withWindow({ confirm: () => false }, () => confirmRemove('แดง', onConfirm));
    assert.equal(onConfirm.mock.callCount(), 0);
  });
});
