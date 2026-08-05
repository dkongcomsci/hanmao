# CLAUDE.md

คู่มือสำหรับ AI ที่มาทำงานต่อในโปรเจกต์นี้ อ่านก่อนเริ่มแก้โค้ด

## โปรเจกต์นี้คืออะไร

**หารเมา (hanmao)** — แอปหารค่าอาหาร/เครื่องดื่ม (bill splitting) สำหรับกลุ่มเพื่อน
บริบทร้านไทย (VAT 7%, service charge 10%, PromptPay) ภาษา UI เป็นภาษาไทย

> อยากเข้าใจ **การทำงานของแอปแบบละเอียด** (โมเดลข้อมูล, สูตรหาร, พฤติกรรมแต่ละหน้า) อ่าน [docs/SPEC.md](docs/SPEC.md)
> ภาพรวมสถาปัตยกรรม/เลเยอร์ อ่าน [docs/architecture.md](docs/architecture.md)
> ไฟล์นี้ (CLAUDE.md) เน้น **แนวปฏิบัติการเขียนโค้ด** ให้เข้ากับของเดิม; กฎแยกตามขอบเขตอยู่ที่ [.claude/rules/](.claude/rules/)

## Tech stack

- **Expo ~57** + **React Native 0.86** + **TypeScript** (strict)
- **expo-router** — file-based routing (โฟลเดอร์ `app/`)
- **@react-native-async-storage/async-storage** — persist state (local mode)
- **@supabase/supabase-js** — Postgres + Realtime สำหรับกลุ่มหลายคน (group mode; ทำงานเมื่อมี env)
- **expo-location** — เช็ก geofence พื้นที่ร้าน
- **react-native-view-shot** + **expo-sharing** — export การ์ดสรุปเป็นรูป
- **react-native-qrcode-svg** + **expo-linking** — QR/ลิงก์เชิญเข้ากลุ่ม (deep link `hanmao://join/<code>`)
- **expo-clipboard** — คัดลอกพร้อมเพย์/ลิงก์เชิญ
- Deploy ได้ทั้ง **iOS / Android / Web** จาก codebase เดียว

## คำสั่งที่ใช้บ่อย

```bash
npm run web            # dev บนเบราว์เซอร์
npm run ios            # iOS simulator
npm run android        # Android emulator
npx tsc --noEmit       # typecheck (ต้องผ่านก่อน commit)
npx expo export --platform web   # ตรวจว่า bundle web compile ได้
```

หลังแก้โค้ดให้รัน `npx tsc --noEmit` เสมอ ก่อนถือว่าเสร็จ ถ้าแตะ UI/logic ที่มีเทสครอบ ให้รันเทสด้วย —
คำสั่งเทสดูใน `package.json` (`scripts`) และรายละเอียดที่ [tests/e2e/README.md](tests/e2e/README.md) / [tests/unit/README.md](tests/unit/README.md) ซึ่งเป็นแหล่งอ้างอิงล่าสุด

## โครงสร้างและหน้าที่ของแต่ละไฟล์

