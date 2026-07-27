# src/data

ชั้นข้อมูล/สถานะ (state + persistence) — จุดเดียวที่แอปคุยกับที่เก็บข้อมูล

- `store.tsx` — React Context + `useStore()` API; **dual-mode**:
  - **local** — persist ลง AsyncStorage (คีย์ `hanmao:state:v1`) สำหรับใช้งานคนเดียว
  - **group** — sync ผ่าน Supabase Realtime เมื่อเข้าร่วมวง (multi-user)
- `supabase.ts` — Supabase client (อ่าน env `EXPO_PUBLIC_SUPABASE_*`); ถ้าไม่มี env → บังคับ local mode

**กติกา:** ทุกหน้าจอเข้าถึง state ผ่าน `useStore()` เท่านั้น อย่าเรียก AsyncStorage/Supabase ตรง ๆ ใน component
