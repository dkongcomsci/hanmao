# src/utils

ยูทิลิตี้ pure ที่ไม่ผูกกับ UI หรือที่เก็บข้อมูล

- `geo.ts` — `distanceM()` ระยะทาง (เมตร) ระหว่างสองพิกัดแบบ haversine ใช้เช็ก geofence พื้นที่ร้าน
- `id.ts` — `uuid()` (UUID v4 กัน id ชนกันเมื่อหลายเครื่องสร้างพร้อมกันใน group mode),
  `inviteCode(len = 6)` โค้ดเชิญเข้าวงแบบสั้น ไม่ใช้ตัวที่สับสน (`0/O/1/I`) สำหรับลิงก์/QR

**เจ้าของไฟล์:** โฟลเดอร์นี้อยู่ในความดูแลของ `hanmao-domain` (ตรรกะ pure) — ดู [.claude/agents/README.md](../../.claude/agents/README.md)