```
app/                     หน้าจอ (expo-router) — ต้องอยู่ที่ root ตามข้อกำหนด expo-router
  _layout.tsx            Bottom Tabs + StoreProvider + SafeArea + ปุ่มสลับธีมบน header (แท็บ: หน้าแรก/สมาชิก/บิล/สรุป/ฉัน, ไอคอน emoji)
  index.tsx              หน้าแรก — onboarding 3 ขั้น (แสดงเสมอ) + ปุ่มไอคอน 3 ปุ่ม (หารคนเดียว→members / หารหลายคน→group / เริ่มทำรายการใหม่=reset ผ่าน confirmAction) + แถบกลุ่มเมื่ออยู่ในกลุ่ม (ไม่มี hero ยอดรวมแล้ว)
  members.tsx            จัดการสมาชิก (ชื่อ, กินอะไร, พร้อมเพย์—บันทึกเมื่อกดปุ่ม) — ปุ่ม "มาถึง"/"กลับ" ปิดไว้ชั่วคราว (คู่กับโหมดเวลาที่ปิดอยู่)
  bills.tsx              รายการบิล + สร้างบิลใหม่
  bill/[id].tsx          รายละเอียดบิล (เมนู, คนจ่าย, ผู้ร่วม, ค่าบริการ, บิลเลี้ยง) — หน้าซับซ้อนสุด · แก้แบบ draft แล้วกด "บันทึก" (เรียก saveBill) → Modal เลือกไป bills/summary
  summary.tsx            สรุปยอดต่อคน + settle-up + checklist โอนแล้ว + แชร์รูป + เคลียร์/ปิดกลุ่ม + เช็ก location
  me.tsx                 สรุปของฉัน (ฉันต้องโอน/ต้องรับ + checklist + พร้อมเพย์)
  group.tsx              สร้าง/จัดการกลุ่ม + QR/ลิงก์เชิญ + ออกจากกลุ่ม (group mode)
  join/[code].tsx        เข้าร่วมกลุ่มจาก deep link (claim member เดิม หรือสร้างใหม่) → ผูกตัวตนสำเร็จแล้วไปหน้าสรุป (/summary)
src/
  domain/types.ts        โดเมนหลัก (Member, Bill, BillItem, AppState, Group) — เริ่มอ่านที่นี่
  domain/split.ts        ตรรกะการหารทั้งหมด + settle-up 2 โหมด (greedy/star) + transferKey 2 รูปแบบ +
                         amountsDrift/splitStamp/settleHub/nothingOwed/pruneSettlements/billIssues/sumStable/byCode (pure, ไม่มี Date.now())
  utils/geo.ts           haversine ระยะทางระหว่างพิกัด
  utils/id.ts            uuid() + inviteCode()
  ui/index.ts            pure helper (ห้าม import store/react): palette 2 ชุด darkColors/lightColors + colors (=dark, backward-compat) +
                         type Palette, baht(), a11y(), timeStr(), label, confirmRemove(), confirmAction(), notify(),
                         friendlyError(), copyText(), digitsOnly(), isValidPromptPay(), formatPromptPay()
  ui/theme.ts            hook useTheme() (ห่อ useStore) คืน { colors: Palette; theme; toggleTheme; setTheme } — แยกจาก index.ts เพื่อคง index.ts pure
  ui/share.ts            จับภาพ View แล้ว export เป็นรูป (web: ดาวน์โหลด, native: share sheet)
  data/store.tsx         React Context + API + persist dual-mode (AsyncStorage local / Supabase group)
  data/supabase.ts       สร้าง Supabase client จาก env (null ถ้าไม่มี env → บังคับ local)
  data/remote.ts         map row ↔ โดเมน + subscribeGroup (realtime) + fetchGroupState
tests/e2e/               Playwright E2E (รันบน web build, local mode) — รายไฟล์ดู tests/e2e/README.md
  helpers.ts             freshPage() ล้าง localStorage 4 คีย์ + helper เตรียมข้อมูล (addMember ฯลฯ)
tests/unit/              เทส logic ล้วน (domain/utils/ui) — ดู tests/unit/README.md
tests/server/            static server แบบ SPA fallback ที่ playwright ใช้เสิร์ฟ dist (ศูนย์ dependency)
docs/                    SPEC.md, architecture.md, adr/ (บันทึกการตัดสินใจ 0001-0007)
infra/supabase/          schema.sql + patch-NNN-*.sql (ต้องรันเองใน SQL Editor; ล่าสุด patch-005) + README ขั้นตอนติดตั้ง
scripts/                 smoke-supabase.mjs (เช็ก backend/RLS/RPC ก่อนใช้ group mode) + watch-agents.sh (ดู log ทีม agent)
config/                  .env.example (เทมเพลต Supabase env; `.env` จริงอยู่ที่ root และ gitignored)
.claude/                 control plane: rules/ skills/ agents/ hooks/
playwright.config.ts     config — auto `expo export` + เสิร์ฟ `dist` ที่ port 4599 ก่อนรันเทส (บังคับ local mode)
```

## ทีม agent (แบ่งงานตามขอบเขตไฟล์)

งานหลายเลเยอร์ → สั่ง **`hanmao-lead`** ให้แตกงานแล้วกระจายให้ลูกทีมทำขนานกัน; งานเลเยอร์เดียว → สั่งตัวที่ตรงขอบเขตไปตรง ๆ

