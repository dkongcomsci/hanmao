# Rules: Frontend (RN / expo-router)

ขอบเขต: `app/**`, `src/ui/**`

- คอมเมนต์ + ข้อความ UI เป็น **ภาษาไทย**
- State ทุกอย่างผ่าน `useStore()` จาก [src/data/store.tsx](../../src/data/store.tsx) — อย่าใช้ AsyncStorage/Supabase ตรง ๆ ใน component
- ธีมมืด: ใช้สีจาก `colors` ใน [src/ui/index.ts](../../src/ui/index.ts) เท่านั้น อย่า hardcode hex
- แสดงจำนวนเงินด้วย `baht()` เสมอ
- Location feature เช็ก `Platform.OS !== 'web'` ก่อน (web ไม่มี geofence)
- ปุ่มที่มีเงื่อนไข → `disabled` + หรี่ opacity เมื่อยังทำไม่ได้ อย่าปล่อยให้กดแล้วเงียบ (no-op)
- การลบ (ย้อนกลับไม่ได้) → เรียก `confirmRemove(name, onConfirm)` เสมอ อย่าลบทันที
- Empty state ทุกหน้าใช้รูปแบบเดียวกัน: ไอคอน emoji + หัวข้อ + คำแนะนำ (`emptyBox`/`emptyIcon`/`emptyTitle`/`emptyDesc`)
