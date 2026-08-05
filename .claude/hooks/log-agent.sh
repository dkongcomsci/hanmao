#!/usr/bin/env bash
# log กิจกรรมของ subagent ลง .claude/agent-activity.log ให้เปิดดูใน VSCode ได้แบบ realtime
# รับ hook payload (JSON) ทาง stdin — ใช้กับ event: PreToolUse(Agent|Task), SubagentStart, SubagentStop
set -uo pipefail

LOG="${CLAUDE_PROJECT_DIR:-$(pwd)}/.claude/agent-activity.log"
TS="$(date '+%H:%M:%S')"

payload="$(cat)"

line="$(printf '%s' "$payload" | jq -r --arg ts "$TS" '
  # ชื่อ event: hook_event_name (ถ้าไม่มีให้เดาจากฟิลด์ที่มี)
  (.hook_event_name // "unknown") as $ev
  | if $ev == "PreToolUse" then
      "\($ts)  ▶ สั่งงาน  \(.tool_input.subagent_type // "?")  ::  \(.tool_input.description // "-")"
    elif $ev == "SubagentStart" then
      "\($ts)  ▷ เริ่ม    \(.agent_type // .subagent_type // "?")  ::  \(.description // "-")"
    elif $ev == "SubagentStop" then
      "\($ts)  ✔ จบงาน   \(.agent_type // .subagent_type // "?")  ::  \(.description // "-")"
    else
      "\($ts)  · \($ev)"
    end
')"

printf '%s\n' "$line" >>"$LOG"