| agent | ขอบเขต |
|---|---|
| `hanmao-lead` | หัวหน้าทีม — แตกงาน/กระจาย/รวมผล (ตัวเดียวที่ delegate ต่อได้) |
| `hanmao-domain` | `src/domain/**`, `src/utils/**` — สูตรหาร, โมเดล, ยูทิลิตี้ pure (`geo.ts`, `id.ts`) |
| `hanmao-frontend` | `app/**`, `src/ui/**` — หน้าจอ |
| `hanmao-data` | `src/data/**`, `infra/supabase/**` — store, persist, SQL |
| `hanmao-test` | `tests/**`, `playwright.config.ts` — เทส E2E + unit ของ logic |
| `hanmao-docs` | ไฟล์ `.md` ทั้งหมด — เอกสาร + ADR |
| `hanmao-reviewer` | อ่านเท่านั้น — รัน tsc/build/เทส + ตรวจกฎ |

ลำดับพึ่งพา: `domain`+`data` (ขนานกันได้) → `frontend` → `test` → `reviewer` → `docs`

**สองกฎที่ทีมนี้ห้ามละเมิด:**
1. **ทำทีละรอบ** — จบรอบ → รายงานว่าแต่ละ agent ทำอะไร/ติดอะไร (ตัวที่ไม่มีงานก็ต้องมีสถานะ) → **หยุดรอผู้ใช้** ห้ามต่อรอบเอง
2. **⛔ เทสเจอเคสแดง = หยุด รายงานผู้ใช้ก่อน ห้ามใครแก้เอง** — ห้ามแก้โค้ดตามเทส และห้ามแก้เทสให้ผ่าน
   เพราะเคสแดงอาจเป็น *เทสคาดผิด* ไม่ใช่โค้ดผิด · ต้องบอก **แดงกี่เคส/ทั้งหมด** + คาด vs ได้จริง + ใครควรแก้

รายละเอียด + เทมเพลตรายงาน + ตัวอย่างหนึ่งรอบเต็ม + วิธีเพิ่ม agent: [.claude/agents/README.md](.claude/agents/README.md)

## โมเดลข้อมูล (สำคัญ — อ่านให้เข้าใจก่อนแก้ logic)

- **Member** มี `consumes: 'both' | 'food' | 'drink'` (กินอะไร), `arrivedAt`/`leftAt` (epoch ms, null = อยู่ตลอด), `promptPay?`, `userId?`
- **Bill** มี `category` (food/drink/mixed), `splitMode`, `items[]`, `memberIds[]`, `paidById`, `isTreat?` (บิลเลี้ยง), `createdAt`, และ `serviceChargePct`/`vatPct`/`discount`
- **AppState** มี `settlements: string[]` (รายการโอนที่ติ๊ก "โอนแล้ว") — key มาจาก `transferKey(t)` เท่านั้น
  **`transferKey` มี 2 รูปแบบ ห้ามประกอบเองเด็ดขาด**:
  ยอดนิ่ง = `` `${fromId}>${toId}@${ยอด 2 ตำแหน่ง}` `` (ผูกทิศทาง+ยอด, [ADR 0003](docs/adr/0003-transfer-key-amount-bound.md)) ·
  ยอดลอยตามเวลา (บิลโหมด `time` + ยังมีคนไม่กลับ) = `` `${idน้อย}|${idมาก}@${stamp}` `` (ผูกคู่คน+ลายนิ้วมือข้อมูล ไม่ผูกยอด ไม่ผูกทิศ, [ADR 0006](docs/adr/0006-stable-settle-topology.md))
  ยอดเปลี่ยน (หรือยอดหยุดลอยเพราะทุกคนกลับแล้ว) → key เดิมไม่แมตช์ = กลับเป็น "ยังไม่โอน" โดยตั้งใจ **ต้องติ๊กใหม่บนยอดปิดจริงก่อนปิดกลุ่ม**
  เช็ก "ไม่มีใครต้องโอนแล้ว" ด้วย `nothingOwed()` · ล้าง key ที่ยอดไม่ตรงด้วย `pruneSettlements()` (prune ได้ทุกเคสแล้ว ไม่มีข้อยกเว้นโหมด time)
