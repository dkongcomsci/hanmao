# SPEC — หารเมา (hanmao)

เอกสารอธิบาย **การทำงานของแอป** (behavior spec) สำหรับอ้างอิงในรอบต่อ ๆ ไป
เน้นว่า "แอปทำอะไร / คิดเงินยังไง / แต่ละหน้าทำงานยังไง" — ส่วนแนวปฏิบัติการเขียนโค้ดอยู่ที่ [CLAUDE.md](../CLAUDE.md)

> เวอร์ชัน: dual-mode (local + วงหลายคน real-time ผ่าน Supabase) · UI ภาษาไทย · ธีมสว่าง/มืดสลับได้ (default มืด) · iOS / Android / Web จาก codebase เดียว

---

## 1. ภาพรวม

หารเมาเป็นแอป **หารค่าอาหาร/เครื่องดื่ม** สำหรับกลุ่มเพื่อนในบริบทร้านไทย
โจทย์หลักที่แก้:

1. ในหนึ่งวงมี **หลายบิล** (เช่น ค่าอาหาร บิลนึง ค่าเหล้าอีกบิลนึง) และ **คนจ่ายแต่ละบิลอาจเป็นคนละคน**
2. คนในวง **มาไม่พร้อมกัน / กลับไม่พร้อมกัน** → บางคนไม่ควรร่วมจ่ายบางบิล
3. บางคน **กินเฉพาะอาหาร** หรือ **เฉพาะเครื่องดื่ม** → ไม่ควรโดนหารบิลที่ตัวเองไม่ได้กิน
4. มีค่า **service charge / VAT / ส่วนลด** ต้องเฉลี่ยให้ยุติธรรม
5. สุดท้ายสรุปว่า **ใครต้องโอนให้ใครเท่าไร** โดยจำนวนการโอนน้อยที่สุด (ยกเว้นตอนยอดยังลอยตามเวลา — ดู §4.5) + **ติ๊กว่าโอนแล้ว** และ **แชร์การ์ดสรุปเป็นรูป**
6. (มือถือ) เช็ก **location** ว่าคนที่จะกลับก่อนยังอยู่ในพื้นที่ร้านไหม

### สองโหมดของ state

- **local mode** (คนเดียว, offline) — state เก็บใน **AsyncStorage** (บนเว็บคือ localStorage key `hanmao:state:v1`) ไม่ต้องมีเซิร์ฟเวอร์
- **group mode** (หลายคน real-time) — เข้าร่วม "วง" ผ่าน invite link/QR แล้ว state อยู่บน **Supabase** (Postgres + Realtime) ทุกคนแก้พร้อมกันแล้ว sync

ทุกหน้าจอคุยกับ state ผ่าน interface `Store` เดียว (`useStore()`) — โหมดไหนก็โค้ดหน้าจอเหมือนกัน (ดู §6). ถ้าไม่ได้ตั้ง env Supabase แอปจะบังคับ local mode อัตโนมัติ

แอปใช้ **4 คีย์** ในที่เก็บของเครื่อง (AsyncStorage / localStorage บนเว็บ) — ดู §6:
`hanmao:state:v1` (state ของ local mode) · `hanmao:session:v1` (อยู่วงไหน + เราเป็น member ไหนในวง) · `hanmao:me:v1` ("ฉันคือใคร" ของ local mode) · `hanmao:theme:v1` (ธีมสว่าง/มืด — device preference, ไม่ผูกโหมด ดู §5.1)

---

## 2. โมเดลข้อมูล (`src/domain/types.ts`)

```
AppState
├─ members:     Member[]
├─ bills:       Bill[]
├─ venue:       { lat, lng, radiusM } | null   // พื้นที่ร้านสำหรับ geofence
└─ settlements: string[]                        // รายการโอนที่ติ๊ก "โอนแล้ว" — key จาก transferKey() ซึ่งมี 2 รูปแบบ (ดู §4.6)
```

> meta ของวงปัจจุบัน (`Group = { id, name, inviteCode }`), `mode`, และ `myMemberId` ("ฉันคือใคร") ไม่ได้อยู่ใน `AppState` แต่เก็บแยกใน store (ดู §6)

### Member (สมาชิก)
| ฟิลด์ | ชนิด | ความหมาย |
|---|---|---|
| `id` | string | id ภายใน (uuid) |
| `name` | string | ชื่อที่แสดง |
| `consumes` | `'both' \| 'food' \| 'drink'` | กินอะไร — ใช้กรองว่าร่วมบิลหมวดไหนได้ |
| `arrivedAt` | number \| null | เวลามาถึง (epoch ms); `null` = อยู่ตั้งแต่ต้น |
| `leftAt` | number \| null | เวลากลับ (epoch ms); `null` = ยังไม่กลับ |
| `promptPay` | string \| null _(optional)_ | เบอร์พร้อมเพย์/เลขบัตร ปชช. ไว้ให้ copy ตอนโอน |
| `userId` | string \| null _(optional)_ | auth uid ที่ claim member คนนี้ (group mode) |

### Bill (บิล)
| ฟิลด์ | ชนิด | ความหมาย |
|---|---|---|
| `id` | string | id ภายใน |
| `name` | string | ชื่อบิล |
| `category` | `'food' \| 'drink' \| 'mixed'` | หมวดบิล — คู่กับ `consumes` เพื่อกรองผู้ร่วม |
| `splitMode` | `'equal' \| 'itemized' \| 'time'` | วิธีหาร (ดู §4) |
| `items` | `BillItem[]` | รายการเมนู |
| `memberIds` | string[] | ผู้ร่วมบิลนี้ (**ว่าง = ทุกคนที่เข้าเงื่อนไข** ดู §3) |
| `paidById` | string \| null | **คนออกเงินบิลนี้** (แต่ละบิลอาจคนละคน) |
| `isTreat` | boolean _(optional)_ | บิลเลี้ยง — คนจ่ายรับผิดชอบยอดเต็ม คนอื่นจ่าย 0 |
| `serviceChargePct` | number | % ค่าบริการ |
| `vatPct` | number | % VAT |
| `discount` | number | ส่วนลด (บาท) |
| `createdAt` | number | เวลาสร้างบิล (ใช้เป็น fallback ในโหมด time) |

### BillItem (เมนู)
| ฟิลด์ | ชนิด | ความหมาย |
|---|---|---|
| `id` | string | id ภายใน |
| `name` | string | ชื่อเมนู |
| `price` | number | ราคา |
| `participantIds` | string[] | คนที่กินเมนูนี้ (**ว่าง = ทุกคนในบิล**) ใช้เฉพาะโหมด itemized |

