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
import { setPopupListener, PopupRequest } from '../../src/ui/popup';

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

// ---------- notify / confirmAction (ยิงผ่านบัส popup ไปให้ <PopupHost/>) ----------

/**
 * ดักคำสั่ง popup ระหว่างเรียก fn แล้วคืนคำสั่งที่ถูกยิง
 * (notify/confirmAction ไม่แตะ window แล้ว — ยิง showPopup ผ่านบัสใน src/ui/popup.ts)
 */
function capturePopups<T>(fn: () => T): { requests: PopupRequest[]; ret: T } {
  const requests: PopupRequest[] = [];
  const off = setPopupListener((req) => requests.push(req));
  try {
    const ret = fn();
    return { requests, ret };
  } finally {
    off();
  }
}

describe('notify (popup)', () => {
  test('มีข้อความประกอบ → title + message แยกกัน + ปุ่ม "ตกลง"', () => {
    const { requests } = capturePopups(() => notify('คัดลอกแล้ว', 'พร้อมเพย์ของ แดง'));
    assert.equal(requests.length, 1);
    assert.equal(requests[0].title, 'คัดลอกแล้ว');
    assert.equal(requests[0].message, 'พร้อมเพย์ของ แดง');
    assert.equal(requests[0].buttons.length, 1);
    assert.equal(requests[0].buttons[0].text, 'ตกลง');
  });

  test('ไม่มีข้อความประกอบ → มีแต่ title', () => {
    const { requests } = capturePopups(() => notify('บันทึกแล้ว'));
    assert.equal(requests[0].title, 'บันทึกแล้ว');
    assert.equal(requests[0].message, undefined);
  });
});

describe('confirmAction (popup)', () => {
  test('กดปุ่มยืนยัน → เรียก onConfirm', () => {
    const onConfirm = mock.fn();
    const { requests } = capturePopups(() =>
      confirmAction({ title: 'ลบถาวร?', message: 'กู้คืนไม่ได้', onConfirm }),
    );
    assert.equal(requests.length, 1);
    assert.equal(requests[0].title, 'ลบถาวร?');
    assert.equal(requests[0].message, 'กู้คืนไม่ได้');
    // ปุ่มยืนยัน (destructive) กับปุ่มยกเลิก (cancel)
    const confirmBtn = requests[0].buttons.find((b) => b.style === 'destructive');
    const cancelBtn = requests[0].buttons.find((b) => b.style === 'cancel');
    assert.ok(confirmBtn);
    assert.ok(cancelBtn);
    // กดยืนยัน → onConfirm ทำงาน
    confirmBtn!.onPress?.();
    assert.equal(onConfirm.mock.callCount(), 1);
  });

  test('กดปุ่มยกเลิก → ไม่เรียก onConfirm (ของไม่ถูกลบ)', () => {
    const onConfirm = mock.fn();
    const { requests } = capturePopups(() =>
      confirmAction({ title: 'ลบถาวร?', message: 'กู้คืนไม่ได้', onConfirm }),
    );
    const cancelBtn = requests[0].buttons.find((b) => b.style === 'cancel');
    cancelBtn!.onPress?.();
    assert.equal(onConfirm.mock.callCount(), 0);
  });
});

describe('confirmRemove (popup)', () => {
  test('ถามชื่อสิ่งที่จะลบ แล้วเรียก onConfirm เมื่อยืนยัน', () => {
    const onConfirm = mock.fn();
    const { requests } = capturePopups(() => confirmRemove('แดง', onConfirm));
    assert.match(requests[0].title, /ยืนยันการลบ/);
    assert.match(requests[0].message ?? '', /แดง/);
    requests[0].buttons.find((b) => b.style === 'destructive')!.onPress?.();
    assert.equal(onConfirm.mock.callCount(), 1);
  });

  test('ยกเลิก → ไม่ลบ', () => {
    const onConfirm = mock.fn();
    const { requests } = capturePopups(() => confirmRemove('แดง', onConfirm));
    requests[0].buttons.find((b) => b.style === 'cancel')!.onPress?.();
    assert.equal(onConfirm.mock.callCount(), 0);
  });
});