- **สำคัญ**: `paidById` = คนออกเงินบิลนั้น **แต่ละบิลอาจคนละคน** — เป็น requirement หลัก อย่าทำหาย
- ฟิลด์ `*Ids` ที่เป็น array ว่าง มีความหมายพิเศษ = "ทุกคนที่เข้าเงื่อนไข":
  - `bill.memberIds` ว่าง → ทุกคนที่ `consumes` ตรงกับ `category`
  - `item.participantIds` ว่าง → ทุกคนในบิล

## ตรรกะการหาร (src/domain/split.ts)

3 โหมด (`bill.splitMode`):
- `equal` — เฉลี่ยเท่ากันทุกคนที่ร่วมบิล
- `itemized` — หารตามผู้ร่วมของแต่ละเมนู (`item.participantIds`)
- `time` — เฉลี่ยตามสัดส่วนเวลาที่อยู่ (ใช้ `arrivedAt`/`leftAt`)

> **หมายเหตุ:** โหมด `time` **ถูกปิดใน UI ชั่วคราว** — `MODES` ใน `bill/[id].tsx` เหลือ `['equal','itemized']` และปุ่ม "มาถึง"/"กลับ" ใน `members.tsx` ถูกปิด. logic โหมด `time` (+ star/`stamp`/`amountsDrift`) ยังอยู่ครบใน `split.ts` และบิลเก่าที่เป็น `time` ยังคำนวณได้ตามเดิม — อย่าลบ logic ออก

ลำดับการคิด: ยอดดิบต่อคนตามโหมด → คูณ factor รวม service+vat-discount แบบสัดส่วน

`settleUp()` มี **2 โหมด** อย่าคิดว่าเป็น greedy อย่างเดียว (ตัดสินด้วย `amountsDrift(state)`):
- ยอดนิ่ง → greedy min-transfer จาก net balance (จ่ายจริง vs ที่ต้องรับผิดชอบ)
- ยอดลอยตามเวลา (บิลโหมด `time` ที่เข้าสรุปแล้ว + มีผู้ร่วมบิลที่ยัง `leftAt == null`) → **star**:
  ทุกคนมีเส้นเดียวกับ hub เดียว (`settleHub` เลือกจากข้อมูลผ่าน `referenceAsOf` ไม่ใช่จากนาฬิกา)
  เพราะ greedy จับคู่จากลำดับยอดที่ลอย ⇒ คู่โอนเปลี่ยนตัวคนเอง ⇒ ติ๊ก "โอนแล้ว" หลุด ⇒ กล่อง 🎉/ปุ่มปิดกลุ่มหายเอง
  ([ADR 0006](docs/adr/0006-stable-settle-topology.md))

- **split.ts ต้อง pure จริง — ห้ามมี `Date.now()`**: ฟังก์ชันที่ต้องรู้ "ตอนนี้" (`computeBill`, `computeTotals`,
  `computeNetBalances`, `settleUp`) รับ `asOf?: number` เป็นพารามิเตอร์สุดท้าย (ไม่ส่ง = ใช้ `bill.createdAt`)
  **ผู้เรียกหา `Date.now()` ครั้งเดียวต่อ render** แล้วส่งค่าเดียวกันเข้าทุก call ไม่งั้นยอดต่อคนกับรายการโอนบนหน้าเดียวจะไม่ตรงกัน
- **คิดเงินบนจำนวนเต็มหน่วยสตางค์** แล้วเกลี่ยเศษแบบ largest remainder → ผลรวม net = 0 พอดี
  ห้ามใส่ threshold ลอย ๆ แบบ `0.005` กลับมา ([ADR 0002](docs/adr/0002-integer-cents-largest-remainder.md))
- **ผลลัพธ์โดเมนห้ามขึ้นกับลำดับแถวใน array** (`state.members`/`state.bills`/`bill.items`) — สลับลำดับแล้วยอด/net/คู่โอน/key ต้องเท่าเดิมทุกทศนิยม
  เพราะโหมดกลุ่มดึงแถวจาก Postgres ที่ลำดับไม่การันตี ⇒ ถ้าผลต่างกัน สองเครื่องจะเห็น "โอนแล้ว/ยังไม่โอน" ไม่ตรงกัน
  - **ห้ามใช้ตำแหน่งแถว (index) เป็น tiebreak** — ชั้นสุดท้ายใช้รหัสสมาชิกผ่าน `byCode()`
  - **ห้ามใช้ `localeCompare` ในเลเยอร์โดเมน** (ผลต่างกันตาม locale) ใช้ `byCode()`
  - **ห้ามบวก float ตรง ๆ ในเส้นทางคิดเงิน** ใช้ `sumStable()` (เรียงค่าก่อนบวก) เพราะการบวก float ไม่ commutative
    ต่างกัน `1e-13` ก็พลิก `Math.round` ในเคสที่ยอดตกลง .5 สตางค์พอดี ⇒ เศษ 1 สตางค์ย้ายคน
  - กระทบทุกโหมดการหาร (equal/itemized/time) — อยู่ที่ชั้นเกลี่ยเศษ ไม่ใช่ชั้นสูตร ([ADR 0002 ภาคผนวก](docs/adr/0002-integer-cents-largest-remainder.md))
