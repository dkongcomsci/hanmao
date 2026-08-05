/**
 * เทส unit รันบน node (node:test) ไม่ใช่ React Native
 * → ต้องดึง type ของ node เข้ามาให้ `npx tsc --noEmit` รู้จัก 'node:test'/'node:assert'/'node:module'
 *
 * ทำไมประกาศไว้ที่นี่ ไม่ใส่ `types: ["node"]` ใน tsconfig.json:
 * tsconfig.json เป็นไฟล์ของโปรเจกต์รวม (นอกขอบเขตของเทส) และ `types` จะทับค่า
 * ที่ expo/tsconfig.base ตั้งไว้ ทำให้ type ของ expo/react หลุด — reference ไฟล์เดียวปลอดภัยกว่า
 */
/// <reference types="node" />
