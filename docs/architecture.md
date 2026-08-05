# สถาปัตยกรรม — หารเมา (hanmao)

## เลเยอร์

```
app/                 UI (expo-router, file-based) — ต้องอยู่ที่ root ตามข้อกำหนด expo-router
  _layout.tsx        Bottom Tabs (หน้าแรก/สมาชิก/บิล/สรุป/ฉัน) + StoreProvider + ปุ่มสลับธีมบน header
  index / members / bills / bill/[id] / summary / me
  group / join/[code]   จัดการกลุ่ม + เข้าร่วมผ่าน invite/QR (group mode)
src/
  ui/index.ts        presentation pure (palette 2 ชุด darkColors/lightColors + colors, baht, a11y, labels, confirmRemove/confirmAction/notify/friendlyError)
  ui/theme.ts        hook useTheme() ห่อ store → คืน palette ปัจจุบัน (แยกจาก index.ts เพื่อคง index.ts pure)
  ui/share.ts        จับภาพ View → รูป (web: ดาวน์โหลด, native: share sheet)
  domain/            โดเมน + สูตรหาร (types.ts, split.ts) — pure, ไม่มี side-effect
  data/              state + persistence (store.tsx dual-mode, supabase.ts client, remote.ts map+realtime)
  utils/             ยูทิลิตี้ทั่วไป (geo.ts, id.ts)
tests/e2e/           Playwright (web build, local mode)
tests/unit/          เทส logic ล้วน (domain/utils/ui) — ส่งเวลาเข้าทาง `asOf` ให้ deterministic
tests/server/        static server (SPA fallback) ที่ playwright ใช้เสิร์ฟ `dist`
docs/                เอกสาร + ADR
infra/supabase/      schema.sql + patch-NNN-*.sql + การตั้งค่า backend (ต้องรันเองใน SQL Editor)
scripts/             smoke-supabase.mjs (ตรวจ backend/RLS/RPC ก่อนใช้ group mode)
config/              .env.example
```

## ทิศทางการพึ่งพา
`app` → `src/{ui,domain,data,utils}`; `data` → `domain` (+ supabase); `domain` ไม่พึ่งใคร (pure)
`ui/share.ts` พึ่ง native module (`react-native-view-shot`, `expo-sharing`) — web มี fallback ดาวน์โหลด

## โดเมนต้อง pure จริง: กฎ `asOf`
`src/domain/split.ts` **ห้ามมี `Date.now()`** — ฟังก์ชันที่ต้องรู้ "ตอนนี้" (คนที่ยังไม่กลับ ในบิลโหมด `time`)
รับ `asOf?: number` เป็นพารามิเตอร์สุดท้าย ผู้เรียกเป็นคนหาเวลาให้ **ครั้งเดียวต่อ render** แล้วส่งค่าเดียวกันเข้าทุก call
(ไม่งั้นยอดต่อคนกับรายการโอนในหน้าเดียวกันจะคิดจากเวลาต่างกัน) — รายละเอียดที่ [SPEC.md](SPEC.md) §4.0

## โมเดลข้อมูล & สูตรหาร
ดู [SPEC.md](SPEC.md) — โมเดล (Member/Bill/BillItem/AppState + `settlements`), กติกา array ว่าง = "ทุกคนที่เข้าเงื่อนไข",
วิธีหาร 3 โหมด (equal/itemized/time), บิลเลี้ยง, `billIssues`/`billComplete`,
settle-up (คิดบนสตางค์จำนวนเต็ม) + `transferKey` / `nothingOwed` / `pruneSettlements`

สองสมบัติของโดเมนที่ผูกกับเลเยอร์อื่น (รายละเอียด: [SPEC.md](SPEC.md) §4.5–4.6):

- **`settleUp` มี 2 โหมด** — ยอดนิ่ง = greedy min-transfer; ยอดลอยตามเวลา (บิลโหมด `time` + ยังมีคนไม่กลับ)
  = **star** ทุกคนมีเส้นเดียวกับ hub เดียวที่เลือกจากข้อมูล ⇒ คู่โอนไม่เปลี่ยนตัวคนเองเมื่อเวลาเดิน
  `transferKey` จึงมี **2 รูปแบบ** (ยอดนิ่งผูกยอด+ทิศ / ยอดลอยผูกคู่คน+ลายนิ้วมือข้อมูล)
  ([ADR 0006](adr/0006-stable-settle-topology.md))
- **ผลลัพธ์ไม่ขึ้นกับลำดับแถวใน array** — tiebreak ชั้นสุดท้ายเป็นรหัสสมาชิก (`byCode`, ไม่ใช่ index, ไม่ใช่ `localeCompare`)
  และบวกเงินด้วย `sumStable()` เสมอ. นี่คือเหตุผลที่ `data/` ต้องดึงแถวแบบเรียงนิ่ง (ดูหัวข้อถัดไป)
  ([ADR 0002 ภาคผนวก](adr/0002-integer-cents-largest-remainder.md))