---

## 3. กติกาสำคัญ: array ว่าง = "ทุกคนที่เข้าเงื่อนไข"

เป็นคอนเวนชันที่ผูกกับ logic ทั้งระบบ — **ห้ามทำหาย**:

- `bill.memberIds` ว่าง → ผู้ร่วมบิล = สมาชิกทุกคนที่ `consumes` เข้ากับ `bill.category`
- `item.participantIds` ว่าง → ผู้ร่วมเมนู = ทุกคนที่ร่วมบิลนั้น

### การจับคู่ consumes × category (`memberMatchesCategory`)
| category ↓ / consumes → | both | food | drink |
|---|:---:|:---:|:---:|
| **food** | ✓ | ✓ | ✗ |
| **drink** | ✓ | ✗ | ✓ |
| **mixed** | ✓ | ✓ | ✓ |

> `mixed` = ทุกคนร่วมได้; `both` = ร่วมได้ทุกหมวด

**`billMembers(bill, members)`** = เอา pool (จาก `memberIds` หรือทุกคน) มากรองด้วยตารางนี้ → ได้ผู้ร่วมบิลจริง

---

## 4. ตรรกะการหาร (`src/domain/split.ts`)

หัวใจของแอป เป็น **pure functions** ล้วน (ไม่แตะ state/side-effect) — ถ้าจะแก้สูตร แก้ที่นี่ที่เดียว

### 4.0 กฎ `asOf` — เวลา "ตอนนี้" ต้องส่งเข้ามา ห้ามอ่านเอง

ในไฟล์นี้ **ห้ามมี `Date.now()`** เลย ฟังก์ชันที่ต้องรู้ว่า "ตอนนี้กี่โมง" (คนที่ยัง `leftAt = null`)
รับผ่านพารามิเตอร์สุดท้าย `asOf?: number` แทน — `computeBill`, `computeTotals`, `computeNetBalances`, `settleUp`
ไม่ส่ง `asOf` = ใช้ `bill.createdAt` เป็นเวลาอ้างอิง

**ผู้เรียกต้องหา `const now = Date.now()` ครั้งเดียวต่อ render แล้วส่งค่าเดียวกันนี้เข้าทุก call**
ถ้าเรียกหลาย ๆ ครั้งโดยไม่ส่ง `asOf` ตัวเดียวกัน บิลโหมด `time` จะได้ยอดต่างกันในหน้าจอเดียว (ยอดต่อคน ≠ รายการโอน)
ทุกหน้าที่คิดเงินทำแบบนี้แล้ว: `index.tsx`, `bills.tsx`, `bill/[id].tsx`, `summary.tsx`, `me.tsx`

### 4.1 `computeBill(bill, members, asOf?) → BillBreakdown`

ขั้นตอน:

1. **หาผู้ร่วมบิล** ด้วย `billMembers()`
2. **ไม่มีใครเข้าเงื่อนไขเลย** (`billMembers` ว่าง) → ยกยอดเต็มบิลให้ `paidById` คนเดียว (กันเงินหายทั้งก้อน) และตั้ง `soleBearerId = paidById`
3. **คิดยอดดิบต่อคน (raw)** ตาม `splitMode`:
   - **`equal`** — `subtotal / จำนวนผู้ร่วม` เท่ากันทุกคน
   - **`itemized`** — วนแต่ละเมนู หารราคาเมนูนั้นในกลุ่ม `participantIds` (ว่าง = ผู้ร่วมบิลทั้งหมด) แล้วบวกสะสมต่อคน; ถ้าผู้ร่วมที่ระบุไว้ไม่มีใครเข้าเงื่อนไขบิลเลย → เกลี่ยเท่ากันให้ทุกคนในบิล (ไม่ทำยอดเมนูหาย)
   - **`time`** — เฉลี่ยตามสัดส่วนเวลาที่อยู่: หน้าต่างเวลา = ตั้งแต่คนแรกมาถึงจนคนสุดท้ายกลับ (คนที่ยังไม่กลับ = ถึง `asOf`); น้ำหนักแต่ละคน = ช่วงเวลาที่ทับซ้อน (`overlapMs`); คนที่น้ำหนัก 0 (มาหลังบิลจบ) ได้ 0 จริง; ถ้าทุกคนน้ำหนัก 0 → ตกไปหารเท่ากัน
4. **ใส่ค่าบริการ/ภาษี/ส่วนลด แบบสัดส่วน**:
   ```
   service = subtotal × serviceChargePct/100
   vat     = (subtotal + service) × vatPct/100
   total   = subtotal + service + vat − discount
   factor  = total / subtotal
   ยอดต่อคน = raw ต่อคน × factor
   ```
   → ค่าบริการ/ภาษี/ส่วนลดถูกกระจายตามสัดส่วนยอดดิบของแต่ละคนโดยอัตโนมัติ
   ถ้า `subtotal = 0` แต่ `total ≠ 0` (เมนูหักกันหมดแล้วมีส่วนลด) → ไม่มีฐานให้เทียบสัดส่วน เกลี่ย `total` เท่ากันทุกคน
5. **บิลเลี้ยง (`isTreat`)**: ถ้าเปิดและมี `paidById` → override ยอดทุกคนเป็น 0 แล้วยกยอดเต็ม (`total`) ให้คนจ่ายคนเดียว + ตั้ง `soleBearerId = paidById`

**คืนค่า `BillBreakdown`:** `{ perMember: Map<id, number>, subtotal, service, vat, discount, total, soleBearerId? }`

`soleBearerId` (optional, `string | null`) = คนที่รับยอดเต็มบิลคนเดียว ไม่ใช่ผู้ร่วมหารปกติ — เกิดจากบิลเลี้ยง (ข้อ 5)
หรือ fallback ตอนไม่มีใครเข้าเงื่อนไขบิล (ข้อ 2); `null` = หารปกติ. หน้าจอใช้ค่านี้อธิบายให้ผู้ใช้เห็นว่าทำไมยอดไปกองที่คนเดียว

### 4.2 `billIssues(bill, members?) → string[]` และ `billComplete(bill, members?) → boolean`

`billIssues` คืน **เหตุผลภาษาไทยพร้อมแสดงบนจอ** ว่าบิลนี้ยังไม่เข้าสรุปเพราะอะไร (ว่าง = สมบูรณ์):

