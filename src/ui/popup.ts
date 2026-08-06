// บัสสั่งเปิด popup แบบ imperative — ตัวเชื่อมระหว่าง helper ที่เรียกได้จากทุกที่
// (notify/confirmAction ใน ./index.ts) กับ <PopupHost/> ที่ mount ไว้ครั้งเดียวใน _layout
//
// ทำไมต้องมีบัส: notify()/confirmAction() ถูกเรียกแบบ imperative จากใน callback
// (กดปุ่มแล้วค่อยเรียก) ไม่ได้ถูก render เป็น component ⇒ ต้องมีทางส่ง "คำสั่งเปิด"
// ไปให้ component ที่ mount อยู่แล้ว. ไฟล์นี้ pure (ไม่ import react/native/store)
// เพื่อให้ ./index.ts ที่ import มา ยังคง pure เท่าเดิม (unit test ไม่ลาก native module)

/** สไตล์ปุ่มใน popup — ตรงกับ Alert.alert เดิมเพื่อคง semantic (cancel/destructive) */
export type PopupButtonStyle = 'default' | 'cancel' | 'destructive';

export type PopupButton = {
  text: string;
  style?: PopupButtonStyle;
  onPress?: () => void;
};

/** คำสั่งเปิด popup หนึ่งครั้ง */
export type PopupRequest = {
  title: string;
  message?: string;
  buttons: PopupButton[];
};

type Listener = (req: PopupRequest) => void;

// ผู้ฟังปัจจุบัน (คือ <PopupHost/>) — มีได้ตัวเดียว
let listener: Listener | null = null;
// คิวคำสั่งที่มาก่อน host จะ mount (กันหลุดในจังหวะแรกของแอป)
const pending: PopupRequest[] = [];

/** <PopupHost/> เรียกตอน mount เพื่อรับคำสั่ง (คืน unsubscribe) */
export function setPopupListener(fn: Listener | null): () => void {
  listener = fn;
  // ระบายคำสั่งที่ค้างคิวไว้ก่อน host พร้อม
  if (fn && pending.length) {
    const queued = pending.splice(0, pending.length);
    for (const req of queued) fn(req);
  }
  return () => {
    if (listener === fn) listener = null;
  };
}

/** สั่งเปิด popup — helper (notify/confirmAction) เรียกตัวนี้ */
export function showPopup(req: PopupRequest): void {
  if (listener) listener(req);
  else pending.push(req);
}
