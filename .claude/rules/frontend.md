# Rules: Frontend (RN / expo-router)

ขอบเขต: `app/**`, `src/ui/**`

- คอมเมนต์ + ข้อความ UI เป็น **ภาษาไทย**
- State ทุกอย่างผ่าน `useStore()` จาก [src/data/store.tsx](../../src/data/store.tsx) — อย่าใช้ AsyncStorage/Supabase ตรง ๆ ใน component
- ธีมมืด: ใช้สีจาก `colors` ใน [src/ui/index.ts](../../src/ui/index.ts) เท่านั้น อย่า hardcode hex
- แสดงจำนวนเงินด้วย `baht()` เสมอ
- Location feature เช็ก `Platform.OS !== 'web'` ก่อน (web ไม่มี geofence)
- ปุ่มที่มีเงื่อนไข → `disabled` + หรี่ opacity เมื่อยังทำไม่ได้ อย่าปล่อยให้กดแล้วเงียบ (no-op)
- การลบ (ย้อนกลับไม่ได้) → เรียก `confirmRemove(name, onConfirm)` เสมอ อย่าลบทันที;
  การยืนยันที่ต้องเขียนข้อความเอง (ปิดกลุ่ม/ออกจากกลุ่ม) → `confirmAction({ title, message, confirmLabel, onConfirm })`
- error จาก store → แสดงด้วย `friendlyError(e, fallback)` + `notify()` ห้ามกลืนเงียบ
- Empty state ทุกหน้าใช้รูปแบบเดียวกัน: ไอคอน emoji + หัวข้อ + คำแนะนำ (`emptyBox`/`emptyIcon`/`emptyTitle`/`emptyDesc`)
- เวลา: หา `const now = Date.now()` **ครั้งเดียวต่อ render** แล้วส่งเป็น `asOf` เข้าฟังก์ชันโดเมนทุกตัวในหน้านั้น
  (`computeBill`/`computeTotals`/`computeNetBalances`/`settleUp`) — ดู [domain.md](domain.md)
- key ของรายการโอนใช้ `transferKey(t)` เท่านั้น **ห้ามต่อสตริงเอง — มี 2 รูปแบบ**
  (ยอดนิ่งผูกยอด+ทิศ / ยอดลอยตามเวลาผูกคู่คน+`stamp`; ดู [domain.md](domain.md))
  เช็ก "เคลียร์หมด" ด้วย `nothingOwed()` และอย่าเขียน UI ที่สมมติว่า `settleUp` ให้ "จำนวนโอนน้อยสุด" เสมอ (ยอดลอยใช้แบบ star)
- การ์ดที่ export เป็นรูป (`shareCard` ใน [app/summary.tsx](../../app/summary.tsx)) **ห้ามมีข้อมูลส่วนบุคคล** เช่น เบอร์พร้อมเพย์
  และห้ามใส่ปุ่ม/ตัวควบคุมลงในการ์ด ([ADR 0004](../../docs/adr/0004-no-promptpay-in-shared-image.md))
