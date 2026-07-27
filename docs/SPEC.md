# SPEC — ฮารเหมา (hanmao)

เอกสารอธิบาย **การทำงานของแอป** (behavior spec) สำหรับอ้างอิงในรอบต่อ ๆ ไป
เน้นว่า "แอปทำอะไร / คิดเงินยังไง / แต่ละหน้าทำงานยังไง" — ส่วนแนวปฏิบัติการเขียนโค้ดอยู่ที่ [CLAUDE.md](CLAUDE.md)

> เวอร์ชัน: MVP (local-only, ยังไม่มี backend) · UI ภาษาไทย · ธีมมืด · iOS / Android / Web จาก codebase เดียว

---

## 1. ภาพรวม

ฮารเหมาเป็นแอป **หารค่าอาหาร/เครื่องดื่ม** สำหรับกลุ่มเพื่อนในบริบทร้านไทย
โจทย์หลักที่แก้:

1. ในหนึ่งวงมี **หลายบิล** (เช่น ค่าอาหาร บิลนึง ค่าเหล้าอีกบิลนึง) และ **คนจ่ายแต่ละบิลอาจเป็นคนละคน**
2. คนในวง **มาไม่พร้อมกัน / กลับไม่พร้อมกัน** → บางคนไม่ควรร่วมจ่ายบางบิล
3. บางคน **กินเฉพาะอาหาร** หรือ **เฉพาะเครื่องดื่ม** → ไม่ควรโดนหารบิลที่ตัวเองไม่ได้กิน
4. มีค่า **service charge / VAT / ส่วนลด** ต้องเฉลี่ยให้ยุติธรรม
5. สุดท้ายสรุปว่า **ใครต้องโอนให้ใครเท่าไร** โดยจำนวนการโอนน้อยที่สุด
6. (มือถือ) เช็ก **location** ว่าคนที่จะกลับก่อนยังอยู่ในพื้นที่ร้านไหม

ทุก state เก็บใน **AsyncStorage** (บนเว็บคือ localStorage key `hanmao:state:v1`) — ไม่มีเซิร์ฟเวอร์ ไม่มีบัญชีผู้ใช้

---

## 2. โมเดลข้อมูล (`src/lib/types.ts`)

```
AppState
├─ members: Member[]
├─ bills:   Bill[]
└─ venue:   { lat, lng, radiusM } | null   // พื้นที่ร้านสำหรับ geofence
```

### Member (สมาชิก)
| ฟิลด์ | ชนิด | ความหมาย |
|---|---|---|
| `id` | string | id ภายใน |
| `name` | string | ชื่อที่แสดง |
| `consumes` | `'both' \| 'food' \| 'drink'` | กินอะไร — ใช้กรองว่าร่วมบิลหมวดไหนได้ |
| `arrivedAt` | number \| null | เวลามาถึง (epoch ms); `null` = อยู่ตั้งแต่ต้น |
| `leftAt` | number \| null | เวลากลับ (epoch ms); `null` = ยังไม่กลับ |

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

## 4. ตรรกะการหาร (`src/lib/split.ts`)

หัวใจของแอป เป็น **pure functions** ล้วน (ไม่แตะ state/side-effect) — ถ้าจะแก้สูตร แก้ที่นี่ที่เดียว

### 4.1 `computeBill(bill, members) → BillBreakdown`

ขั้นตอน:

1. **หาผู้ร่วมบิล** ด้วย `billMembers()`
2. **คิดยอดดิบต่อคน (raw)** ตาม `splitMode`:
   - **`equal`** — `subtotal / จำนวนผู้ร่วม` เท่ากันทุกคน
   - **`itemized`** — วนแต่ละเมนู หารราคาเมนูนั้นในกลุ่ม `participantIds` (ว่าง = ผู้ร่วมบิลทั้งหมด) แล้วบวกสะสมต่อคน
   - **`time`** — เฉลี่ยตามสัดส่วนเวลาที่อยู่: หน้าต่างเวลา = ตั้งแต่คนแรกมาถึงจนคนสุดท้ายกลับ; น้ำหนักแต่ละคน = ช่วงเวลาที่ทับซ้อน (`overlapMs`); คนที่ค่าน้ำหนัก 0 นับเป็น 1 กันหารศูนย์
