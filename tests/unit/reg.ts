/**
 * เปลี่ยนเส้นทาง import โมดูล native → stub ตอนรันเทส unit บน node
 *
 * ทำไมต้องมี: `src/ui/index.ts` import `react-native` (เขียนด้วย Flow syntax ที่ esbuild
 * parse ไม่ได้) และ `expo-clipboard` (ต้องมี `__DEV__` + native module) — บน node ทั้งคู่
 * พังตอน import ทันที ทั้งที่ฟังก์ชันที่เราจะเทสไม่ได้พึ่ง native จริง ๆ
 *
 * โหลดผ่าน `node --import ./tests/unit/reg.ts` (ดู script test:unit ใน package.json)
 * เพิ่มโมดูลใหม่: สร้างไฟล์ใน stubs/ แล้วเพิ่มใน map ด้านล่าง
 */
import { registerHooks } from 'node:module';

const stub = (n: string) => new URL(`./stubs/${n}.ts`, import.meta.url).href;

const map: Record<string, string> = {
  'react-native': stub('react-native'),
  'expo-clipboard': stub('expo-clipboard'),
};
registerHooks({
  resolve(spec, ctx, next) {
    const hit = map[spec];
    if (hit) return { url: hit, shortCircuit: true };
    return next(spec, ctx);
  },
});
