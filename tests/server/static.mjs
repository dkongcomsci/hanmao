// Static file server สำหรับ E2E — serve โฟลเดอร์ dist แบบ SPA fallback
//
// ทำไมเขียนเอง ไม่ใช้ `npx serve`:
// 1. `npx serve` ไม่ได้อยู่ใน devDependencies → เครื่องที่ไม่มี cache จะดึงเวอร์ชันสุ่มจาก registry
//    (หรือพังถ้าออฟไลน์) = เทสไม่ deterministic
// 2. `npx expo serve dist` (มีอยู่แล้วในโปรเจกต์) ตอบ 404 บน deep route เช่น /summary, /bill/xyz
//    ซึ่งเทสเรียก page.goto() ตรง ๆ → ใช้แทนไม่ได้
// 3. ไฟล์นี้ใช้แค่ node:http + node:fs = ศูนย์ dependency นิ่งที่สุด
//
// SPA fallback: path ที่ไม่ตรงไฟล์จริงและไม่มีนามสกุล → คืน index.html
// (expo-router จัดการ routing ฝั่ง client เอง)
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';

const root = resolve(process.argv[2] ?? 'dist');
const port = Number(process.argv[3] ?? 4599);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
};

/** แปลง URL path เป็นไฟล์จริงใน root (กัน path traversal ออกนอก root) */
function safePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  const target = resolve(join(root, normalize(decoded)));
  if (target !== root && !target.startsWith(root + sep)) return null;
  return target;
}

/** ไฟล์นี้มีอยู่จริงและเป็นไฟล์ (ไม่ใช่โฟลเดอร์) ไหม */
function isFile(p) {
  return p != null && existsSync(p) && statSync(p).isFile();
}

const server = createServer((req, res) => {
  let file = safePath(req.url ?? '/');
  if (file == null) {
    res.writeHead(403).end('forbidden');
    return;
  }
  // โฟลเดอร์ → index.html ข้างใน; ไม่เจอไฟล์และไม่มีนามสกุล → SPA fallback
  if (!isFile(file)) {
    const asIndex = join(file, 'index.html');
    if (isFile(asIndex)) file = asIndex;
    else if (extname(file) === '') file = join(root, 'index.html');
  }
  if (!isFile(file)) {
    res.writeHead(404).end('not found');
    return;
  }
  res.writeHead(200, {
    'Content-Type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
    // ห้าม cache: เทสรีบิลด์ dist ใหม่ทุกครั้ง ไม่ให้เบราว์เซอร์เอา bundle เก่ามาใช้
    'Cache-Control': 'no-store',
  });
  createReadStream(file).pipe(res);
});

server.listen(port, () => {
  console.log(`static server: ${root} → http://localhost:${port}`);
});
