#!/usr/bin/env bash
# ดูว่า agent ที่กำลังรัน "ทำอะไรอยู่" แบบ realtime โดยอ่าน transcript JSONL ของ Claude Code ตรง ๆ
#
# ต่างจาก .claude/agent-activity.log (ที่มาจาก hook — เก็บแค่ตอนสั่ง/เริ่ม/จบงาน):
# สคริปต์นี้เห็น "ทุก tool call" ของ agent ที่กำลังรัน รวมงานที่เริ่มไปก่อนจะตั้ง hook
#
# ใช้: ./scripts/watch-agents.sh          # ตามงานล่าสุดแบบ realtime
#      ./scripts/watch-agents.sh --once   # พิมพ์ทั้งหมดแล้วจบ
set -uo pipefail

PROJ="$HOME/.claude/projects/-Users-dkong-work-hanmao"
DIR="$(find "$PROJ" -type d -name subagents -maxdepth 2 -print0 2>/dev/null \
       | xargs -0 ls -dt 2>/dev/null | head -1)"

if [[ -z "${DIR:-}" ]]; then
  echo "ยังไม่มี subagent transcript ใน $PROJ" >&2
  exit 1
fi

FILE="$(ls -t "$DIR"/agent-*.jsonl 2>/dev/null | head -1)"
if [[ -z "${FILE:-}" ]]; then
  echo "ยังไม่มีไฟล์ agent-*.jsonl ใน $DIR" >&2
  exit 1
fi

# แปลง JSONL หนึ่งบรรทัด → บรรทัดอ่านง่าย (tool call ที่ agent เรียก + ข้อความสรุป)
fmt() {
  jq -rj --unbuffered '
    if .type == "assistant" then
      (.message.content[]? |
        if .type == "tool_use" then
          if .name == "Agent" or .name == "Task" then
            "  ▶ สั่งงาน  \(.input.subagent_type // "?")  ::  \(.input.description // "-")\n"
          elif .name == "Bash" then
            "  $ \(.input.command | .[0:110])\n"
          elif .name == "Edit" or .name == "Write" then
            "  ✎ \(.name)  \(.input.file_path)\n"
          elif .name == "TodoWrite" then
            "  ☑ TodoWrite\n"
          else
            "  · \(.name)\n"
          end
        elif .type == "text" and (.text | length) > 40 then
          "  » \(.text | gsub("\n"; " ") | .[0:160])\n"
        else empty end)
    else empty end
  ' 2>/dev/null
}

echo "กำลังดู: $FILE"
echo "──────────────────────────────────────────────"
if [[ "${1:-}" == "--once" ]]; then
  fmt <"$FILE"
else
  tail -n 200 -f "$FILE" | fmt
fi