| เงื่อนไข | ข้อความ |
|---|---|
| ไม่มี `paidById` | `ต้องเลือกคนออกเงิน` |
| มี `paidById` แต่ชี้ไปคนที่ไม่อยู่ใน `members` (ต้องส่ง `members` มาด้วยจึงตรวจ) | `คนออกเงินไม่อยู่ในรายชื่อสมาชิก` |
| ไม่มีเมนูที่ราคา > 0 | `ต้องมีเมนูอย่างน้อย 1 รายการที่มีราคา` |
| มีเมนูราคา > 0 แต่ `subtotal ≤ 0` (ราคาติดลบหักจนหมด) | `ยอดรวมต้องมากกว่า 0` |

`billComplete` = `billIssues(...).length === 0` (เกณฑ์เดียวกันเป๊ะ) — `computeTotals`/`settleUp`/`computeNetBalances` ข้ามบิลที่ไม่ complete
หน้าจอ `bills.tsx` / `bill/[id].tsx` / `summary.tsx` / `me.tsx` แสดงข้อความจาก `billIssues` ตรง ๆ เพื่อไม่ให้บิลหายจากสรุปแบบเงียบ ๆ

### 4.3 `computeTotals(state, asOf?) → { perMember, grandTotal }`
รวม `computeBill` ของทุกบิล**ที่ `billComplete`** → ยอดที่แต่ละคนต้องจ่ายรวม + ยอดรวมทั้งหมด

### 4.4 `computeNetBalances(state, asOf?) → Map<id, number>`
ยอดสุทธิของแต่ละคน:
```
เริ่มทุกคน = 0
สำหรับแต่ละบิลที่ billComplete:
  − (ยอดที่คนนั้นต้องรับผิดชอบ)      // ลบส่วนที่ตัวเองต้องจ่าย
  + (ยอดเต็มบิล ให้กับ bill.paidById)  // คนที่ออกเงินได้เครดิตคืน
```
- **net > 0** = ออกเงินเกิน คนอื่นติดเงินเรา (ได้คืน)
- **net < 0** = เราติดเงินคนอื่น (ต้องจ่าย)

คิดภายในเป็น **จำนวนเต็มหน่วยสตางค์** แล้วคืนค่าหน่วยบาทที่ปัด 2 ตำแหน่ง → **ผลรวมของทุกคนเป็น 0 พอดี**
และตรงกับ `settleUp()` เสมอ (ทั้งสองใช้ฐานเดียวกัน)

### 4.5 `settleUp(state, asOf?) → Transfer[]`

คืนรายการ `{ fromId, toId, amount, stamp? }` ที่ยอดตรงกับ net ของทุกคนเป๊ะ (ผลรวม net = 0 อยู่แล้ว)
มี **2 โหมดการจับคู่** เลือกด้วย `amountsDrift(state)` — **อย่าคิดว่าเป็น greedy อย่างเดียว**:

| โหมด | เมื่อไร | จับคู่ยังไง |
|---|---|---|
| **ยอดนิ่ง** | ปกติ | **greedy min-transfer** — แยกเจ้าหนี้ (net>0) / ลูกหนี้ (net<0) เรียงมาก→น้อย (ยอดเท่ากัน → เรียงด้วยรหัสสมาชิก) จับคู่ทีละคู่ โอนเท่าจำนวนที่น้อยกว่า → จำนวนรายการโอนน้อยที่สุด |
| **ยอดลอยตามเวลา** | `amountsDrift(state) = true` | **ดาว (star)** — ทุกคนที่ net ≠ 0 มี **เส้นเดียว** กับศูนย์กลางเดียว; ยอดของแต่ละเส้น = net ของคนนั้นเอง |

- **`amountsDrift(state) → boolean`** = มีบิลโหมด `time` ที่ `billComplete` **และ** มีผู้ร่วมบิลที่ยัง `leftAt = null`
  ⇒ ยอดขยับทุกมิลลิวินาทีเพราะคนที่ยังนั่งอยู่รับสัดส่วนเวลามากขึ้นเรื่อย ๆ
- ศูนย์กลางของ star เลือกด้วย `settleHub(state)` = **เจ้าหนี้รายใหญ่สุด ณ `referenceAsOf(state)`**
  (เวลาของเหตุการณ์ล่าสุดที่บันทึกไว้: สร้างบิล/มาถึง/กลับ) — เลือกจาก **ข้อมูล ไม่ใช่นาฬิกา** ไม่งั้นศูนย์กลางขยับเอง
  ยอดเท่ากัน → ตัดสินด้วยรหัสสมาชิก เพื่อให้ทุกเครื่องได้ศูนย์กลางเดียวกัน
- โหมดยอดลอยติด `stamp` ให้ทุกรายการ → `transferKey` เปลี่ยนรูปแบบตามไปด้วย (ดู §4.6)
- เหตุผลที่ต้องแยกโหมด: greedy จับคู่จากลำดับยอดที่ลอยตามเวลา ⇒ **ตัวคู่โอนเปลี่ยนเอง** ทั้งที่ผู้ใช้ไม่ได้แก้อะไร
  ⇒ ติ๊ก "โอนแล้ว" หลุด ⇒ กล่อง 🎉 กับปุ่มปิดวงหายเอง. ต้นทุนของ star = รายการโอนมากกว่า greedy
  ราว +0.1% (บางวงที่มีเจ้าหนี้หลายคนเพิ่ม 1 รายการ) — ดู [adr/0006-stable-settle-topology.md](adr/0006-stable-settle-topology.md)

คิดบน **สตางค์จำนวนเต็ม** ทั้งกระบวนการ (ไม่มี threshold ลอย ๆ) → ผลรวมยอดโอน = ผลรวมหนี้ = ผลรวมที่เจ้าหนี้ต้องได้ เป๊ะ ไม่มีเงินหาย/งอก 1-2 สตางค์
เศษที่ปัดไม่ลงตัวถูกเกลี่ยแบบ **largest remainder** (คนที่ปัดห่างค่าจริงมากสุดรับเศษก่อน; เท่ากัน → ลูกหนี้รับเศษก่อน เพื่อให้คนออกเงินได้คืนครบตามที่ควักจริง; เท่ากันอีก → **รหัสสมาชิก**)
`round2(n)` = ปัด 2 ตำแหน่งแบบสมมาตรรอบ 0 (`1.005 → 1.01`, `-1.005 → -1.01`)
ดู [adr/0002-integer-cents-largest-remainder.md](adr/0002-integer-cents-largest-remainder.md)

### 4.5.1 invariant: ผลลัพธ์ไม่ขึ้นกับลำดับแถวใน array

