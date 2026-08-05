import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Consumes } from '../../src/domain/types';
import { a11y, consumesLabel, friendlyError, Palette } from '../../src/ui';
import { useTheme } from '../../src/ui/theme';
import { useStore } from '../../src/data/store';

const OPTIONS: Consumes[] = ['both', 'food', 'drink'];

type Phase = 'joining' | 'pick' | 'error';

/** เข้าร่วมวงจากลิงก์/QR: hanmao://join/<code> → เลือกว่าเราคือใคร */
export default function JoinByCode() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const router = useRouter();
  const { mode, group, state, remoteEnabled, joinGroup, claimMember, joinAsNewMember } = useStore();
  const { colors: c } = useTheme();
  const s = useMemo(() => makeStyles(c), [c]);

  const [phase, setPhase] = useState<Phase>('joining');
  const [name, setName] = useState('');
  const [consumes, setConsumes] = useState<Consumes>('both');
  const [busy, setBusy] = useState(false);
  const [joinErr, setJoinErr] = useState<string | null>(null); // สาเหตุที่เข้าวงไม่ได้ (แสดงในหน้า error)
  // สาเหตุที่ผูกตัวตนไม่ได้ + มาจากส่วนไหน (แสดงใกล้ปุ่มที่ผู้ใช้กดจริง)
  const [pickErr, setPickErr] = useState<{ where: 'claim' | 'new'; msg: string } | null>(null);
  const joinedRef = useRef(false); // กัน join ซ้ำเมื่อ component re-render

  useEffect(() => {
    if (!remoteEnabled || joinedRef.current) return;
    // ไม่มีโค้ดในลิงก์ = เข้าร่วมไม่ได้ ต้องบอกเลย ไม่ค้างที่หน้าโหลด
    if (!code) {
      setPhase('error');
      return;
    }
    joinedRef.current = true;
    (async () => {
      try {
        // ถ้าอยู่วงนี้อยู่แล้ว (กลับเข้าลิงก์เดิม) ข้ามไปเลือกตัวตนได้เลย
        if (!(mode === 'group' && group?.inviteCode === code)) {
          await joinGroup(code);
        }
        setPhase('pick');
      } catch (e) {
        // บอกสาเหตุจริงจาก store ถ้ามี (เช่น "ไม่พบวงจากโค้ดนี้") ไม่ใช่ขึ้นข้อความกลาง ๆ เฉย ๆ
        setJoinErr(
          friendlyError(e, `เข้าวงจากโค้ด "${code}" ไม่สำเร็จ — วงอาจถูกปิดแล้ว หรือเชื่อมต่อไม่ได้`),
        );
        setPhase('error');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, remoteEnabled]);

  // ผูกตัวตนแล้วไปหน้าวง; ถ้าพลาดต้องบอกผู้ใช้ ไม่ใช่เงียบให้กดซ้ำมั่ว
  const finish = async (where: 'claim' | 'new', fn: () => Promise<void>) => {
    setBusy(true);
    setPickErr(null);
    try {
      await fn();
      router.replace('/group' as never);
    } catch (e) {
      // เช่น ชื่อนี้ถูกคนอื่น claim ไปแล้ว — ต้องเห็นเหตุผลเพื่อรู้ว่าให้เลือกชื่ออื่น
      setPickErr({
        where,
        msg: friendlyError(e, 'บันทึกตัวตนไม่สำเร็จ ตรวจอินเทอร์เน็ตแล้วลองใหม่อีกครั้ง'),
      });
      setBusy(false);
    }
  };

  if (!remoteEnabled) {
    return (
      <Centered
        s={s}
        icon="🔌"
        title="ยังไม่ได้ตั้งค่าเซิร์ฟเวอร์"
        desc="โหมดหลายคนต้องตั้งค่า Supabase ก่อน (ดู config/.env.example) — ตอนนี้ใช้งานคนเดียวได้ตามปกติ"
        action={{ label: 'ไปหน้าแรก', onPress: () => router.replace('/' as never) }}
      />
    );
  }
  if (phase === 'joining') {
    return (
      <View style={s.center}>
        <ActivityIndicator color={c.primary} size="large" />
        <Text style={s.centerDesc}>กำลังเข้าร่วมวง…</Text>
      </View>
    );
  }
  if (phase === 'error') {
    return (
      <Centered
        s={s}
        icon="⚠️"
        title="เข้าร่วมวงไม่สำเร็จ"
        desc={
          code
            ? (joinErr ?? `ไม่พบวงจากโค้ด "${code}" — วงอาจถูกปิดแล้ว หรือเชื่อมต่อไม่ได้`)
            : 'ลิงก์เชิญไม่มีโค้ดวง — ขอลิงก์ใหม่จากคนที่ชวน'
        }
        action={{ label: 'กลับหน้าวง', onPress: () => router.replace('/group' as never) }}
      />
    );
  }

  const canCreate = name.trim().length > 0 && !busy;

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      <Text style={s.title}>เข้าร่วม “{group?.name ?? ''}” แล้ว 🎉</Text>
      <Text style={s.subtitle}>คุณคือใครในวงนี้?</Text>

      {state.members.length > 0 && (
        <View style={s.form}>
          <Text style={s.formTitle}>เลือกจากรายชื่อที่มีอยู่</Text>
          {state.members.map((m) => (
            <Pressable
              key={m.id}
              style={[s.memberBtn, busy && s.btnDisabled]}
              disabled={busy}
              onPress={() => finish('claim', () => claimMember(m.id))}
              {...a11y('button', { disabled: busy })}
              accessibilityLabel={`ฉันคือ ${m.name}${m.userId ? ' (มีคนเลือกชื่อนี้ไว้แล้ว)' : ''}`}
            >
              <View style={{ flex: 1 }}>
                <Text style={s.memberName}>{m.name}</Text>
                {/* มี userId แล้ว = มีเครื่องอื่นผูกชื่อนี้ไว้ ยังเลือกได้ (เช่น เปลี่ยนเครื่อง) แต่ต้องเตือน */}
                {!!m.userId && <Text style={s.memberNote}>มีคนเลือกชื่อนี้ไว้แล้ว</Text>}
              </View>
              <Text style={s.chevron}>›</Text>
            </Pressable>
          ))}
          {pickErr?.where === 'claim' && (
            <Text style={s.error} accessibilityRole="alert">
              {pickErr.msg}
            </Text>
          )}
        </View>
      )}

      <View style={s.form}>
        <Text style={s.formTitle}>หรือเพิ่มตัวเองเป็นสมาชิกใหม่</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="ชื่อของคุณ"
          placeholderTextColor={c.sub}
          style={s.input}
          returnKeyType="done"
          accessibilityLabel="ชื่อของคุณ"
        />
        <Text style={s.fieldLabel}>กินอะไร</Text>
        <View style={s.chips}>
          {OPTIONS.map((o) => (
            <Pressable
              key={o}
              onPress={() => setConsumes(o)}
              style={[s.chip, consumes === o && s.chipActive]}
              {...a11y('button', { selected: consumes === o })}
              accessibilityLabel={consumesLabel[o]}
            >
              <Text style={[s.chipText, consumes === o && s.chipTextActive]}>{consumesLabel[o]}</Text>
            </Pressable>
          ))}
        </View>
        <Pressable
          style={[s.primaryBtn, !canCreate && s.btnDisabled]}
          disabled={!canCreate}
          onPress={() => finish('new', () => joinAsNewMember(name, consumes))}
          {...a11y('button', { disabled: !canCreate })}
          accessibilityLabel="เข้าร่วมเป็นสมาชิกใหม่"
          accessibilityHint={name.trim() ? undefined : 'พิมพ์ชื่อของคุณก่อนจึงจะเข้าร่วมได้'}
        >
          <Text style={s.primaryBtnText}>เข้าร่วมเป็นฉัน</Text>
        </Pressable>
        {pickErr?.where === 'new' && (
          <Text style={s.error} accessibilityRole="alert">
            {pickErr.msg}
          </Text>
        )}
      </View>

      {busy && <ActivityIndicator color={c.primary} />}
    </ScrollView>
  );
}

type Styles = ReturnType<typeof makeStyles>;

function Centered({
  s,
  icon,
  title,
  desc,
  action,
}: Readonly<{
  s: Styles;
  icon: string;
  title: string;
  desc: string;
  action?: { label: string; onPress: () => void };
}>) {
  return (
    <View style={s.center}>
      <Text style={s.centerIcon}>{icon}</Text>
      <Text style={s.centerTitle}>{title}</Text>
      <Text style={s.centerDesc}>{desc}</Text>
      {action && (
        <Pressable style={s.primaryBtn} onPress={action.onPress} accessibilityRole="button" accessibilityLabel={action.label}>
          <Text style={s.primaryBtnText}>{action.label}</Text>
        </Pressable>
      )}
    </View>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.bg },
  content: { padding: 16, gap: 12 },
  title: { color: c.text, fontSize: 22, fontWeight: '800' },
  subtitle: { color: c.sub, fontSize: 15, marginBottom: 4 },
  form: {
    backgroundColor: c.card,
    borderRadius: 16,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: c.border,
  },
  formTitle: { color: c.text, fontSize: 15, fontWeight: '700' },
  memberBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: c.cardAlt,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
    minHeight: 44,
  },
  memberName: { color: c.text, fontSize: 16, fontWeight: '600' },
  memberNote: { color: c.sub, fontSize: 12, marginTop: 2 },
  chevron: { color: c.sub, fontSize: 24 },
  input: {
    backgroundColor: c.cardAlt,
    color: c.text,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  fieldLabel: { color: c.sub, fontSize: 13, fontWeight: '600' },
  chips: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: c.cardAlt,
    borderWidth: 1,
    borderColor: c.border,
    minHeight: 40,
    justifyContent: 'center',
  },
  chipActive: { backgroundColor: c.primary, borderColor: c.primary },
  chipText: { color: c.sub, fontSize: 14 },
  chipTextActive: { color: c.onPrimary, fontWeight: '700' },
  primaryBtn: {
    backgroundColor: c.primary,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  primaryBtnText: { color: c.onPrimary, fontWeight: '800', fontSize: 16 },
  btnDisabled: { opacity: 0.4 },
  error: { color: c.danger, fontSize: 13 },
  center: { flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24 },
  centerIcon: { fontSize: 48 },
  centerTitle: { color: c.text, fontSize: 18, fontWeight: '800' },
  centerDesc: { color: c.sub, fontSize: 14, textAlign: 'center' },
});
