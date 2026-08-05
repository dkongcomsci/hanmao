# .claude — Control plane สำหรับ AI/Agent

ศูนย์กลางของระบบ agent ที่มาทำงานต่อในโปรเจกต์นี้

| โฟลเดอร์ | หน้าที่ |
|---|---|
| `rules/` | กฎ/มาตรฐานการเขียนโค้ด แยกตามขอบเขตไฟล์ (โหลดตามความเกี่ยวข้อง) |
| `skills/` | เพลย์บุ๊กขั้นตอนงานที่ทำซ้ำ ๆ (deploy, release notes) — ยังว่าง |
| `agents/` | ทีมเอเจนต์แบ่งตามขอบเขตไฟล์ + หัวหน้าทีมที่กระจายงานขนานกัน (ดู [agents/README.md](agents/README.md)) |
| `hooks/` | สคริปต์อัตโนมัติก่อน/หลังเหตุการณ์ — มี `log-agent.sh` log กิจกรรมทีม agent (ดู [hooks/README.md](hooks/README.md)) |
| `settings.json` | การตั้งค่า Claude Code + plugin + ลงทะเบียน hooks |

> ดูทีม agent ทำงานแบบ realtime: `npm run agents:log` (จาก hook) หรือ `./scripts/watch-agents.sh` (ทุก tool call)

ภาพรวมโปรเจกต์ + วิธีทำงานหลักอยู่ที่ [CLAUDE.md](../CLAUDE.md); สถาปัตยกรรมอยู่ที่ [docs/architecture.md](../docs/architecture.md)