ยอดต่อคน / net / คู่โอน / `transferKey` ต้องเป็นฟังก์ชันของ **ข้อมูล** เท่านั้น
สลับลำดับใน `state.members` / `state.bills` / `bill.items` แล้วผลต้องเหมือนเดิมทุกทศนิยม
(สำคัญในโหมดวง: Postgres ไม่การันตีลำดับแถว ⇒ สองเครื่องอาจได้ลำดับต่างกัน ⇒ ถ้าผลต่างกัน คนหนึ่งจะเห็น "โอนแล้ว" อีกคนเห็น "ยังไม่โอน")

สิ่งที่บังคับ invariant นี้ในโค้ด:

- tiebreak ชั้นสุดท้ายทุกที่เป็น **รหัสสมาชิก** ผ่าน `byCode(a, b)` (เทียบตาม code unit)
  — **ห้ามใช้ตำแหน่งแถว** เป็น tiebreak และ **ห้ามใช้ `localeCompare` ในเลเยอร์โดเมน** (ผลต่างกันตาม locale)
- **`sumStable(xs)`** — เรียงค่าก่อนบวก ใช้ทุกจุดที่บวกเงิน/น้ำหนักในเส้นทางคิดเงิน
  เพราะการบวก float ไม่ commutative ต่างกันระดับ `1e-13` ก็พลิก `Math.round` ในเคสที่ยอดตกลง .5 สตางค์พอดี
  ⇒ เศษ 1 สตางค์ย้ายคน. **ห้ามบวก float ตรง ๆ ในเส้นทางคิดเงิน**

กระทบทุกโหมดการหาร (equal/itemized/time) เพราะอยู่ที่ชั้นเกลี่ยเศษ ไม่ใช่ชั้นสูตร

### 4.6 ติดตามการโอน (`transferKey`, `nothingOwed`, `pruneSettlements`)

- **`transferKey(t)` มี 2 รูปแบบ** ตามว่ารายการนั้นมี `stamp` ไหม (มาจาก `settleUp`) — **ห้ามประกอบ key เองเด็ดขาด**:

  | กรณี | รูปแบบ | ผูกกับอะไร |
  |---|---|---|
  | ยอดนิ่ง (ไม่มี `stamp`) | `` `${fromId}>${toId}@${ยอด 2 ตำแหน่ง}` `` เช่น `B>A@550.00` | **ทิศทาง + ยอดเงิน** |
  | ยอดลอย (มี `stamp`) | `` `${idน้อย}|${idมาก}@${stamp}` `` | **คู่คน + ลายนิ้วมือข้อมูล** ไม่ผูกยอด ไม่ผูกทิศทาง |

  - แบบผูกยอด: ยอดที่ต้องโอนเปลี่ยน (เพิ่ม/แก้/ลบบิล, เพิ่ม/ลบสมาชิก) → key เดิมไม่ match = ติ๊กเก่าเป็นโมฆะเอง (ดู [adr/0003](adr/0003-transfer-key-amount-bound.md))
  - แบบ stamp: `stamp = splitStamp(state)` = FNV-1a สอง seed ของทุกฟิลด์ที่กำหนดยอด **ไม่ผูกนาฬิกา**
    (ชื่อ/พร้อมเพย์ไม่อยู่ใน stamp → แก้ชื่อแล้วติ๊กไม่หลุด) → ยอดขยับตามเวลาแล้วติ๊กยังติด
  - สองรูปแบบไม่มีทาง match ข้ามกัน (ตัวคั่น `|` vs `>`; ค่าหลัง `@` — stamp ขึ้นต้น `t`, ยอดขึ้นต้นเลข/`-`)
  - **ตาข่ายกันเงินหาย**: ตอนคนสุดท้ายติ๊ก "กลับแล้ว" ยอดหยุดลอย → key ย้ายจากแบบ stamp กลับไปแบบผูกยอด
    ⇒ **ติ๊กชุดเดิมเป็นโมฆะทั้งชุด ต้องติ๊กใหม่บนยอดปิดจริงก่อนปิดวง** — เป็นราคาที่ยอมจ่ายเพื่อความหลวมของ key แบบ stamp
    (ดู [adr/0006](adr/0006-stable-settle-topology.md))
- **`nothingOwed(transfers, settlements)` → boolean** — `true` เมื่อ **ไม่มีรายการโอนเลย** (หารลงตัวพอดี ไม่มีใครต้องโอน) **หรือ** ทุกรายการถูกติ๊กว่าโอนแล้ว
  หน้าสรุปใช้ปลดล็อกกล่อง 🎉 + ปุ่มเคลียร์/ปิดวง (คู่กับเงื่อนไข "มีข้อมูลให้สรุปจริง")
  key รูปแบบเก่าที่ค้างอยู่จะไม่ match เฉย ๆ (นับเป็น "ยังไม่โอน") ไม่ throw
- **`pruneSettlements(transfers, settlements)` → string[]** — คืน settlements ที่เหลือเฉพาะ key ที่ตรงกับรายการโอนปัจจุบัน (ตัดซ้ำออกด้วย)
  store เรียกให้เองทุกครั้งที่ mutate ข้อมูลที่กระทบยอด (ดู §6) — หน้าจอไม่ต้องเรียกเอง

---

## 5. หน้าจอและพฤติกรรม (`app/`)

Navigation = **bottom tabs** 5 แท็บ (หน้าแรก/สมาชิก/บิล/สรุป/ฉัน — ตั้งใน `app/_layout.tsx`) + หน้าที่ซ่อนจากแท็บ: รายละเอียดบิล (`bill/[id]`), จัดการวง (`group`), เข้าร่วมวง (`join/[code]`)

### 5.1 ธีมสว่าง/มืด (สลับตอน runtime)

- มี **2 ธีมเท่านั้น** (สว่าง/มืด) **ไม่มีโหมด auto** (ไม่ตามระบบ) — **default = มืด**
- **ปุ่มสลับธีมอยู่บน header ทุกหน้า** (`headerRight` ของ `Tabs.screenOptions` ใน `_layout.tsx`)
  `accessibilityLabel="สลับธีม"`, ไอคอน 🌙 (ธีมมืด) / ☀️ (ธีมสว่าง); StatusBar ปรับสีตัวอักษรตามธีม
