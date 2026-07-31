import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
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
import { colors, consumesLabel } from '../../src/ui';
import { useStore } from '../../src/data/store';

const OPTIONS: Consumes[] = ['both', 'food', 'drink'];

type Phase = 'joining' | 'pick' | 'error';

/** เข้าร่วมวงจากลิงก์/QR: hanmao://join/<code> → เลือกว่าเราคือใคร */
export default function JoinByCode() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const router = useRouter();
  const { mode, group, state, remoteEnabled, joinGroup, claimMember, joinAsNewMember } = useStore();

  const [phase, setPhase] = useState<Phase>('joining');
  const [name, setName] = useState('');
  const [consumes, setConsumes] = useState<Consumes>('both');
  const [busy, setBusy] = useState(false);
  const joinedRef = useRef(false); // กัน join ซ้ำเมื่อ component re-render

  useEffect(() => {
    if (!remoteEnabled || !code || joinedRef.current) return;
    joinedRef.current = true;
    (async () => {
      try {
        // ถ้าอยู่วงนี้อยู่แล้ว (กลับเข้าลิงก์เดิม) ข้ามไปเลือกตัวตนได้เลย
        if (!(mode === 'group' && group?.inviteCode === code)) {
          await joinGroup(code);
        }
        setPhase('pick');
      } catch {
        setPhase('error');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, remoteEnabled]);

  const finish = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
      router.replace('/group' as never);
    } catch {
      setBusy(false);
    }
  };

  if (!remoteEnabled) {
    return (
      <Centered icon="🔌" title="ยังไม่ได้ตั้งค่าเซิร์ฟเวอร์" desc="โหมดหลายคนต้องตั้งค่า Supabase ก่อน" />
    );
  }
  if (phase === 'joining') {
    return (
      <View style={s.center}>
        <ActivityIndicator color={colors.primary} size="large" />
        <Text style={s.centerDesc}>กำลังเข้าร่วมวง…</Text>
      </View>
    );
  }
  if (phase === 'error') {
    return (
      <Centered
        icon="⚠️"
        title="เข้าร่วมวงไม่สำเร็จ"
        desc={`ไม่พบวงจากโค้ด "${code}" หรือเชื่อมต่อไม่ได้`}
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
              style={s.memberBtn}
              disabled={busy}
              onPress={() => finish(() => claimMember(m.id))}
              accessibilityRole="button"
              accessibilityLabel={`ฉันคือ ${m.name}`}
            >
              <Text style={s.memberName}>{m.name}</Text>
              <Text style={s.chevron}>›</Text>
            </Pressable>
          ))}
        </View>
      )}

      <View style={s.form}>
        <Text style={s.formTitle}>หรือเพิ่มตัวเองเป็นสมาชิกใหม่</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="ชื่อของคุณ"
          placeholderTextColor={colors.sub}
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
              accessibilityRole="button"
              accessibilityState={{ selected: consumes === o }}
              accessibilityLabel={consumesLabel[o]}
            >
              <Text style={[s.chipText, consumes === o && s.chipTextActive]}>{consumesLabel[o]}</Text>
            </Pressable>
          ))}
        </View>
        <Pressable
          style={[s.primaryBtn, !canCreate && s.btnDisabled]}
          disabled={!canCreate}
          onPress={() => finish(() => joinAsNewMember(name, consumes))}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canCreate }}
          accessibilityLabel="เข้าร่วมเป็นสมาชิกใหม่"
        >
          <Text style={s.primaryBtnText}>เข้าร่วมเป็นฉัน</Text>
        </Pressable>
      </View>

      {busy && <ActivityIndicator color={colors.primary} />}
    </ScrollView>
  );
}

function Centered({
  icon,
  title,
  desc,
  action,
}: Readonly<{
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

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 12 },
  title: { color: colors.text, fontSize: 22, fontWeight: '800' },
  subtitle: { color: colors.sub, fontSize: 15, marginBottom: 4 },
  form: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  formTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },
  memberBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.cardAlt,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  memberName: { color: colors.text, fontSize: 16, flex: 1, fontWeight: '600' },
  chevron: { color: colors.sub, fontSize: 24 },
  input: {
    backgroundColor: colors.cardAlt,
    color: colors.text,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  fieldLabel: { color: colors.sub, fontSize: 13, fontWeight: '600' },
  chips: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.cardAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.sub, fontSize: 14 },
  chipTextActive: { color: '#fff', fontWeight: '700' },
  primaryBtn: { backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
  primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  btnDisabled: { opacity: 0.4 },
  center: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24 },
  centerIcon: { fontSize: 48 },
  centerTitle: { color: colors.text, fontSize: 18, fontWeight: '800' },
  centerDesc: { color: colors.sub, fontSize: 14, textAlign: 'center' },
});
