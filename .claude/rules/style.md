# Rules: Accessibility & Code style

- ปุ่ม/ช่องกรอกทุกจุดใส่ `accessibilityRole` + `accessibilityLabel`
  (และ `accessibilityState` สำหรับ selected/disabled) รองรับ screen reader
- hit target ปุ่มเล็ก ≥ 40px
- โมเดลข้อมูล: ฟิลด์ `*Ids` ที่เป็น array ว่าง = "ทุกคนที่เข้าเงื่อนไข" — ห้ามทำหาย
  - `bill.memberIds` ว่าง → ทุกคนที่ `consumes` ตรงกับ `category`
  - `item.participantIds` ว่าง → ทุกคนในบิล
- `paidById` = คนออกเงินแต่ละบิล **อาจคนละคน** — เป็น requirement หลัก อย่าทำหาย
- เวลา: ฟังก์ชันในโดเมนรับ `asOf?: number` ไม่อ่าน `Date.now()` เอง; ผู้เรียกหาเวลา
  **ครั้งเดียวต่อ render** แล้วส่งค่าเดียวกันเข้าทุก call (รายละเอียด [domain.md](domain.md))
- หลังแก้โค้ดรัน `npx tsc --noEmit` เสมอก่อนถือว่าเสร็จ