- กดปุ่มเรียก `toggleTheme()` — สลับ light↔dark ทันที (ทุกหน้าอัปเดตสีเพราะดึงผ่าน `useTheme()` + `makeStyles`)
- ธีมที่เลือก **persist ข้ามการเปิดแอป** ลงคีย์ `hanmao:theme:v1` (ค่าเพี้ยน/ไม่มี → คงไว้ที่ default มืด)
- ธีมเป็น **device preference**: ไม่อยู่ใน `AppState`, ไม่ sync ขึ้น Supabase, ไม่ผูกกับ local/group mode
  (คนในวงเดียวกันเลือกธีมคนละแบบได้ — persist ทุกโหมด) — ดู [adr/0007-runtime-theme-switch.md](adr/0007-runtime-theme-switch.md)

### 🏠 หน้าแรก (`index.tsx`)
- Hero: ยอดรวมทั้งหมด + จำนวนสมาชิก/คนที่ยังอยู่/จำนวนบิล
- **ผู้ใช้ใหม่ (ไม่มีสมาชิก+ไม่มีบิล)** → แสดง onboarding 3 ขั้น + ปุ่ม "เริ่มเลย" ไปหน้าสมาชิก
- **มีข้อมูลแล้ว** → การ์ดทางลัดไป สมาชิก/บิล/สรุป

### 👥 สมาชิก (`members.tsx`)
- ฟอร์มเพิ่ม: ชื่อ + เลือก `consumes` + **พร้อมเพย์ (ไม่บังคับ)** — ปุ่มเพิ่ม **disabled** ถ้ายังไม่กรอกชื่อ **หรือพร้อมเพย์ผิดรูปแบบ** (`isValidPromptPay`: เบอร์มือถือ 10 หลัก หรือเลขบัตร 13 หลัก; ว่างได้)
- แต่ละคน: แก้ `consumes` ได้, แก้พร้อมเพย์แบบ inline (บันทึกเมื่อออกจากช่อง; ถ้าเพื่อนในวงแก้มาทาง realtime ขณะเราไม่ได้พิมพ์ค้าง ค่าจะ sync ตาม), ปุ่ม **มาถึง/กลับ** (toggle เวลา), ปุ่ม **ลบ** (`confirmRemove` ยืนยันก่อน)
- toggle มาถึง = เซ็ต/ล้าง `arrivedAt`; toggle กลับ = เซ็ต/ล้าง `leftAt` (เป็นเวลาปัจจุบัน)

### 🧾 บิล (`bills.tsx` + `bill/[id].tsx`)
- `bills.tsx`: ฟอร์มสร้างบิล (ชื่อ + หมวด; ชื่อว่างได้ → ตั้งชื่อ `บิล N` ให้อัตโนมัติ) → เข้าหน้ารายละเอียดทันที; ด้านล่างลิสต์บิลพร้อมยอดรวม/หมวด/วิธีหาร/จำนวนเมนู/คนจ่าย + **แถบ ⚠️ "ยังไม่เข้าสรุป" พร้อมเหตุผลจาก `billIssues`** (ขอบการ์ดเปลี่ยนสี) และ 🎁 ต่อท้ายชื่อถ้าเป็นบิลเลี้ยง
- `bill/[id].tsx` (หน้าซับซ้อนสุด):
  - บิลถูกลบ/ไม่พบ id → empty state + ปุ่มกลับหน้าบิลทั้งหมด
  - แก้ชื่อบิล (inline; เตือนถ้าชื่อว่าง)
  - **กล่องเตือน "บิลนี้ยังไม่เข้าสรุป"** ไล่เหตุผลจาก `billIssues` (`accessibilityRole="alert"`)
  - เลือก **วิธีหาร** (equal/itemized/time; โหมด time มีคำอธิบายว่าใช้เวลามา-กลับจากแท็บสมาชิก)
  - **ใครออกเงินบิลนี้ \*** → เซ็ต `paidById` (toggle เลือกได้คนเดียว; กดซ้ำ = ยกเลิกและปลด `isTreat` ด้วย) — ยังไม่มีสมาชิกจะมีลิงก์ไปหน้าสมาชิก
  - **🎁 คนจ่ายเลี้ยง** → toggle `isTreat` (disabled จนกว่าจะเลือกคนออกเงิน)
  - **ใครร่วมบิลนี้** → toggle `memberIds` (สำหรับคนมาทีหลัง/กลับก่อน; ไม่เลือก = ทุกคนที่เข้าเงื่อนไข พร้อมบอกจำนวนคน) + เตือนถ้าไม่มีใครเข้าเงื่อนไขเลย (ยอดจะตกเป็นของคนออกเงินคนเดียว)
  - **เมนู** → เพิ่ม/ลบ (ต้องมีทั้งชื่อและราคาที่เป็นตัวเลขจึงเพิ่มได้); ถ้าโหมด itemized โชว์ชิปเลือกผู้ร่วมต่อเมนู
  - **ค่าบริการ/VAT/ส่วนลด** → input ตัวเลข
  - **สรุปบิล** (subtotal/service/vat/discount/total) + **ยอดต่อคนในบิลนี้** (+ ข้อความอธิบายเมื่อมี `soleBearerId`)
  - ปุ่ม **ลบบิล** (ยืนยันก่อน) → กลับหน้าก่อนหน้า

### 💰 สรุป (`summary.tsx`)
- **การ์ดสรุปสะอาด** (`shareCard`) — ใช้จับภาพ export: แบรนด์ 🍜 หารเมา + ชื่อวง, ยอดรวมทุกบิล, ยอดที่แต่ละคนต้องจ่าย, และใครโอนให้ใคร (ชื่อ + ยอด)
  **การ์ดนี้ไม่มีเบอร์พร้อมเพย์โดยเจตนา** เพราะรูปมักถูกส่งต่อในกลุ่มแชท (มีข้อความบนจอกำกับไว้ว่า "รูปสรุปไม่มีเบอร์พร้อมเพย์ ส่งต่อในกลุ่มได้ปลอดภัย") — ปุ่ม copy พร้อมเพย์อยู่นอกการ์ด ดู [adr/0004-no-promptpay-in-shared-image.md](adr/0004-no-promptpay-in-shared-image.md)