- บิลไหน "เข้าสรุปได้" ตัดสินที่ `billIssues()` (คืนเหตุผลภาษาไทยให้ UI แสดง) และ `billComplete()` — แหล่งเดียว ห้ามเช็กเงื่อนไขซ้ำใน UI
- `computeBill()` คืน `soleBearerId?` = คนที่รับยอดเต็มบิลคนเดียว (บิลเลี้ยง หรือไม่มีใครเข้าเงื่อนไขบิล) — UI ใช้บอกผู้ใช้ว่าทำไมยอดไปกองที่คนเดียว อย่าเดาเงื่อนไขนี้เองใน component

**ถ้าจะแก้สูตรหาร แก้ที่ split.ts เท่านั้น — UI แค่เรียกใช้ อย่ากระจาย logic ลง component**
กฎเต็มของโดเมน: [.claude/rules/domain.md](.claude/rules/domain.md)

## การเทส

เทสมี 2 ชุด: **E2E (Playwright)** ใน `tests/e2e/` และ **unit ของ logic** ใน `tests/unit/`
กฎการเขียน/รายชื่อไฟล์/คำสั่งที่เป็นปัจจุบัน อยู่ที่ [tests/e2e/README.md](tests/e2e/README.md) และ [tests/unit/README.md](tests/unit/README.md)
ข้อควรระวังที่กระทบคนเขียน **โค้ดแอป**:

- E2E รันบน **web build** (`expo export` → เสิร์ฟ `dist`) และถูกบังคับเป็น **local mode** → ฟีเจอร์ group mode ไม่มีเทสอัตโนมัติ
- E2E ยิง element ด้วย **ข้อความไทยจริงบนจอ** และ `accessibilityLabel` (บน web = `aria-label`) → **เปลี่ยนข้อความ/label = เทสอาจแดง ต้องแจ้ง**
- `accessibilityState` ของ `Pressable` ไม่ไปถึง DOM บน react-native-web → เทสยืนยันผลจากข้อความที่ผู้ใช้เห็นแทน
- **ฟีเจอร์ location เทสบน web ไม่ได้** (ซ่อนด้วย `Platform.OS !== 'web'`) → เทสที่ `distanceM` ใน unit แทน; การแชร์รูปบน native ก็เทสได้แค่สถานะปุ่ม
- state persist ลง localStorage 4 คีย์ (`hanmao:state:v1`, `hanmao:session:v1`, `hanmao:me:v1`, `hanmao:theme:v1`) → เทสทุกตัวล้างทั้ง 4 คีย์ก่อนเริ่ม
- โดเมนต้องรับเวลาทาง `asOf` ไม่ใช่อ่าน `Date.now()` เอง เพราะ unit test ต้อง deterministic

## แนวทางเขียนโค้ด (ให้เข้ากับของเดิม)

