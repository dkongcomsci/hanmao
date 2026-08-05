import { useStore } from '../data/store';
import { darkColors, lightColors, type Palette } from './index';

// hook ธีม — แยกออกจาก ./index.ts เพราะตัวนี้พึ่ง store (useStore)
// ถ้าอยู่รวมใน index.ts จะลาก src/data/store → supabase → native module
// เข้ามาจน unit test ที่ครอบ baht()/a11y() ใน src/ui พังทั้งไฟล์
//
// palette (darkColors/lightColors) + type Palette ยังอยู่ที่ ./index.ts (เป็นค่าคงที่ pure)
// ไฟล์นี้ import มาใช้ — index.ts ต้องไม่ import อะไรจากไฟล์นี้ (กัน circular)

/**
 * hook ดึง palette ปัจจุบันตามธีมใน store (ห่อ useStore)
 * ต้องเรียกใต้ StoreProvider เท่านั้น (เหมือน useStore)
 */
export function useTheme(): {
  colors: Palette;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  setTheme: (t: 'light' | 'dark') => void;
} {
  const { theme, toggleTheme, setTheme } = useStore();
  return {
    colors: theme === 'light' ? lightColors : darkColors,
    theme,
    toggleTheme,
    setTheme,
  };
}