3. **ใส่ค่าบริการ/ภาษี/ส่วนลด แบบสัดส่วน**:
   ```
   service = subtotal × serviceChargePct/100
   vat     = (subtotal + service) × vatPct/100
   total   = subtotal + service + vat − discount
   factor  = total / subtotal        (ถ้า subtotal = 0 → factor = 0)
   ยอดต่อคน = raw ต่อคน × factor
   ```
   → ค่าบริการ/ภาษี/ส่วนลดถูกกระจายตามสัดส่วนยอดดิบของแต่ละคนโดยอัตโนมัติ

**คืนค่า:** `{ perMember: Map<id, number>, subtotal, service, vat, discount, total }`

### 4.2 `computeTotals(state) → { perMember, grandTotal }`
รวม `computeBill` ของทุกบิล → ยอดที่แต่ละคนต้องจ่ายรวม + ยอดรวมทั้งหมด

### 4.3 `computeNetBalances(state) → Map<id, number>`
ยอดสุทธิของแต่ละคน:
```
เริ่มทุกคน = 0
สำหรับแต่ละบิล:
  − (ยอดที่คนนั้นต้องรับผิดชอบ)      // ลบส่วนที่ตัวเองต้องจ่าย
  + (ยอดเต็มบิล ให้กับ bill.paidById)  // คนที่ออกเงินได้เครดิตคืน
```
- **net > 0** = ออกเงินเกิน คนอื่นติดเงินเรา (ได้คืน)
- **net < 0** = เราติดเงินคนอื่น (ต้องจ่าย)

### 4.4 `settleUp(state) → Transfer[]`
**Greedy min-transfer**: แยกคนเป็นเจ้าหนี้ (net>0) กับลูกหนี้ (net<0) เรียงมาก→น้อย แล้วจับคู่โอนทีละคู่ (โอนเท่าจำนวนที่น้อยกว่าเสมอ) จนหมด → ได้รายการ `{ fromId, toId, amount }` ที่จำนวนการโอนน้อยที่สุด

> threshold 0.005 กันเศษ floating point; `round2()` ปัด 2 ตำแหน่ง

---

## 5. หน้าจอและพฤติกรรม (`app/`)

Navigation = **bottom tabs** 4 แท็บ (ตั้งใน `app/_layout.tsx`) + หน้ารายละเอียดบิลที่ซ่อนจากแท็บ

### 🏠 หน้าแรก (`index.tsx`)
- Hero: ยอดรวมทั้งหมด + จำนวนสมาชิก/คนที่ยังอยู่/จำนวนบิล
- **ผู้ใช้ใหม่ (ไม่มีสมาชิก+ไม่มีบิล)** → แสดง onboarding 3 ขั้น + ปุ่ม "เริ่มเลย" ไปหน้าสมาชิก
- **มีข้อมูลแล้ว** → การ์ดทางลัดไป สมาชิก/บิล/สรุป

### 👥 สมาชิก (`members.tsx`)
- ฟอร์มเพิ่ม: ชื่อ + เลือก `consumes` (ปุ่มเพิ่ม **disabled** ถ้ายังไม่กรอกชื่อ)
- แต่ละคน: แก้ `consumes` ได้, ปุ่ม **มาถึง/กลับ** (toggle เวลา), ปุ่ม **ลบ** (ยืนยันก่อน)
- toggle มาถึง = เซ็ต/ล้าง `arrivedAt`; toggle กลับ = เซ็ต/ล้าง `leftAt` (เป็นเวลาปัจจุบัน)

### 🧾 บิล (`bills.tsx` + `bill/[id].tsx`)
- `bills.tsx`: ฟอร์มสร้างบิล (ชื่อ + หมวด; ชื่อว่างได้ → ตั้งชื่อให้อัตโนมัติ) → เข้าหน้ารายละเอียดทันที; ด้านล่างลิสต์บิลพร้อมยอดรวม/หมวด/วิธีหาร/คนจ่าย
- `bill/[id].tsx` (หน้าซับซ้อนสุด):
  - แก้ชื่อบิล (inline)
  - เลือก **วิธีหาร** (equal/itemized/time)
  - **ใครออกเงินบิลนี้** → เซ็ต `paidById` (toggle เลือกได้คนเดียว)
  - **ใครร่วมบิลนี้** → toggle `memberIds` (สำหรับคนมาทีหลัง/กลับก่อน; ไม่เลือก = ทุกคนที่เข้าเงื่อนไข)
  - **เมนู** → เพิ่ม/ลบ; ถ้าโหมด itemized โชว์ชิปเลือกผู้ร่วมต่อเมนู
  - **ค่าบริการ/VAT/ส่วนลด** → input ตัวเลข
  - **สรุปบิล** (subtotal/service/vat/discount/total) + **ยอดต่อคนในบิลนี้**
  - ปุ่ม **ลบบิล** (ยืนยันก่อน) → กลับหน้าก่อนหน้า

