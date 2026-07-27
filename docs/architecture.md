# สถาปัตยกรรม — ฮารเหมา (hanmao)

## เลเยอร์

```
app/                 UI (expo-router, file-based) — ต้องอยู่ที่ root ตามข้อกำหนด expo-router
  _layout.tsx        Bottom Tabs + StoreProvider + ธีมมืด
  index / members / bills / bill/[id] / summary
  group / join/[code]   (Phase 1) จัดการวง + เข้าร่วมผ่าน invite/QR
src/
  ui/                presentation (colors, baht, confirmRemove, labels)
  domain/            โดเมน + สูตรหาร (types.ts, split.ts) — pure, ไม่มี side-effect
  data/              state + persistence (store.tsx dual-mode, supabase.ts)
  utils/             ยูทิลิตี้ทั่วไป (geo.ts)
tests/e2e/           Playwright (web build, local mode)
docs/                เอกสาร + ADR
infra/supabase/      schema.sql + การตั้งค่า backend
config/              ค่าคงที่ + .env.example
```

## ทิศทางการพึ่งพา
`app` → `src/{ui,domain,data,utils}`; `data` → `domain` (+ supabase); `domain` ไม่พึ่งใคร (pure)

## โมเดลข้อมูล & สูตรหาร
ดู [SPEC.md](SPEC.md) — โมเดล (Member/Bill/BillItem/AppState), กติกา array ว่าง = "ทุกคนที่เข้าเงื่อนไข",
วิธีหาร 3 โหมด (equal/itemized/time), settle-up

## State: dual-mode (Phase 1+)
- **local** — AsyncStorage คีย์ `hanmao:state:v1` (คนเดียว, offline). เทส e2e ครอบโหมดนี้
- **group** — Supabase Postgres + Realtime เมื่อเข้าร่วมวง (หลายคนแก้พร้อมกัน)
  หน้าจอเรียกผ่าน `useStore()` เดิม — store map เป็น row-level ops + subscribe realtime แล้วประกอบกลับเป็น `AppState`

ดูเหตุผลการเลือก Supabase ที่ [adr/0001-supabase-realtime.md](adr/0001-supabase-realtime.md)
