# src/domain

โดเมนหลักของแอป — โมเดลข้อมูล + ตรรกะการหาร เป็น **pure functions** ล้วน (ไม่มี side-effect, ไม่แตะ state/network)

- `types.ts` — `Member`, `Bill`, `BillItem`, `AppState`, `Consumes`, `SplitMode`, `Group` ฯลฯ (เริ่มอ่านที่นี่)
- `split.ts` — `computeBill`, `computeTotals`, `computeNetBalances`, `settleUp`, `billMembers`

**กติกา:** ถ้าจะแก้สูตรหาร แก้ที่ `split.ts` เท่านั้น — UI/store แค่เรียกใช้ อย่ากระจาย logic ออกไป
