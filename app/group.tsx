import * as Linking from 'expo-linking';
import { useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { colors, confirmRemove } from '../src/ui';
import { useStore } from '../src/data/store';

/** ลิงก์เชิญเข้าวง — deep link ที่ expo-router จับที่ route join/[code] */
function inviteUrl(code: string): string {
  return Linking.createURL(`join/${code}`);
}

export default function GroupScreen() {
  const { mode, group, state, myMemberId, remoteEnabled, createGroup, joinGroup, leaveGroup } =
    useStore();

  if (!remoteEnabled) {
    return (
      <ScrollView style={s.container} contentContainerStyle={s.content}>
        <View style={s.emptyBox}>
          <Text style={s.emptyIcon}>🔌</Text>
          <Text style={s.emptyTitle}>ยังไม่ได้ตั้งค่าเซิร์ฟเวอร์</Text>
          <Text style={s.emptyDesc}>
            โหมดหลายคนต้องตั้งค่า Supabase ก่อน (ดู config/.env.example){'\n'}
            ตอนนี้ใช้งานคนเดียวได้ตามปกติ ข้อมูลเก็บในเครื่อง
          </Text>
        </View>
      </ScrollView>
    );
  }

  if (mode === 'group' && group) {
    return <InGroup group={group} state={state} myMemberId={myMemberId} onLeave={leaveGroup} />;
  }

  return <NoGroup onCreate={createGroup} onJoin={joinGroup} />;
}

/** ยังไม่อยู่วง: สร้างวงใหม่ หรือเข้าร่วมด้วยโค้ด */
function NoGroup({
  onCreate,
  onJoin,
}: Readonly<{ onCreate: (name: string) => Promise<unknown>; onJoin: (code: string) => Promise<void> }>) {
  const [groupName, setGroupName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setErr(null);
    try {
      await fn();
    } catch {
      setErr('ทำรายการไม่สำเร็จ ลองใหม่อีกครั้ง');
    } finally {
      setBusy(false);
    }
  };

  const canCreate = groupName.trim().length > 0 && !busy;
  const canJoin = code.trim().length >= 4 && !busy;

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      <View style={s.form}>
        <Text style={s.formTitle}>สร้างวงใหม่</Text>
        <Text style={s.formDesc}>ชวนเพื่อนเข้าวงเดียวกันด้วย QR หรือลิงก์ แล้วช่วยกันแก้บิลแบบเรียลไทม์</Text>
        <TextInput
          value={groupName}
          onChangeText={setGroupName}
          placeholder="ชื่อวง เช่น มื้อเย็นศุกร์นี้"
          placeholderTextColor={colors.sub}
          style={s.input}
          returnKeyType="done"
          accessibilityLabel="ชื่อวง"
        />
        <Pressable
          style={[s.primaryBtn, !canCreate && s.btnDisabled]}
          onPress={() => run(() => onCreate(groupName))}
          disabled={!canCreate}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canCreate }}
          accessibilityLabel="สร้างวงใหม่"
        >
          <Text style={s.primaryBtnText}>+ สร้างวง</Text>
        </Pressable>
      </View>

      <View style={s.form}>
        <Text style={s.formTitle}>เข้าร่วมด้วยโค้ด</Text>
        <Text style={s.formDesc}>มีโค้ดเชิญจากเพื่อนแล้ว? กรอกด้านล่าง</Text>
        <TextInput
          value={code}
          onChangeText={(t) => setCode(t.toUpperCase())}
          placeholder="เช่น ABC123"
          placeholderTextColor={colors.sub}
          autoCapitalize="characters"
          autoCorrect={false}
          style={[s.input, s.codeInput]}
          returnKeyType="go"
          accessibilityLabel="โค้ดเชิญเข้าวง"
        />
        <Pressable
          style={[s.secondaryBtn, !canJoin && s.btnDisabled]}
          onPress={() => run(() => onJoin(code))}
          disabled={!canJoin}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canJoin }}
          accessibilityLabel="เข้าร่วมวง"
        >
          <Text style={s.secondaryBtnText}>เข้าร่วมวง</Text>
        </Pressable>
      </View>

      {busy && <ActivityIndicator color={colors.primary} />}
      {err && <Text style={s.error}>{err}</Text>}
    </ScrollView>
  );
}