- **ปุ่มแชร์/ดาวน์โหลดรูปสรุป** — จับภาพ `shareCard` ด้วย `shareViewAsImage()` (web: ดาวน์โหลด PNG; native: เปิด share sheet). disabled เมื่อยังไม่มีข้อมูล
- **ยอดที่แต่ละคนต้องจ่าย** (จาก `computeTotals`)
- **แยกตามบิล** — ต่อบิลแสดง: ยอดรวม, หมวด·วิธีหาร·คนออกเงิน, กล่อง ⚠️ เหตุผลจาก `billIssues` ถ้ายังไม่เข้าสรุป, ข้อความอธิบาย `soleBearerId` (เลี้ยง / รับยอดคนเดียวเพราะไม่มีคนเข้าเงื่อนไข), และรายชื่อผู้ร่วม + ยอดที่แต่ละคนจ่าย (คนจ่ายมี tag `(คนจ่าย)`)
- **ใครโอนให้ใคร** (จาก `settleUp`) + **checklist ติ๊ก "โอนแล้ว"** ต่อรายการ (`toggleSettlement`) + ปุ่ม copy พร้อมเพย์ของผู้รับ (ถ้าผู้รับยังไม่ใส่ จะบอกว่ายังไม่ได้ใส่) + progress "โอนแล้ว x/y"
- **ไม่มีหนี้ค้าง** (`nothingOwed` + มีข้อมูลให้สรุปจริง) → กล่อง 🎉 พร้อมปุ่ม **เคลียร์ทั้งหมด** (local) / **ปิดวง**–**ออกจากวง** (group) — ยืนยันด้วย `confirmAction` ที่ข้อความ **ต่างกัน 3 แบบ** ตาม local / host / ไม่ใช่ host (คนที่ไม่ได้สร้างวงลบวงไม่ได้ กดแล้วเป็นการออกจากวง) แล้วเรียก `closeGroup()`
- **สถานะแต่ละคน** — ได้คืน/ต้องจ่าย (จาก `computeNetBalances`; ตัดคนที่เสมอตัวออก)
- **เช็กพื้นที่ร้าน** — เฉพาะ iOS/Android (`Platform.OS !== 'web'`): ปุ่มตั้งพิกัดร้าน (รัศมี 150 ม.) + ปุ่มเช็กระยะจากตำแหน่งปัจจุบัน

### 🙋 ฉัน (`me.tsx`)
- เลือก "ฉันคือใคร" — local mode เรียก `setMe`; **group mode เรียก `claimMember()`** เพื่อผูก `user_id` บน server (ไม่ใช่จำแค่ในเครื่อง) และถ้าพลาดจะแจ้งเหตุผลจริง
- Hero: ชื่อเรา + ยอดที่ฉันต้องจ่ายรวม + ปุ่ม "เปลี่ยน" + เตือนถ้ามีบิลกรอกไม่ครบที่ยังไม่ถูกนับ
- **สถานะสุทธิของฉัน** — ได้คืน / ต้องจ่ายเพิ่ม / เคลียร์แล้ว
- **ฉันต้องโอนให้ใคร** — รายการโอนที่เราเป็นผู้จ่าย + ปุ่ม copy พร้อมเพย์ผู้รับ + checklist ติ๊ก "โอนแล้ว"
- **ใครต้องโอนให้ฉัน** — รายการที่เราเป็นผู้รับ + checklist ติ๊ก "รับเงินแล้ว"
- **บิลที่ฉันร่วม** — ยอดของฉันในบิลนั้น + เหตุผลถ้าบิลยังไม่เข้าสรุป → แตะไปหน้าบิล
- ทั้งสองส่วน checklist ใช้ `state.settlements` เดียวกับหน้าสรุป → ติ๊กที่ไหนก็ sync กัน

### 🔗 วง + เข้าร่วม (`group.tsx`, `join/[code].tsx`) — เฉพาะเมื่อตั้ง env Supabase
- ไม่ได้ตั้ง env (`remoteEnabled = false`) → ทั้งสองหน้าแสดง empty state 🔌 "ยังไม่ได้ตั้งค่าเซิร์ฟเวอร์" (ชี้ไป `config/.env.example`) และยังใช้งานคนเดียวได้ปกติ
- `group.tsx`: ยังไม่อยู่วง → **สร้างวงใหม่** (ย้าย state local ขึ้นวง) / **เข้าร่วมด้วยโค้ด** (ต้องยาว ≥ 4 ตัว); อยู่ในวงแล้ว → QR + invite link, ปุ่มแชร์ลิงก์ (web = คัดลอก), รายชื่อคนในวง (ป้าย "คุณ"), ปุ่มออกจากวง (ยืนยันด้วย `confirmAction`)
- `join/[code].tsx`: รับ code จาก deep link (`hanmao://join/<code>`) → `joinGroup(code)` → เลือก member ที่มีอยู่ (`claimMember`; ชื่อที่มีคนผูกไว้แล้วจะขึ้นหมายเหตุ แต่ยังเลือกได้เผื่อเปลี่ยนเครื่อง) หรือสร้างใหม่ (`joinAsNewMember`) → ไปหน้า `group`
  ข้อผิดพลาดทุกจุดแสดงเหตุผลจริงจาก store ผ่าน `friendlyError()` ไม่ปล่อยให้กดแล้วเงียบ

---

## 6. State management (`src/data/store.tsx` — dual-mode)

- `StoreProvider` ครอบทั้งแอปใน `_layout.tsx`; ทุกหน้าเรียกผ่าน `useStore()` โดยไม่ต้องรู้ว่าอยู่โหมดไหน
- **local mode**: โหลด/บันทึก state ที่ AsyncStorage `hanmao:state:v1` (`STORAGE_KEY`), auto-save ทุกครั้ง state เปลี่ยน (เฉพาะโหมด local — group mode ข้อมูลอยู่ remote)
  โหลด state เก่าแบบ merge กับค่าว่าง (`{ ...empty, ...JSON.parse(raw) }`) → state จากเวอร์ชันก่อนที่ยังไม่มีฟิลด์ใหม่ยังใช้ได้
- **group mode**: mutation แต่ละตัว apply local ทันที (optimistic) แล้วยิง insert/update/delete ไป Supabase แบบ fire-and-forget; Realtime subscription (`subscribeGroup`) เรียก `refetch` (`fetchGroupState`) ประกอบ rows กลับเป็น `AppState` → reconcile (เขียนพลาดก็ refetch กลับให้ตรง server)
- ถ้าไม่มี env Supabase (`remoteEnabled = false`) → ทุก mutation ทำเฉพาะ local

### คีย์ที่เก็บในเครื่อง (4 คีย์ แยกหน้าที่กันชัด)

