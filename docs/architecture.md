# สถาปัตยกรรม — หารเมา (hanmao)

## เลเยอร์

```
app/                 UI (expo-router, file-based) — ต้องอยู่ที่ root ตามข้อกำหนด expo-router
  _layout.tsx        Bottom Tabs (หน้าแรก/สมาชิก/บิล/สรุป/ฉัน) + StoreProvider + ธีมมืด
  index / members / bills / bill/[id] / summary / me
  group / join/[code]   จัดการวง + เข้าร่วมผ่าน invite/QR (group mode)
src/
  ui/                presentation (colors, baht, confirmRemove, labels) + share.ts (จับภาพ→รูป)
  domain/            โดเมน + สูตรหาร (types.ts, split.ts) — pure, ไม่มี side-effect
  data/              state + persistence (store.tsx dual-mode, supabase.ts client, remote.ts map+realtime)
  utils/             ยูทิลิตี้ทั่วไป (geo.ts, id.ts)
tests/e2e/           Playwright (web build, local mode)
docs/                เอกสาร + ADR
infra/supabase/      schema.sql + patch-*.sql + การตั้งค่า backend
config/              ค่าคงที่ + .env.example
```

## ทิศทางการพึ่งพา
`app` → `src/{ui,domain,data,utils}`; `data` → `domain` (+ supabase); `domain` ไม่พึ่งใคร (pure)
`ui/share.ts` พึ่ง native module (`react-native-view-shot`, `expo-sharing`) — web มี fallback ดาวน์โหลด

## โมเดลข้อมูล & สูตรหาร
ดู [SPEC.md](SPEC.md) — โมเดล (Member/Bill/BillItem/AppState + `settlements`), กติกา array ว่าง = "ทุกคนที่เข้าเงื่อนไข",
วิธีหาร 3 โหมด (equal/itemized/time), บิลเลี้ยง, `billComplete`, settle-up + `transferKey`/`allSettled`

## State: dual-mode
- **local** — AsyncStorage คีย์ `hanmao:state:v1` (คนเดียว, offline). เทส e2e ครอบโหมดนี้
- **group** — Supabase Postgres + Realtime เมื่อเข้าร่วมวง (หลายคนแก้พร้อมกัน)
  หน้าจอเรียกผ่าน `useStore()` เดิม — store apply optimistic ทันที + ยิง row-level ops ผ่าน `remote.ts`
  แล้ว subscribe realtime → refetch ประกอบกลับเป็น `AppState`. ไม่มี env Supabase → บังคับ local
- คีย์ local เสริม: `hanmao:session:v1` (จำวง/ตัวตนกลับเข้าวงเดิม), `hanmao:me:v1` ("ฉันคือใคร" โหมด local)
- `settlements` (ติ๊กโอนแล้ว) persist เหมือน `venue`: localStorage ใน local / คอลัมน์ `groups.settlements` ใน group

ดูเหตุผลการเลือก Supabase ที่ [adr/0001-supabase-realtime.md](adr/0001-supabase-realtime.md)