### 💰 สรุป (`summary.tsx`)
- Hero: ยอดรวมทุกบิล
- **ยอดที่แต่ละคนต้องจ่าย** (จาก `computeTotals`)
- **แยกตามบิล** — ต่อบิลแสดง: ยอดรวม, หมวด·วิธีหาร·คนออกเงิน, และรายชื่อผู้ร่วม + ยอดที่แต่ละคนจ่าย (คนจ่ายมี tag `(คนจ่าย)`)
- **ใครโอนให้ใคร** (จาก `settleUp`)
- **สถานะแต่ละคน** — ได้คืน/ต้องจ่าย (จาก `computeNetBalances`)
- **เช็กพื้นที่ร้าน** — เฉพาะ iOS/Android (`Platform.OS !== 'web'`): ปุ่มตั้งพิกัดร้าน (รัศมี 150 ม.) + ปุ่มเช็กระยะจากตำแหน่งปัจจุบัน

---

## 6. State management (`src/store/store.tsx`)

- `StoreProvider` ครอบทั้งแอปใน `_layout.tsx`; ทุกหน้าเรียกผ่าน `useStore()`
- โหลด state จาก AsyncStorage ตอน mount (ตั้ง flag `ready`), auto-save ทุกครั้ง state เปลี่ยน
- API: `addMember`, `updateMember`, `removeMember`, `toggleArrived`, `toggleLeft`, `addBill` (คืน id), `updateBill`, `removeBill`, `addItem`, `updateItem`, `removeItem`, `toggleItemParticipant`, `setVenue`, `reset`
- **`removeMember` ล้างการอ้างอิงในทุกบิลด้วย**: เคลียร์ `paidById` ที่ชี้ถึงคนนั้น, ถอดออกจาก `memberIds` และ `item.participantIds` — กันข้อมูลค้าง

---

## 7. Location / geofence (`src/lib/geo.ts`)

- `distanceM(a, b)` — ระยะทางระหว่างสองพิกัด (เมตร) ด้วยสูตร haversine
- ใช้ในหน้าสรุป: เทียบระยะจาก `venue` กับตำแหน่งปัจจุบัน แล้วบอกว่า "ยังอยู่ในพื้นที่" หรือ "ออกนอกพื้นที่"
- **ทดสอบบนเว็บไม่ได้** (ฟีเจอร์ถูกซ่อนด้วย `Platform.OS !== 'web'`) — ถ้าจะเทสต้องเทส unit ของ `distanceM` ตรง ๆ

---

## 8. การทดสอบ (E2E ด้วย Playwright, โฟลเดอร์ `e2e/`)

- รันบน **web build** (`expo export` → serve `dist` ที่ port 4599) — config จัดการ build+serve ให้เอง
- ทุกเทสเรียก `freshPage()` ล้าง localStorage ก่อน
- ครอบคลุม: หน้าสมาชิก (เพิ่ม/ลบ/toggle/ปุ่ม disable), บิล (สร้าง/เมนู/คนจ่าย), สรุป (แยกตามบิล), navigation (สลับแท็บ/onboarding)
- ปุ่มลบใช้ `window.confirm` บนเว็บ → เทสต้องดัก `page.once('dialog', d => d.accept())`

รัน: `npm run test:e2e` · ดูทีละ step: `npm run test:e2e:ui`

---

## 9. Flow ตัวอย่าง (end-to-end)

1. เพิ่มสมาชิก: แดง (both), ดำ (drink) — ดำมาสาย
2. สร้างบิล "อาหาร" (category=food) → แดงร่วมคนเดียว (ดำกิน drink อย่างเดียว ถูกกรองออกอัตโนมัติ), คนจ่าย=แดง
3. สร้างบิล "เหล้า" (category=drink) → ทั้งคู่ร่วม, คนจ่าย=ดำ, ใส่ service 10% + VAT 7%
4. หน้าสรุปคำนวณ: ยอดต่อคน, แยกตามบิล, และ settle-up ว่าใครโอนเท่าไรให้ใคร โดยหักลบว่าใครออกเงินบิลไหนไปแล้ว

---

## 10. ยังไม่ได้ทำ (backlog)

แชร์ลิงก์บิล real-time · สแกนใบเสร็จ OCR · geofence จับเวลามา-กลับอัตโนมัติ · QR PromptPay · กลุ่มเพื่อนประจำ + ประวัติ · backend/sync ข้ามเครื่อง
