# src/domain

โดเมนหลักของแอป — โมเดลข้อมูล + ตรรกะการหาร เป็น **pure functions** ล้วน (ไม่มี side-effect, ไม่แตะ state/network, **ไม่มี `Date.now()`**)

- `types.ts` — `Member`, `Bill`, `BillItem`, `AppState`, `Consumes`, `SplitMode`, `Group` ฯลฯ (เริ่มอ่านที่นี่)
- `split.ts` —
  - ผู้ร่วมบิล: `memberMatchesCategory`, `billMembers`
  - คิดเงิน: `computeBill(bill, members, asOf?)` → `BillBreakdown` (มี `soleBearerId?`), `computeTotals`, `computeNetBalances`, `settleUp`, `round2`
  - บิลเข้าสรุปได้ไหม: `billIssues` (คืนเหตุผลภาษาไทยให้ UI แสดง), `billComplete`
  - ติดตามการโอน: `transferKey` (**2 รูปแบบ** ดูกติกาด้านล่าง), `nothingOwed`, `pruneSettlements`, `amountsDrift`
  - ภายใน (ไม่ export) ที่ต้องรู้ก่อนแก้: `sumStable` (บวก float ให้ผลไม่ขึ้นกับลำดับ), `byCode` (tiebreak ตาม code unit),
    `largestRemainder` (เกลี่ยเศษสตางค์), `splitStamp`/`referenceAsOf`/`settleHub` (ของโหมดยอดลอย)

## กติกา

- **แก้สูตรหารที่ `split.ts` เท่านั้น** — UI/store แค่เรียกใช้ อย่ากระจาย logic ออกไป
- **เวลาต้องส่งเข้ามา**: ฟังก์ชันที่ต้องรู้ "ตอนนี้" รับ `asOf?: number` (ไม่ส่ง = ใช้ `bill.createdAt`)
  ผู้เรียกหา `Date.now()` ครั้งเดียวต่อ render แล้วส่งค่าเดียวกันเข้าทุก call
- **คิดเงินบนจำนวนเต็มหน่วยสตางค์** + เกลี่ยเศษแบบ largest remainder → ผลรวม net = 0 พอดี
  และห้ามใส่ threshold แบบ `0.005` กลับมา
- **ผลลัพธ์ต้องไม่ขึ้นกับลำดับแถวใน array** (`members`/`bills`/`items`) — ห้ามใช้ตำแหน่งแถวเป็น tiebreak
  (ใช้ `byCode`), ห้ามใช้ `localeCompare` ในเลเยอร์นี้, ห้ามบวก float ตรง ๆ ในเส้นทางคิดเงิน (ใช้ `sumStable`)
- **`settleUp` มี 2 โหมด**: ยอดนิ่ง = greedy min-transfer · ยอดลอยตามเวลา (`amountsDrift`) = star รอบ hub เดียว
  และ `transferKey` เปลี่ยนรูปแบบตามนั้น (ยอดนิ่งผูกยอด+ทิศ / ยอดลอยผูกคู่คน+`stamp`)
  — **ประกอบ key เองไม่ได้เด็ดขาด** ใช้ `transferKey(t)` เท่านั้น
- `*Ids` ที่เป็น array ว่าง = **"ทุกคนที่เข้าเงื่อนไข"** (`bill.memberIds` → ทุกคนที่ `consumes` เข้ากับ `category`;
  `item.participantIds` → ทุกคนในบิล) — ห้ามเปลี่ยนความหมายนี้
- ฟิลด์ใหม่ในโมเดลควรเป็น **optional** เพื่อไม่พัง state เดิมที่ผู้ใช้บันทึกไว้

กฎเต็ม: [.claude/rules/domain.md](../../.claude/rules/domain.md) · รายละเอียดสูตร: [docs/SPEC.md](../../docs/SPEC.md) §4
