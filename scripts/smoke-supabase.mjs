// Smoke test: ยิง Supabase จริงด้วย anon key เช็กว่า backend พร้อมสำหรับ group mode
// รัน: node --env-file=.env scripts/smoke-supabase.mjs
// เช็ก: (1) เชื่อมต่อ + schema มีครบ (2) anonymous auth (3) createGroup (4) join_group RPC + RLS
import { createClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error('✗ ไม่พบ env — รันด้วย: node --env-file=.env scripts/smoke-supabase.mjs');
  process.exit(1);
}

const pass = (m) => console.log(`✓ ${m}`);
const fail = (m, e) => {
  console.error(`✗ ${m}`);
  if (e) console.error('  ', e.message ?? e);
  process.exit(1);
};

// สร้าง client แยก 2 ตัว = 2 ผู้ใช้ (host A / joiner B) คนละ auth uid
const mk = () => createClient(url, key, { auth: { persistSession: false } });
const A = mk();
const B = mk();

// --- 1. schema มีครบ (เช็กด้วยการ query ตารางหลัก) ---
for (const t of ['groups', 'members', 'bills', 'bill_items', 'group_participants']) {
  const { error } = await A.from(t).select('*').limit(0);
  // RLS อาจคืน 0 แถว แต่ต้องไม่ใช่ error 42P01 (undefined table)
  if (error && error.code === '42P01') fail(`ตาราง "${t}" ยังไม่มี — รัน schema.sql ก่อน`, error);
}
pass('schema: ตารางครบ 5 ตาราง');

// --- 2. anonymous auth (ทั้ง A และ B) ---
const { data: aAuth, error: aErr } = await A.auth.signInAnonymously();
if (aErr) fail('anonymous auth (A) — เปิด Authentication → Providers → Anonymous หรือยัง?', aErr);
const { error: bErr } = await B.auth.signInAnonymously();
if (bErr) fail('anonymous auth (B)', bErr);
pass(`anonymous auth: A=${aAuth.user.id.slice(0, 8)}… + B ได้ session`);

// --- 3. A สร้างวง + เป็น participant + ใส่ member 1 คน ---
const code = 'SMOKE' + Math.floor(aAuth.user.id.charCodeAt(0)); // โค้ดไม่ซ้ำหยาบ ๆ
const gid = crypto.randomUUID();
{
  const { error } = await A.from('groups').insert({ id: gid, name: 'วงทดสอบ smoke', invite_code: code });
  if (error) fail('A สร้างวง (insert groups) — เช็ก RLS policy insert', error);

  const { error: pErr } = await A.from('group_participants').insert({ group_id: gid });
  if (pErr) fail('A เป็น participant', pErr);

  const { error: mErr } = await A.from('members').insert({
    id: crypto.randomUUID(),
    group_id: gid,
    name: 'อุ๋ย (host)',
    consumes: 'both',
  });
  if (mErr) fail('A เพิ่ม member', mErr);
}
pass(`A สร้างวง (code=${code}) + เพิ่ม member`);

// --- 4. B join ด้วย RPC + อ่านข้อมูลวงได้ (RLS ให้ participant อ่าน) ---
{
  const { data: joinedGid, error } = await B.rpc('join_group', { code });
  if (error) fail('B เรียก join_group RPC', error);
  if (joinedGid !== gid) fail(`join_group คืน gid ไม่ตรง (${joinedGid} ≠ ${gid})`);

  const { data: members, error: rErr } = await B.from('members').select('*').eq('group_id', gid);
  if (rErr) fail('B อ่าน members หลัง join (RLS)', rErr);
  if (!members?.length) fail('B join แล้วแต่มองไม่เห็น member ของ A — RLS อ่านไม่ผ่าน');
  pass(`B join สำเร็จ + เห็น ${members.length} member ของ A (RLS ผ่าน)`);
}

// --- 5. เช็ก isolation: client ที่ไม่ได้ join ต้องมองไม่เห็น ---
{
  const C = mk();
  await C.auth.signInAnonymously();
  const { data: leaked } = await C.from('members').select('*').eq('group_id', gid);
  if (leaked?.length) fail(`RLS รั่ว! client นอกวงเห็น ${leaked.length} member`);
  pass('RLS isolation: client นอกวงมองไม่เห็นข้อมูล');
}

// --- cleanup: ลบวงทดสอบ (bill_items/members/participants ลบตาม cascade) ---
{
  const { error } = await A.from('groups').delete().eq('id', gid);
  if (error) console.warn(`  ⚠ ลบวงทดสอบไม่สำเร็จ (id=${gid}) — ลบเองใน dashboard ได้`);
  else pass('cleanup: ลบวงทดสอบแล้ว');
}

console.log('\n🎉 backend พร้อมใช้งาน group mode — เปิด 2 browser เทสต่อได้เลย');
