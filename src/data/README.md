# src/data

ชั้นข้อมูล/สถานะ (state + persistence) — จุดเดียวที่แอปคุยกับที่เก็บข้อมูล

- `store.tsx` — React Context + `useStore()` API; **dual-mode** แต่ interface เดียว (หน้าจอไม่ต้องรู้ว่าอยู่โหมดไหน):
  - **local** — persist ลง AsyncStorage สำหรับใช้งานคนเดียว
  - **group** — apply ทันที (optimistic) แล้วยิงไป Supabase + subscribe Realtime → refetch มา reconcile
- `supabase.ts` — Supabase client (อ่าน env `EXPO_PUBLIC_SUPABASE_*`); ถ้าไม่มี env → `null` → บังคับ local mode
- `remote.ts` — map row ↔ โดเมน (snake_case ↔ camelCase) + `subscribeGroup` (realtime) + `fetchGroupState` (ประกอบ rows กลับเป็น `AppState`)

## คีย์ที่เก็บในเครื่อง (4 คีย์)

| คีย์ | เก็บอะไร |
|---|---|
| `hanmao:state:v1` | `AppState` ของ local mode |
| `hanmao:session:v1` | `{ groupId, myMemberId }` — กลับเข้ากลุ่มเดิมอัตโนมัติตอนเปิดแอป |
| `hanmao:me:v1` | "ฉันคือ member ไหน" ของ local mode |
| `hanmao:theme:v1` | ธีม `'light'`/`'dark'` — **device preference** ไม่อยู่ใน `AppState` ไม่ sync ขึ้น server เขียนทุกโหมด (default มืด, ดู [ADR 0007](../../docs/adr/0007-runtime-theme-switch.md)) |

## กติกา

- ทุกหน้าจอเข้าถึง state ผ่าน `useStore()` เท่านั้น อย่าเรียก AsyncStorage/Supabase ตรง ๆ ใน component
- API ใหม่ต้องทำงานได้ทั้งสองโหมด — local ต้องไม่แตะ Supabase (ใช้ `remote()` ที่ no-op เมื่อไม่ได้อยู่ group mode)
- mutation ที่กระทบยอดโอนต้องผ่าน `commitPrune` (ตัด settlements ที่ยอดไม่ตรงแล้วออก + sync ขึ้น server)
  **prune ทุกเคสรวมบิลโหมด `time` ที่ยังมีคนไม่กลับ** — `settleUp` ติด `stamp` ให้รายการที่ยอดลอย
  ทำให้ `transferKey` นิ่งข้าม `asOf` ที่ต่างกัน (ข้อยกเว้นเดิมถูกยกเลิกแล้ว ดู [ADR 0006](../../docs/adr/0006-stable-settle-topology.md))
- แก้ `settlements` ใน group mode ผ่าน RPC (`settlement_toggle`/`settlements_prune`) ให้ atomic
- **ทุก query ที่คืนหลายแถวต้องมี order ที่นิ่ง** — `.order(<เวลา>)` + tiebreak `id` และเรียงซ้ำฝั่ง client
  (`sortByTimeThenId`) เพราะ Postgres ไม่การันตีลำดับแถว และลำดับสมาชิกมีผลถึงการเกลี่ยเศษสตางค์
  ⇒ ถ้าลำดับไม่นิ่ง สองเครื่องจะเห็นคู่โอน/ติ๊ก "โอนแล้ว" ไม่ตรงกัน
  ([ADR 0002 ภาคผนวก](../../docs/adr/0002-integer-cents-largest-remainder.md))
  insert หลายแถวในคำสั่งเดียว (migrate ตอน `createGroup`) ต้องส่ง `created_at` เองด้วย `seqStamp()`
  เพราะ `now()` ของ Postgres คงที่ทั้งทรานแซกชัน
- state เก่าที่โหลดจากเครื่องต้อง merge กับค่าว่างเสมอ (`{ ...empty, ...JSON.parse(raw) }`) — ฟิลด์ใหม่ต้อง backward-compatible

SQL/สิทธิ์ฝั่ง server: [infra/supabase/README.md](../../infra/supabase/README.md) · API เต็ม: [docs/SPEC.md](../../docs/SPEC.md) §6