| คีย์ | เก็บอะไร |
|---|---|
| `hanmao:state:v1` | `AppState` ของ **local mode** |
| `hanmao:session:v1` | `{ groupId, myMemberId }` — อยู่วงไหนและเราเป็น member ไหน **ในวง** เพื่อกลับเข้าวงเดิมอัตโนมัติตอนเปิดแอป |
| `hanmao:me:v1` | "ฉันคือ member ไหน" ของ **local mode** |
| `hanmao:theme:v1` | ธีมสว่าง/มืด (string `'light'`/`'dark'`) — **device preference** ไม่อยู่ใน `AppState` ไม่ sync ขึ้น server เขียนทุกโหมด (ดู §5.1) |

> แยก me ของ local กับของวงเพราะ id ของสองฝั่งเป็นคนละชุด ถ้าเขียนข้ามกันจะได้ "ฉัน" ที่ไม่มีตัวตน (`rememberMe` เลือกที่เก็บตามโหมดปัจจุบัน)

### API ของ `Store`

- **ข้อมูล/สถานะ**: `state`, `ready`, `mode`, `group`, `isHost`, `myMemberId`, `remoteEnabled`
- **ธีม** (device preference): `theme` (`'light'|'dark'`, default `'dark'`), `toggleTheme()`, `setTheme(t)` — ไม่อยู่ใน `AppState`, ไม่ sync ขึ้น server (ดู §5.1); หน้าจอดึง palette ผ่าน `useTheme()` ใน `src/ui/theme.ts`
- **สมาชิก**: `addMember(name, consumes, promptPay?)`, `updateMember`, `removeMember`, `toggleArrived`, `toggleLeft`
- **บิล/เมนู**: `addBill(name, category)` (คืน id), `updateBill`, `removeBill`, `addItem`, `updateItem`, `removeItem`, `toggleItemParticipant`
- **อื่น ๆ**: `setVenue`, `setMe(memberId | null)`, `toggleSettlement(key)`, `closeGroup()`
  (+ `reset()` ที่ล้าง state เป็นว่างในโหมดปัจจุบัน — **ยังไม่มี call site ในแอปเลย**; หน้าสรุปใช้ `closeGroup()` แทน)
- **วง (group)**: `createGroup(groupName)`, `joinGroup(code)`, `claimMember(memberId)`, `joinAsNewMember(name, consumes)`, `leaveGroup()`

พฤติกรรมที่ต้องรู้:

- **`isHost`** = เราเป็นคนสร้างวงนี้ไหม (เทียบ `groups.created_by` กับ uid ปัจจุบัน); local mode = `true` เสมอ
  ใช้เลือกข้อความ/ผลของปุ่มปิดวง — **ลบวงทั้งวงได้เฉพาะ host** (RLS บังคับ ดู §6.1)
- **`closeGroup()`**: local → ล้าง state เป็นว่าง · group + host → ลบ row ของวง (cascade ลบทุกอย่างของทุกคน) · group + ไม่ใช่ host → ลบเฉพาะแถวของตัวเองใน `group_participants` แล้วกลับ local mode
- **`toggleSettlement(key)`**: group mode ยิง RPC `settlement_toggle` ที่ append/remove **แบบ atomic ฝั่ง Postgres** → สองคนติ๊กพร้อมกันไม่ทับกัน
- **prune settlements อัตโนมัติ**: ทุก mutation ที่กระทบยอด (เพิ่ม/ลบสมาชิก, แก้/ลบบิล, แก้เมนู ฯลฯ) ผ่าน `commitPrune` ซึ่งเรียก `pruneSettlements()` ให้เอง และ sync การตัดขึ้น server ด้วย RPC `settlements_prune`; ทำตอนโหลด state จากเครื่องด้วย
  **prune ทุกเคสรวมบิลโหมด `time` ที่ยังมีคนไม่กลับ** (ไม่มีข้อยกเว้นแล้ว): `settleUp` ติด `stamp` ให้รายการที่ยอดลอย → `transferKey` นิ่งข้าม `asOf` ที่ต่างกัน จึง prune ที่ `asOf = ตอนนี้` ได้ชุด key เดียวกับที่หน้าจอใช้ ไม่ลบติ๊กที่ยังใช้อยู่ (ดู §4.6)
  เคสเดียวที่ key หายเพราะเวลา: หนี้ของคนที่กลับไปแล้วเจือจางจนเหลือ ฿0 → รายการนั้นหลุดจากทั้ง prune และหน้าจอพร้อมกัน (คิดจาก `settleUp(state, now)` ชุดเดียวกัน) ผู้ใช้ไม่เห็นแถวนั้นอยู่ดี
- **RPC ยังไม่มีใน DB** (project ที่ยังไม่ได้รัน `patch-004`) → ตรวจ error `PGRST202`/`42883` แล้วถอยไปเขียน `settlements` ทั้ง array (ใช้ได้ แต่ไม่ atomic — ควรรัน patch)
- **`removeMember` ล้างการอ้างอิงในทุกบิลด้วย**: เคลียร์ `paidById` ที่ชี้ถึงคนนั้น, ถอดออกจาก `memberIds` และ `item.participantIds` — กันข้อมูลค้าง (group mode ทำทั้งฝั่ง server ด้วย)
- **กัน race ของ realtime**: มี generation counter — ผลลัพธ์ refetch รอบเก่าที่มาช้าจะถูกทิ้ง ไม่ทับ state ที่ใหม่กว่า; ทุก mutation คำนวณจาก `stateRef` (กระจกเงาของ state ล่าสุด) ไม่ใช่จาก closure
- **ลำดับแถวต้องนิ่ง (deterministic)**: `fetchGroupState()` สั่ง `.order()` ทั้ง 3 ตาราง (`members`/`bill_items` ตาม `created_at`, `bills` ตาม `created_at_ms`) + tiebreak `id` เสมอ แล้ว **เรียงซ้ำฝั่ง client** อีกชั้น (`sortByTimeThenId`)
  project เก่าที่ยังไม่มีคอลัมน์เวลา → `selectOrdered()` จับ error `42703`/`PGRST204` แล้วถอยไปดึงแบบไม่ order (ลำดับยังนิ่งเพราะฝั่ง client ตกไปเรียงตาม `id`)
  `createGroup()` ตอน migrate local → วง ส่ง `created_at` เองด้วย `seqStamp(base, i)` ไล่ทีละ 1 ms เพราะ **`now()` ของ Postgres คงที่ทั้งทรานแซกชัน** (insert ชุดเดียวจะได้เวลาเท่ากันหมด ลำดับเดิมหาย)
  เหตุผลที่เรื่องนี้สำคัญถึงขั้นเป็น invariant: ดู §4.5.1

