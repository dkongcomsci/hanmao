// จับภาพ View แล้ว export ออกเป็นรูป — web: ดาวน์โหลดไฟล์, native: เปิด share sheet
import { Platform } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';

/**
 * จับภาพ ref ที่ชี้ไปยัง View (การ์ดสรุป) แล้ว export
 * - web: สร้างลิงก์ดาวน์โหลด PNG ให้อัตโนมัติ
 * - native (iOS/Android): เปิด share sheet ให้เลือกบันทึก/ส่งต่อ
 * @param viewRef ref ของ View ที่จะจับภาพ
 * @param fileName ชื่อไฟล์ (ไม่ต้องมีนามสกุล)
 */
export async function shareViewAsImage(
  viewRef: React.RefObject<unknown>,
  fileName = 'summary',
): Promise<void> {
  if (Platform.OS === 'web') {
    // web: ได้ data URI มาแล้วยิงดาวน์โหลดผ่าน <a download>
    const uri = await captureRef(viewRef as never, { format: 'png', quality: 1, result: 'data-uri' });
    if (typeof document === 'undefined') return;
    const a = document.createElement('a');
    a.href = uri;
    a.download = `${fileName}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    return;
  }

  // native: จับเป็นไฟล์ชั่วคราวแล้วเปิด share sheet
  const uri = await captureRef(viewRef as never, { format: 'png', quality: 1, result: 'tmpfile' });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'แชร์สรุปการหาร' });
  }
}