- คอมเมนต์เป็นภาษาไทย, UI ข้อความเป็นภาษาไทย
- State ทุกอย่างผ่าน `useStore()` จาก `src/data/store.tsx` — อย่าใช้ AsyncStorage ตรงๆ ใน component
- ธีม: ดึง palette ปัจจุบันจาก `useTheme()` (`src/ui/theme.ts`) แล้วใช้ `c.xxx`; สร้างสไตล์ผ่าน factory `makeStyles(c: Palette)` + `useMemo(() => makeStyles(c), [c])` ต่อ render — **อย่า `StyleSheet.create` ระดับ module ด้วยสีธีม** (แช่แข็งสี สลับไม่ได้) และอย่า hardcode hex ([ADR 0007](docs/adr/0007-runtime-theme-switch.md))
- แสดงจำนวนเงินด้วย `baht()` เสมอ
- Location feature เช็ก `Platform.OS !== 'web'` ก่อน (web ไม่มี geofence)
- ปุ่มที่มีเงื่อนไข (เช่น ต้องกรอกชื่อก่อน) ให้ `disabled` + หรี่ opacity เมื่อยังทำไม่ได้ อย่าปล่อยให้กดแล้วเงียบ (no-op) — ผู้ใช้จะนึกว่าปุ่มเสีย
- ปุ่ม/ช่องกรอกทุกจุดใส่ `accessibilityRole` + `accessibilityLabel` (และ `accessibilityState` สำหรับ selected/disabled) รองรับ screen reader; hit target ปุ่มเล็ก ≥ 40px
- การลบ (สิ่งที่ย้อนกลับไม่ได้) ให้เรียก `confirmRemove(name, onConfirm)` จาก `src/ui/index.ts` เสมอ อย่าลบทันที;
  การยืนยันที่ต้องเขียนข้อความเอง (ปิดกลุ่ม/ออกจากกลุ่ม) ใช้ `confirmAction({ title, message, confirmLabel, onConfirm })`
- error จาก store อย่ากลืนเงียบ — แสดงด้วย `friendlyError(e, fallback)` + `notify()`
- ต้องใช้เวลาปัจจุบัน: หา `const now = Date.now()` ครั้งเดียวต่อ render แล้วส่งเป็น `asOf` เข้าฟังก์ชันโดเมนทุกตัวในหน้านั้น
- Empty state ทุกหน้าใช้รูปแบบเดียวกัน: ไอคอน emoji + หัวข้อ + คำแนะนำว่าให้ทำอะไรต่อ (ดู `emptyBox`/`emptyIcon`/`emptyTitle`/`emptyDesc`)

## state เป็น dual-mode

- **local** (ค่าเริ่มต้น) — persist ลง AsyncStorage/localStorage 3 คีย์: `hanmao:state:v1` (ข้อมูลแอป),
  `hanmao:session:v1` (อยู่กลุ่มไหน + เราเป็น member ไหน), `hanmao:me:v1` ("ฉันคือใคร" ใน local mode)
- **group** — Supabase Postgres + Realtime; เปิดใช้เมื่อมี env (`store.remoteEnabled`) และเข้าร่วมกลุ่มแล้ว
  แก้แบบ optimistic ในเครื่องก่อน แล้วยิงขึ้น server + รับ realtime มา reconcile
- **ธีม** (สว่าง/มืด) เป็น **device preference** — persist คีย์ที่ 4 `hanmao:theme:v1` (string `'light'`/`'dark'`, default มืด, ไม่มีโหมด auto)
  แยกจาก 3 คีย์ข้างบน เขียน **ทุกโหมด** ไม่ผูก local/group, ไม่อยู่ใน `AppState`, ไม่ sync ขึ้น Supabase (schema ไม่เปลี่ยน)
  store มี `theme`/`toggleTheme()`/`setTheme(t)`; หน้าจอดึง palette ผ่าน `useTheme()` ([ADR 0007](docs/adr/0007-runtime-theme-switch.md))
- `store.isHost` = เราเป็นผู้สร้างกลุ่มไหม (local mode = `true` เสมอ) — มีแค่ host ที่ลบกลุ่มทั้งกลุ่มได้ (บังคับที่ RLS)
- **ต้องรัน SQL + เปิด Anonymous sign-in เองใน Supabase** ก่อน group mode ทำงาน —
  ขั้นตอนที่ต้องทำมือรวมไว้ที่ [README.md](README.md) หัวข้อ "ขั้นตอนที่ต้องทำมือ" และ [infra/supabase/README.md](infra/supabase/README.md)

## ยังไม่ได้ทำ (backlog — ดูราย­ละเอียดใน README.md)

สแกนใบเสร็จ OCR · geofence จับเวลาอัตโนมัติ · QR PromptPay จากยอดจริง · กลุ่มเพื่อนประจำ + ประวัติการหาร (ปิดกลุ่ม = ลบถาวร) · login เต็มรูป (link anonymous → บัญชีถาวร) + presence