## State: dual-mode
- **local** — AsyncStorage คีย์ `hanmao:state:v1` (คนเดียว, offline). เทส e2e ครอบโหมดนี้
- **group** — Supabase Postgres + Realtime เมื่อเข้าร่วมกลุ่ม (หลายคนแก้พร้อมกัน)
  หน้าจอเรียกผ่าน `useStore()` เดิม — store apply optimistic ทันที + ยิง row-level ops ผ่าน `remote.ts`
  แล้ว subscribe realtime → refetch ประกอบกลับเป็น `AppState`. ไม่มี env Supabase → บังคับ local
- คีย์ local เสริม: `hanmao:session:v1` (จำกลุ่ม/ตัวตนกลับเข้ากลุ่มเดิม), `hanmao:me:v1` ("ฉันคือใคร" โหมด local)
- **ธีม** (สว่าง/มืด) เป็น **device preference** ไม่อยู่ใน `AppState` และไม่ sync ขึ้น Supabase —
  persist แยก **คีย์ที่ 4 `hanmao:theme:v1`** (string `'light'`/`'dark'`), default มืด, ไม่มีโหมด auto
  store มี `theme`/`toggleTheme()`/`setTheme()`; หน้าจอดึง palette ผ่าน `useTheme()` (`src/ui/theme.ts`)
  และสร้างสไตล์ด้วย factory `makeStyles(c)` + `useMemo(() => makeStyles(c), [c])` ต่อ render
  (ห้าม `StyleSheet.create` ระดับ module ด้วยสีธีม — จะแช่แข็งสี สลับไม่ได้; ดู [ADR 0007](adr/0007-runtime-theme-switch.md))
- `settlements` (ติ๊กโอนแล้ว) persist เหมือน `venue`: localStorage ใน local / คอลัมน์ `groups.settlements` ใน group
  group mode แก้ผ่าน RPC (`settlement_toggle`/`settlements_prune`) ให้ atomic — สองคนติ๊กพร้อมกันไม่ทับกัน
- **การ fetch แถวต้องเรียงนิ่ง**: `fetchGroupState()` สั่ง `.order(<เวลา>)` + tiebreak `id` ทั้ง `members`/`bills`/`bill_items`
  แล้ว **เรียงซ้ำฝั่ง client** อีกชั้น (`sortByTimeThenId`) เป็นด่านสุดท้าย; project เก่าที่ไม่มีคอลัมน์เวลา →
  `selectOrdered()` ถอยไปดึงแบบไม่ `order` (ยังนิ่งเพราะตกไปเรียงตาม `id`)
  ตอน migrate local → กลุ่ม (`createGroup`) ต้องส่ง `created_at` เองด้วย `seqStamp()` ไล่ทีละ 1 ms
  เพราะ `now()` ของ Postgres คงที่ทั้งทรานแซกชัน. index ฝั่ง DB อยู่ใน `patch-005-stable-order.sql`
  เหตุผลที่เรื่องนี้กระทบ **ตัวเงิน** ไม่ใช่แค่ลำดับรายชื่อบนจอ: ดูหัวข้อ "โมเดลข้อมูล & สูตรหาร" ด้านบน
- สิทธิ์ในกลุ่มบังคับที่ RLS: เข้ากลุ่มผ่าน RPC `join_group(code)` เท่านั้น, ลบกลุ่มได้เฉพาะผู้สร้าง (`groups.created_by` → `isHost`)
- group mode ต้อง **ตั้งค่ามือ** ก่อน (รัน SQL ตามลำดับ ล่าสุด `patch-005` + เปิด Anonymous sign-in + ใส่ env) —
  ขั้นตอนอยู่ที่ [../README.md](../README.md) และ [../infra/supabase/README.md](../infra/supabase/README.md)
  (**ยังไม่มีไฟล์ SQL ไหนถูกรันกับ Postgres จริง** และ group mode ไม่มี E2E ครอบ เพราะ E2E ถูกบังคับเป็น local mode)

## บันทึกการตัดสินใจ (ADR)
- [0001](adr/0001-supabase-realtime.md) เลือก Supabase สำหรับกลุ่มหลายคน real-time
- [0002](adr/0002-integer-cents-largest-remainder.md) คิดเงินบนสตางค์จำนวนเต็ม + largest remainder
- [0003](adr/0003-transfer-key-amount-bound.md) `transferKey` ผูกกับยอดเงิน
- [0004](adr/0004-no-promptpay-in-shared-image.md) ไม่ใส่เบอร์พร้อมเพย์ในรูปสรุปที่แชร์
- [0005](adr/0005-group-host-and-rpc-only-join.md) host เป็นเจ้าของกลุ่ม + เข้ากลุ่มผ่าน RPC เท่านั้น
- [0006](adr/0006-stable-settle-topology.md) คู่โอนต้องนิ่งเมื่อยอดลอยตามเวลา (star + `transferKey` 2 รูปแบบ)
- [0007](adr/0007-runtime-theme-switch.md) สลับธีมสว่าง/มืดตอน runtime (palette 2 ชุด + `useTheme` + `makeStyles`)