/** อยู่ในวงแล้ว: โชว์ QR + ลิงก์ + รายชื่อคนในวง + ปุ่มออก */
function InGroup({
  group,
  state,
  myMemberId,
  onLeave,
}: Readonly<{
  group: { id: string; name: string; inviteCode: string };
  state: ReturnType<typeof useStore>['state'];
  myMemberId: string | null;
  onLeave: () => Promise<void>;
}>) {
  const url = inviteUrl(group.inviteCode);
  const [copied, setCopied] = useState(false);

  const share = async () => {
    const message = `เข้าร่วมวง "${group.name}" ในหารเมา\nโค้ด: ${group.inviteCode}\n${url}`;
    if (Platform.OS === 'web') {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const nav = globalThis.navigator as any;
        if (nav?.clipboard) {
          await nav.clipboard.writeText(url);
          setCopied(true);
        }
      } catch {
        // เงียบไว้ ถ้าคัดลอกไม่ได้ ผู้ใช้ยังเห็นลิงก์บนจอ
      }
      return;
    }
    await Share.share({ message }).catch(() => {});
  };

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      <View style={s.form}>
        <Text style={s.groupName}>{group.name}</Text>
        <Text style={s.formDesc}>ให้เพื่อนสแกน QR นี้ หรือเปิดลิงก์เพื่อเข้าวง</Text>
        <View style={s.qrWrap}>
          <QRCode value={url} size={196} backgroundColor="#fff" color="#0b0d10" />
        </View>
        <View style={s.codeBox}>
          <Text style={s.codeLabel}>โค้ดเชิญ</Text>
          <Text style={s.codeValue}>{group.inviteCode}</Text>
        </View>
        <Text style={s.linkText} numberOfLines={1} accessibilityLabel={`ลิงก์เชิญ ${url}`}>
          {url}
        </Text>
        <Pressable
          style={s.primaryBtn}
          onPress={share}
          accessibilityRole="button"
          accessibilityLabel={Platform.OS === 'web' ? 'คัดลอกลิงก์เชิญ' : 'แชร์ลิงก์เชิญ'}
        >
          <Text style={s.primaryBtnText}>
            {Platform.OS === 'web' ? (copied ? '✓ คัดลอกแล้ว' : '📋 คัดลอกลิงก์') : '📤 แชร์ลิงก์'}
          </Text>
        </Pressable>
      </View>

      <View style={s.form}>
        <Text style={s.formTitle}>คนในวง ({state.members.length})</Text>
        {state.members.length === 0 && <Text style={s.formDesc}>ยังไม่มีสมาชิก — ไปหน้าสมาชิกเพื่อเพิ่ม</Text>}
        {state.members.map((m) => (
          <View key={m.id} style={s.memberRow}>
            <Text style={s.memberName}>{m.name}</Text>
            {m.id === myMemberId && <Text style={s.youTag}>คุณ</Text>}
          </View>
        ))}
      </View>

      <Pressable
        style={s.leaveBtn}
        onPress={() => confirmRemove(`ออกจากวง "${group.name}"`, () => void onLeave())}
        accessibilityRole="button"
        accessibilityLabel="ออกจากวง"
      >
        <Text style={s.leaveBtnText}>ออกจากวง</Text>
      </Pressable>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 12 },
  form: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  formTitle: { color: colors.text, fontSize: 18, fontWeight: '800' },
  formDesc: { color: colors.sub, fontSize: 13, lineHeight: 19 },
  groupName: { color: colors.text, fontSize: 22, fontWeight: '800' },
  input: {
    backgroundColor: colors.cardAlt,
    color: colors.text,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  codeInput: { fontSize: 20, fontWeight: '800', letterSpacing: 4, textAlign: 'center' },
  primaryBtn: { backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
  primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  secondaryBtn: {
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.primary,
  },
  secondaryBtnText: { color: colors.primary, fontWeight: '800', fontSize: 16 },
  btnDisabled: { opacity: 0.4 },
  error: { color: colors.danger, fontSize: 13, textAlign: 'center' },
  qrWrap: { alignSelf: 'center', backgroundColor: '#fff', padding: 14, borderRadius: 14 },
  codeBox: { alignItems: 'center', gap: 2 },
  codeLabel: { color: colors.sub, fontSize: 12 },
  codeValue: { color: colors.text, fontSize: 28, fontWeight: '800', letterSpacing: 6 },
  linkText: { color: colors.sub, fontSize: 12, textAlign: 'center' },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  memberName: { color: colors.text, fontSize: 16, flex: 1 },
  youTag: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '700',
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  leaveBtn: { borderRadius: 10, paddingVertical: 13, alignItems: 'center', borderWidth: 1, borderColor: colors.danger },
  leaveBtnText: { color: colors.danger, fontWeight: '800', fontSize: 15 },
  emptyBox: { alignItems: 'center', gap: 6, paddingVertical: 40, paddingHorizontal: 24 },
  emptyIcon: { fontSize: 44 },
  emptyTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  emptyDesc: { color: colors.sub, fontSize: 13, textAlign: 'center', lineHeight: 20 },
});
