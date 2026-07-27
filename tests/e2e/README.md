# tests/e2e

Playwright E2E — รันบน **web build** (`expo export` → serve `dist` ที่ port 4599; config จัดการ build+serve ให้เอง)

- `helpers.ts` — `freshPage()` ล้าง localStorage ให้เริ่มสะอาด, `addMember()`
- `*.spec.ts` — หนึ่งไฟล์ต่อหน้าจอ/หนึ่ง describe ต่อ action group

รัน: `npm run test:e2e` · ดูทีละ step: `npm run test:e2e:ui`

**หมายเหตุ:** เทสชุดนี้ครอบ **local mode** (state ใน localStorage). ฟีเจอร์ group/Supabase
ต้องแยกไปเทสกับ backend จริง (Phase 2) — ดู [docs/adr/0001-supabase-realtime.md](../../docs/adr/0001-supabase-realtime.md)
