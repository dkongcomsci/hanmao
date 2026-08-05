import * as Linking from 'expo-linking';
import { useMemo, useState } from 'react';
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
import { a11y, confirmAction, copyText, friendlyError, notify, Palette } from '../src/ui';
import { useTheme } from '../src/ui/theme';
import { useStore } from '../src/data/store';

/** ลิงก์เชิญเข้าวง — deep link ที่ expo-router จับที่ route join/[code] */
function inviteUrl(code: string): string {
  return Linking.createURL(`join/${code}`);
}

export default function GroupScreen() {
  const { mode, group, state, myMemberId, remoteEnabled, createGroup, joinGroup, leaveGroup } =
    useStore();
  const { colors: c } = useTheme();
  const s = useMemo(() => makeStyles(c), [c]);

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
  const { colors: c } = useTheme();
  const s = useMemo(() => makeStyles(c), [c]);
  const [groupName, setGroupName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const run = async (fn: () => Promise<unknown>, failMsg: string) => {
    setBusy(true);
    setErr(null);
    try {
      await fn();
    } catch (e) {
      // ใช้เหตุผลจริงจาก store (เช่น "ไม่พบวงจากโค้ดนี้") ถ้ามี ไม่ทับด้วยข้อความกลาง ๆ
      setErr(friendlyError(e, failMsg));
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
          placeholderTextColor={c.sub}
          style={s.input}
          returnKeyType="done"
          accessibilityLabel="ชื่อวง"
        />
        <Pressable
          style={[s.primaryBtn, !canCreate && s.btnDisabled]}
          onPress={() => run(() => onCreate(groupName), 'สร้างวงไม่สำเร็จ ตรวจอินเทอร์เน็ตแล้วลองใหม่')}
          disabled={!canCreate}
          {...a11y('button', { disabled: !canCreate })}
          accessibilityLabel="สร้างวงใหม่"
          accessibilityHint={canCreate ? undefined : 'ตั้งชื่อวงก่อนจึงจะสร้างได้'}
        >
          <Text style={s.primaryBtnText}>+ สร้างวง</Text>
        </Pressable>
        <Text style={s.formDesc}>ข้อมูลสมาชิก/บิลที่มีในเครื่องอยู่แล้วจะถูกย้ายขึ้นวงให้</Text>
      </View>

      <View style={s.form}>
        <Text style={s.formTitle}>เข้าร่วมด้วยโค้ด</Text>
        <Text style={s.formDesc}>มีโค้ดเชิญจากเพื่อนแล้ว? กรอกด้านล่าง</Text>
        <TextInput
          value={code}
          onChangeText={(t) => setCode(t.toUpperCase())}
          placeholder="เช่น ABC123"
          placeholderTextColor={c.sub}
          autoCapitalize="characters"
          autoCorrect={false}
          style={[s.input, s.codeInput]}
          returnKeyType="go"
          accessibilityLabel="โค้ดเชิญเข้าวง"
        />
        <Pressable
          style={[s.secondaryBtn, !canJoin && s.btnDisabled]}
          onPress={() => run(() => onJoin(code), 'เข้าร่วมไม่สำเร็จ — ตรวจโค้ดอีกครั้ง หรือวงอาจถูกปิดแล้ว')}
          disabled={!canJoin}
          {...a11y('button', { disabled: !canJoin })}
          accessibilityLabel="เข้าร่วมวง"
          accessibilityHint={canJoin ? undefined : 'กรอกโค้ดเชิญอย่างน้อย 4 ตัวก่อน'}
        >
          <Text style={s.secondaryBtnText}>เข้าร่วมวง</Text>
        </Pressable>
      </View>

      {busy && <ActivityIndicator color={c.primary} />}
      {err && (
        <Text style={s.error} accessibilityRole="alert">
          {err}
        </Text>
      )}
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
  const { colors: c } = useTheme();
  const s = useMemo(() => makeStyles(c), [c]);
  const url = inviteUrl(group.inviteCode);
  const [copied, setCopied] = useState(false);
  const [leaving, setLeaving] = useState(false);

  // web: คัดลอกลิงก์ (Share sheet ไม่มีบนเว็บ), native: เปิด share sheet
  const share = async () => {
    const message = `เข้าร่วมวง "${group.name}" ในหารเมา\nโค้ด: ${group.inviteCode}\n${url}`;
    if (Platform.OS === 'web') {
      const ok = await copyText(url);
      if (ok) setCopied(true);
      else notify('คัดลอกไม่สำเร็จ', `คัดลอกลิงก์นี้เองได้เลย\n${url}`);
      return;
    }
    await Share.share({ message }).catch(() => {
      notify('แชร์ไม่สำเร็จ', 'ลองใหม่อีกครั้ง');
    });
  };

  // ออกจากวง: ตัวเราหลุดจากวง (ข้อมูลวงยังอยู่กับคนอื่น) — ยืนยันก่อน
  const onLeavePress = () => {
    confirmAction({
      title: `ออกจากวง "${group.name}"?`,
      message: 'คุณจะไม่เห็นข้อมูลวงนี้อีก (วงยังอยู่กับคนอื่น) และกลับไปใช้ข้อมูลในเครื่อง',
      confirmLabel: 'ออกจากวง',
      onConfirm: () => {
        setLeaving(true);
        onLeave()
          .catch((e) => notify('ออกจากวงไม่สำเร็จ', friendlyError(e, 'ลองใหม่อีกครั้ง')))
          .finally(() => setLeaving(false));
      },
    });
  };

  // ป้ายปุ่มแชร์/คัดลอก ตามแพลตฟอร์มและสถานะ
  let shareLabel: string;
  if (Platform.OS !== 'web') shareLabel = '📤 แชร์ลิงก์';
  else if (copied) shareLabel = '✓ คัดลอกแล้ว';
  else shareLabel = '📋 คัดลอกลิงก์';

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      <View style={s.form}>
        <Text style={s.groupName}>{group.name}</Text>
        <Text style={s.formDesc}>ให้เพื่อนสแกน QR นี้ หรือเปิดลิงก์เพื่อเข้าวง</Text>
        <View style={s.qrWrap} accessible accessibilityLabel={`คิวอาร์โค้ดเชิญเข้าวง ${group.name}`}>
          <QRCode value={url} size={196} backgroundColor={c.surfaceLight} color={c.onLight} />
        </View>
        <View style={s.codeBox} accessible accessibilityLabel={`โค้ดเชิญ ${group.inviteCode}`}>
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
          <Text style={s.primaryBtnText}>{shareLabel}</Text>
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
        {!myMemberId && state.members.length > 0 && (
          <Text style={s.formDesc}>ยังไม่ได้เลือกว่าคุณคือใครในวง — เลือกได้ที่แท็บ “ฉัน”</Text>
        )}
      </View>

      <Pressable
        style={[s.leaveBtn, leaving && s.btnDisabled]}
        onPress={onLeavePress}
        disabled={leaving}
        {...a11y('button', { disabled: leaving })}
        accessibilityLabel="ออกจากวง"
      >
        <Text style={s.leaveBtnText}>{leaving ? 'กำลังออกจากวง...' : 'ออกจากวง'}</Text>
      </Pressable>
    </ScrollView>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.bg },
  content: { padding: 16, gap: 12 },
  form: {
    backgroundColor: c.card,
    borderRadius: 16,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: c.border,
  },
  formTitle: { color: c.text, fontSize: 18, fontWeight: '800' },
  formDesc: { color: c.sub, fontSize: 13, lineHeight: 19 },
  groupName: { color: c.text, fontSize: 22, fontWeight: '800' },
  input: {
    backgroundColor: c.cardAlt,
    color: c.text,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  codeInput: { fontSize: 20, fontWeight: '800', letterSpacing: 4, textAlign: 'center' },
  primaryBtn: {
    backgroundColor: c.primary,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  primaryBtnText: { color: c.onPrimary, fontWeight: '800', fontSize: 16 },
  secondaryBtn: {
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: c.primary,
    minHeight: 44,
    justifyContent: 'center',
  },
  secondaryBtnText: { color: c.primary, fontWeight: '800', fontSize: 16 },
  btnDisabled: { opacity: 0.4 },
  error: { color: c.danger, fontSize: 13, textAlign: 'center' },
  // พื้นหลัง QR ต้องสว่างจริงเสมอ ไม่ตามธีมมืด ไม่งั้นสแกนไม่ติด
  qrWrap: { alignSelf: 'center', backgroundColor: c.surfaceLight, padding: 14, borderRadius: 14 },
  codeBox: { alignItems: 'center', gap: 2 },
  codeLabel: { color: c.sub, fontSize: 12 },
  codeValue: { color: c.text, fontSize: 28, fontWeight: '800', letterSpacing: 6 },
  linkText: { color: c.sub, fontSize: 12, textAlign: 'center' },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  memberName: { color: c.text, fontSize: 16, flex: 1 },
  youTag: {
    color: c.primary,
    fontSize: 12,
    fontWeight: '700',
    borderWidth: 1,
    borderColor: c.primary,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  leaveBtn: {
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: c.danger,
    minHeight: 44,
    justifyContent: 'center',
  },
  leaveBtnText: { color: c.danger, fontWeight: '800', fontSize: 15 },
  emptyBox: { alignItems: 'center', gap: 6, paddingVertical: 40, paddingHorizontal: 24 },
  emptyIcon: { fontSize: 44 },
  emptyTitle: { color: c.text, fontSize: 16, fontWeight: '700' },
  emptyDesc: { color: c.sub, fontSize: 13, textAlign: 'center', lineHeight: 20 },
});