> id ใช้ UUID (`uuid()` ใน `src/utils/id.ts`) เพื่อไม่ให้ชนเมื่อหลายเครื่องสร้างพร้อมกัน; โค้ดเชิญใช้ `inviteCode()`
> auth เป็น **anonymous sign-in** (`signInAnonymously`) — ต้องเปิดใน Supabase ก่อน ไม่งั้นเข้าวงไม่ได้ (login เต็มรูปเป็นงาน Phase 2)

### 6.1 Backend (Supabase) — สิ่งที่ฝั่ง DB บังคับไว้

ไฟล์ SQL อยู่ที่ `infra/supabase/` (ดู [../infra/supabase/README.md](../infra/supabase/README.md) สำหรับขั้นตอนติดตั้ง)

- ทุกตารางเปิด **RLS** และให้สิทธิ์ผ่านการเป็นสมาชิกวงใน `group_participants`
- **`groups.created_by`** = host ของวง; ลบวงได้เฉพาะ host, และห้ามแก้ `created_by`/`invite_code` ภายหลัง (trigger กัน)
- **เข้าวงต้องผ่าน RPC `join_group(code)`** (`security definer`) — client ไม่มีสิทธิ์ insert `group_participants` ให้ตัวเองตรง ๆ (กันแอบเพิ่มตัวเองเข้าวงคนอื่น)
- **RPC `settlement_toggle(p_group_id, p_key, p_done)` / `settlements_prune(p_group_id, p_keep)`** — แก้ `settlements` แบบ atomic
- `bills.paid_by_id` → `on delete set null` (ลบสมาชิกแล้วบิลไม่พัง)
- ตารางอยู่ใน publication `supabase_realtime` + `replica identity full` เพื่อให้ realtime ส่ง event ครบ
- **คอลัมน์เวลาสำหรับเรียงลำดับ + index `(group_id, <เวลา>, id)`** ให้ตรงกับ `order by` ที่แอปใช้ (`patch-005`)
  ไม่รัน `patch-005` ก็ยังใช้งานได้ (ฝั่ง client เรียงซ้ำให้อยู่แล้ว) แต่ไม่มี index รองรับ
- **ยังไม่มีไฟล์ SQL ไหนถูกรันกับ Postgres จริงเลย** — ควรลองบน staging/branch ก่อน (ดู [../infra/supabase/README.md](../infra/supabase/README.md))

---

## 7. Location / geofence (`src/utils/geo.ts`)

- `distanceM(a, b)` — ระยะทางระหว่างสองพิกัด (เมตร) ด้วยสูตร haversine
- ใช้ในหน้าสรุป: เทียบระยะจาก `venue` กับตำแหน่งปัจจุบัน แล้วบอกว่า "ยังอยู่ในพื้นที่" หรือ "ออกนอกพื้นที่"
- **ทดสอบบนเว็บไม่ได้** (ฟีเจอร์ถูกซ่อนด้วย `Platform.OS !== 'web'`) — ถ้าจะเทสต้องเทส unit ของ `distanceM` ตรง ๆ

---

## 8. การทดสอบ

- **E2E (`tests/e2e/`)** — Playwright บน **web build** (`expo export` → serve `dist` ที่ port 4599; config จัดการ build+serve ให้เอง)
  ครอบ **local mode** เท่านั้น (บังคับไม่ให้อ่าน env Supabase) — group mode ยังไม่มีเทสอัตโนมัติ
  ทุกเทสเรียก `freshPage()` ล้าง localStorage ทั้ง 4 คีย์ก่อน (รวม `hanmao:theme:v1`) ไม่งั้นข้อมูล/ตัวตน "ฉัน"/ธีมของเทสก่อนค้าง
  ปุ่มลบใช้ `window.confirm` บนเว็บ → เทสต้องดัก `page.once('dialog', d => d.accept())`
- **Unit (`tests/unit/`)** — เทส logic ล้วน (`src/domain/**`, `src/utils/**`, `src/ui/index.ts`) โดยส่งเวลาเข้าทาง `asOf` ให้ deterministic
  รวม invariant ของโดเมนที่วัดด้วย fuzz (seed คงที่): ผลลัพธ์ไม่ขึ้นกับลำดับแถว (§4.5.1) และติ๊ก "โอนแล้ว" ต้องไม่หลุดเมื่อเวลาเดินไปเอง (§4.5) — **fuzz ครอบวง ≤10 คน**
- **ฟีเจอร์ที่เทสอัตโนมัติไม่ครอบ**: geofence/location (ซ่อนด้วย `Platform.OS !== 'web'`), การแชร์รูปบน native, group mode (E2E ถูกบังคับเป็น local mode → พฤติกรรม "สองเครื่องเห็นตรงกัน" ยังไม่มีเทสอัตโนมัติ), SQL ทุกไฟล์ยังไม่เคยรันกับ Postgres จริง

> รายชื่อไฟล์เทส คำสั่งรัน และกฎการเขียนที่เป็นปัจจุบัน ดู [../tests/e2e/README.md](../tests/e2e/README.md) และ [../tests/unit/README.md](../tests/unit/README.md)

---

## 9. Flow ตัวอย่าง (end-to-end)

1. เพิ่มสมาชิก: แดง (both), ดำ (drink) — ดำมาสาย
2. สร้างบิล "อาหาร" (category=food) → แดงร่วมคนเดียว (ดำกิน drink อย่างเดียว ถูกกรองออกอัตโนมัติ), คนจ่าย=แดง
3. สร้างบิล "เหล้า" (category=drink) → ทั้งคู่ร่วม, คนจ่าย=ดำ, ใส่ service 10% + VAT 7%
4. หน้าสรุปคำนวณ: ยอดต่อคน, แยกตามบิล, และ settle-up ว่าใครโอนเท่าไรให้ใคร โดยหักลบว่าใครออกเงินบิลไหนไปแล้ว

---

## 10. ยังไม่ได้ทำ (backlog)

สแกนใบเสร็จ OCR · geofence จับเวลามา-กลับอัตโนมัติ · QR PromptPay สร้างจากยอดจริง · กลุ่มเพื่อนประจำ + ประวัติการหาร · login เต็มรูป (link anonymous → บัญชีถาวร) + presence ใครกำลังแก้บิลไหน (Phase 2)

> ทำแล้ว (ย้ายออกจาก backlog): แชร์วง real-time หลายคน (Supabase group mode) · เข้าร่วมผ่าน invite link/QR · พร้อมเพย์ให้ copy ตอนโอน · แชร์การ์ดสรุปเป็นรูป · checklist โอนแล้ว/ปิดวง
