# .claude — Control plane สำหรับ AI/Agent

ศูนย์กลางของระบบ agent ที่มาทำงานต่อในโปรเจกต์นี้

| โฟลเดอร์ | หน้าที่ |
|---|---|
| `rules/` | กฎ/มาตรฐานการเขียนโค้ด แยกตามขอบเขตไฟล์ (โหลดตามความเกี่ยวข้อง) |
| `skills/` | เพลย์บุ๊กขั้นตอนงานที่ทำซ้ำ ๆ (deploy, release notes) — ยังว่าง |
| `agents/` | ทีมเอเจนต์แบ่งตามขอบเขตไฟล์ + หัวหน้าทีมที่กระจายงานขนานกัน (ดู [agents/README.md](agents/README.md)) |
| `hooks/` | สคริปต์อัตโนมัติก่อน/หลังเหตุการณ์ (pre-commit ฯลฯ) — ยังว่าง |
| `settings.json` | การตั้งค่า Claude Code + plugin |

ภาพรวมโปรเจกต์ + วิธีทำงานหลักอยู่ที่ [CLAUDE.md](../CLAUDE.md); สถาปัตยกรรมอยู่ที่ [docs/architecture.md](../docs/architecture.md)
