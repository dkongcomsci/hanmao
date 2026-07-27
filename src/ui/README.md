# src/ui

ชั้นการแสดงผลที่ใช้ร่วมกันทุกหน้า (presentation layer) — ไม่มี business logic

- `index.ts` — `colors` (ธีมมืด), `baht()`, `timeStr()`, `confirmRemove()`,
  และ label ภาษาไทย (`consumesLabel`, `categoryLabel`, `splitModeLabel`)

**กติกา:** สีทุกที่ต้องมาจาก `colors` เท่านั้น อย่า hardcode hex; แสดงเงินด้วย `baht()` เสมอ
