import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { a11y, Palette } from './index';
import { setPopupListener, PopupButton, PopupRequest } from './popup';
import { useTheme } from './theme';

// <PopupHost/> — popup component กลางของแอป แทน window.alert/window.confirm/Alert.alert
// mount ไว้ครั้งเดียวใน app/_layout.tsx (ใต้ StoreProvider เพื่อใช้ useTheme ได้)
// รับคำสั่งเปิดผ่านบัสใน ./popup.ts (notify/confirmAction ยิงเข้ามา)
//
// รองรับคำสั่งซ้อนกัน: ถ้ามี popup ใหม่มาระหว่างที่ยังเปิดอยู่ ต่อคิวไว้แล้วเปิดทีละอัน

export function PopupHost() {
  const { colors: c } = useTheme();
  const s = useMemo(() => makeStyles(c), [c]);
  // คิว popup — แสดงตัวแรกในคิว (queue[0]); ปิดแล้วดึงตัวถัดไป
  const [queue, setQueue] = useState<PopupRequest[]>([]);

  useEffect(() => {
    // ต่อคำสั่งใหม่เข้าท้ายคิว (ไม่ทับอันที่กำลังแสดง)
    return setPopupListener((req) => setQueue((q) => [...q, req]));
  }, []);

  const current = queue[0];
  const visible = current !== undefined;

  // กดปุ่ม: เรียก onPress ของปุ่มนั้น แล้วปิด (ดึงตัวถัดไปในคิว)
  const press = (btn: PopupButton) => {
    setQueue((q) => q.slice(1));
    btn.onPress?.();
  };

  // ปิดด้วยปุ่ม back ของ Android / Esc — เหมือนกด "ยกเลิก" (ไม่ทำ action ที่ยืนยันไว้)
  const dismiss = () => {
    const cancel = current?.buttons.find((b) => b.style === 'cancel');
    setQueue((q) => q.slice(1));
    cancel?.onPress?.();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={dismiss}>
      <View style={s.overlay}>
        <View style={s.card} accessibilityViewIsModal>
          {current && (
            <>
              <Text style={s.title}>{current.title}</Text>
              {!!current.message && <Text style={s.message}>{current.message}</Text>}
              <View style={s.buttons}>
                {current.buttons.map((btn, i) => {
                  // cancel = ปุ่มขอบ (รอง); default/destructive = ปุ่มทึบ (เด่น)
                  const kind = btn.style ?? 'default';
                  return (
                    <Pressable
                      key={`${btn.text}-${i}`}
                      // testID ให้ E2E ยิงปุ่มใน popup ได้แน่นอน ไม่ชนกับปุ่มบนหน้าจอ
                      // (เช่น ปุ่มลบสมาชิก aria-label "ลบ" ชนกับปุ่มยืนยัน "ลบ" ใน popup)
                      testID={`popup-btn-${kind}`}
                      style={[s.btn, kind === 'cancel' ? s.btnCancel : s.btnFilled, kind === 'destructive' && s.btnDanger]}
                      onPress={() => press(btn)}
                      {...a11y('button')}
                      accessibilityLabel={btn.text}
                    >
                      <Text
                        style={[
                          s.btnText,
                          kind === 'cancel' ? s.btnCancelText : s.btnFilledText,
                        ]}
                      >
                        {btn.text}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    },
    card: {
      width: '100%',
      maxWidth: 360,
      backgroundColor: c.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.border,
      padding: 20,
      gap: 10,
    },
    title: { color: c.text, fontSize: 18, fontWeight: '800' },
    message: { color: c.sub, fontSize: 14, lineHeight: 20 },
    buttons: { gap: 10, marginTop: 6 },
    btn: {
      borderRadius: 10,
      paddingVertical: 14,
      paddingHorizontal: 16,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 48,
    },
    btnFilled: { backgroundColor: c.primary },
    btnDanger: { backgroundColor: c.danger },
    btnCancel: { borderWidth: 1, borderColor: c.border },
    btnText: { fontSize: 16, fontWeight: '800' },
    btnFilledText: { color: c.onPrimary },
    btnCancelText: { color: c.text, fontWeight: '700' },
  });
