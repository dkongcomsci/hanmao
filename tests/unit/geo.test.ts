import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { distanceM } from '../../src/utils/geo';

/**
 * ฟีเจอร์ geofence เทสบน E2E ไม่ได้ (ถูกซ่อนด้วย Platform.OS !== 'web' ในหน้า summary)
 * → เทส unit ของ distanceM ตรง ๆ ตามที่ CLAUDE.md กำหนด
 */
describe('distanceM (haversine)', () => {
  test('จุดเดียวกัน = 0 เมตร', () => {
    const p = { lat: 13.7563, lng: 100.5018 }; // กรุงเทพ
    assert.equal(distanceM(p, p), 0);
  });

  test('ระยะ 1 องศาละติจูด ≈ 111 กม.', () => {
    const d = distanceM({ lat: 0, lng: 0 }, { lat: 1, lng: 0 });
    assert.ok(Math.abs(d - 111_195) < 500, `ได้ ${d}`);
  });

  test('สลับลำดับจุดได้ผลเท่ากัน (สมมาตร)', () => {
    const a = { lat: 13.7563, lng: 100.5018 };
    const b = { lat: 18.7883, lng: 98.9853 }; // เชียงใหม่
    assert.equal(distanceM(a, b), distanceM(b, a));
  });

  test('กรุงเทพ → เชียงใหม่ ประมาณ 580 กม.', () => {
    const d = distanceM({ lat: 13.7563, lng: 100.5018 }, { lat: 18.7883, lng: 98.9853 });
    assert.ok(d > 570_000 && d < 595_000, `ได้ ${d}`);
  });

  test('ระยะสั้นระดับรัศมีร้าน (150 ม.) แม่นพอใช้เทียบ geofence', () => {
    // ขยับละติจูด 0.001 องศา ≈ 111 เมตร (อยู่ในรัศมี 150 ม.)
    const near = distanceM({ lat: 13.7563, lng: 100.5018 }, { lat: 13.7573, lng: 100.5018 });
    assert.ok(near > 100 && near < 120, `ได้ ${near}`);
    assert.ok(near <= 150, 'ต้องถือว่ายังอยู่ในพื้นที่');

    // ขยับ 0.01 องศา ≈ 1.1 กม. (ออกนอกพื้นที่)
    const far = distanceM({ lat: 13.7563, lng: 100.5018 }, { lat: 13.7663, lng: 100.5018 });
    assert.ok(far > 150, 'ต้องถือว่าออกนอกพื้นที่');
  });

  test('ข้ามเส้นแบ่งลองจิจูด 180 องศายังคิดได้ (ไม่ใช่ครึ่งโลก)', () => {
    const d = distanceM({ lat: 0, lng: 179.9 }, { lat: 0, lng: -179.9 });
    // ห่างกันจริง 0.2 องศา ≈ 22 กม.
    assert.ok(d < 25_000, `ได้ ${d}`);
  });
});
