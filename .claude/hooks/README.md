# hooks

สคริปต์อัตโนมัติที่ทำงานเมื่อเกิดเหตุการณ์ (ก่อน/หลังแก้ไฟล์, ก่อน commit, ก่อน/หลังรับคำสั่ง)
ต้องลงทะเบียน hook ใน [../settings.json](../settings.json)

## log-agent.sh — log กิจกรรมของทีม agent

append หนึ่งบรรทัดต่อเหตุการณ์ลง `.claude/agent-activity.log` (gitignored) เพื่อเปิดดูใน VSCode
ได้แบบ realtime ตอนที่ [hanmao-lead](../agents/hanmao-lead.md) กระจายงานให้ agent ลูก

ลงทะเบียนไว้ 3 event:

| event | ความหมายในบรรทัด log |
|---|---|
| `PreToolUse` (matcher `Agent\|Task`) | `▶ สั่งงาน <agent> :: <คำสั่ง>` — lead เพิ่งสั่งงานลูก |
| `SubagentStart` | `▷ เริ่ม <agent>` |
| `SubagentStop` | `✔ จบงาน <agent>` |

### วิธีดู log

- **VSCode**: เปิด `.claude/agent-activity.log` — ไฟล์อัปเดตเองแล้วจอเลื่อนตาม (ถ้าเคอร์เซอร์อยู่ท้ายไฟล์)
- **terminal**: `npm run agents:log` (= `tail -f .claude/agent-activity.log`)

> hook อ่าน payload จาก stdin ด้วย `jq` และเขียนลง `$CLAUDE_PROJECT_DIR` — ไม่บล็อกงาน
> (ปิดท้ายด้วย `|| true` เสมอ) ปรับ/ปิดได้ที่คำสั่ง `/hooks`
