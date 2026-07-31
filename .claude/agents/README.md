# agents

เอเจนต์เฉพาะทางของโปรเจกต์หารเมา แบ่งตาม **ขอบเขตไฟล์** เพื่อให้สั่งงานขนานกันได้โดยไม่แก้ทับกัน

## ทีม

| agent | ขอบเขตไฟล์ (แก้ได้) | หน้าที่ | delegate ต่อได้ |
|---|---|---|:---:|
| [hanmao-lead](hanmao-lead.md) | ไม่แก้โค้ดฟีเจอร์ | **หัวหน้าทีม** — แตกงาน กระจายให้ลูกทีม รวมผล | ✅ |
| [hanmao-domain](hanmao-domain.md) | `src/domain/**` | สูตรหาร, settle-up, โมเดลข้อมูล (pure) | ✗ |
| [hanmao-frontend](hanmao-frontend.md) | `app/**`, `src/ui/**` | หน้าจอ, ธีม, a11y, empty state | ✗ |
| [hanmao-data](hanmao-data.md) | `src/data/**`, `infra/supabase/**` | store API, persist, dual-mode, realtime, SQL | ✗ |
| [hanmao-test](hanmao-test.md) | `tests/**`, `playwright.config.ts` | Playwright E2E | ✗ |
| [hanmao-docs](hanmao-docs.md) | ไฟล์ `.md` | เอกสารให้ตรงโค้ด + ADR | ✗ |
| [hanmao-reviewer](hanmao-reviewer.md) | อ่านเท่านั้น | รัน tsc/e2e/build + ตรวจกฎโปรเจกต์ | ✗ |

มีแต่ `hanmao-lead` ที่ถือ Agent tool → **delegate ได้ชั้นเดียว** (คุณ → lead → ลูกทีม) ลูกทีมแตกลูกต่อไม่ได้ กันงานบานปลายและกัน agent วนเรียกกันเอง

## วิธีสั่ง

```
# งานหลายเลเยอร์ — ให้หัวหน้าทีมกระจาย
"ใช้ hanmao-lead: เพิ่มฟีเจอร์แยกบิลตามรอบ (เช้า/เย็น)"

# งานเลเยอร์เดียว — สั่งตรงตัวที่ตรงขอบเขต เร็วกว่า
"ใช้ hanmao-test: เขียนเทสหน้าสมาชิกกรณีลบคนที่เป็นคนจ่าย"
```

## ลำดับการพึ่งพา (lead ใช้จัดคิว)

```
domain ──┐
         ├─→ frontend ─→ test ─→ reviewer ─→ docs
data   ──┘
```
`domain` + `data` รันขนานกันได้ถ้าไม่แตะไฟล์เดียวกัน · `frontend` รอ API/สูตรนิ่งก่อน · `docs` ปิดท้าย

## เพิ่ม agent ใหม่

สร้าง `<name>.md` + frontmatter (`name`, `description`, `tools`) แล้ว **แบ่งตามขอบเขตไฟล์ที่ไม่ทับกับตัวอื่น** —
ในเนื้อไฟล์ต้องระบุ: ไฟล์ที่แก้ได้/ห้ามแตะ, กฎที่ห้ามละเมิด, และสิ่งที่ต้องทำก่อนปิดงาน (verify + รายงานอะไรกลับ)
