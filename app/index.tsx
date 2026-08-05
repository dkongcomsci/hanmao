import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { computeTotals } from '../src/domain/split';
import { baht, Palette } from '../src/ui';
import { useTheme } from '../src/ui/theme';
import { useStore } from '../src/data/store';

export default function Home() {
  const { state, mode, group, remoteEnabled } = useStore();
  const { colors: c } = useTheme();
  const s = useMemo(() => makeStyles(c), [c]);
  const router = useRouter();
  // เวลาอ้างอิงเดียวสำหรับทั้ง render (บิลโหมด "หารตามเวลา" ต้องใช้ค่าเดียวกันทุกจุด)
  const now = Date.now();
  const { grandTotal } = computeTotals(state, now);
  const here = state.members.filter((m) => !m.leftAt).length;

  const hasMembers = state.members.length > 0;
  const hasBills = state.bills.length > 0;
  const isNew = !hasMembers && !hasBills;

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      <View style={s.hero} accessible accessibilityLabel={`ยอดรวมทั้งหมด ${baht(grandTotal)}`}>
        <Text style={s.heroLabel}>ยอดรวมทั้งหมด</Text>
        <Text style={s.heroValue}>{baht(grandTotal)}</Text>
        <Text style={s.heroSub}>
          {state.members.length} คน · ยังอยู่ {here} · {state.bills.length} บิล
        </Text>
      </View>

      {/* แถบวง: โชว์ชื่อวงถ้าอยู่ในวง หรือชวนสร้าง/เข้าร่วมวงถ้ายังไม่มี */}
      {remoteEnabled && (
        <Pressable
          style={s.groupBar}
          onPress={() => router.push('/group' as never)}
          accessibilityRole="button"
          accessibilityLabel={
            mode === 'group' && group ? `อยู่ในวง ${group.name} แตะเพื่อดูรายละเอียด` : 'สร้างหรือเข้าร่วมวงหลายคน'
          }
        >
          <Text style={s.groupIcon}>{mode === 'group' ? '🟢' : '👥'}</Text>
          <View style={{ flex: 1 }}>
            <Text style={s.groupTitle}>
              {mode === 'group' && group ? group.name : 'หารร่วมกันหลายคน'}
            </Text>
            <Text style={s.groupDesc}>
              {mode === 'group'
                ? 'อยู่ในวง · แตะเพื่อดู QR/ลิงก์เชิญ'
                : 'สร้างวง แล้วชวนเพื่อนด้วย QR หรือลิงก์'}
            </Text>
          </View>
          <Text style={s.chevron}>›</Text>
        </Pressable>
      )}

      {/* onboarding: แนะนำ 3 ขั้นสำหรับผู้ใช้ใหม่ */}
      {isNew && (
        <View style={s.onboard}>
          <Text style={s.onboardTitle}>เริ่มใช้งานใน 3 ขั้น 👋</Text>
          <Step s={s} n={1} title="เพิ่มสมาชิก" desc="ใครร่วมวงบ้าง กินอาหารหรือเครื่องดื่ม" />
          <Step s={s} n={2} title="สร้างบิล" desc="ใส่เมนู เลือกคนจ่าย และวิธีหาร" />
          <Step s={s} n={3} title="ดูสรุป" desc="ใครจ่ายเท่าไร ใครโอนให้ใคร" />
          <Pressable
            style={s.cta}
            onPress={() => router.push('/members' as never)}
            accessibilityRole="button"
            accessibilityLabel="เริ่มต้น ไปหน้าเพิ่มสมาชิก"
          >
            <Text style={s.ctaText}>เริ่มเลย → เพิ่มสมาชิก</Text>
          </Pressable>
        </View>
      )}

      {/* ทางลัด (ยังมีไว้ให้กดถึงเร็ว นอกจากแท็บ) */}
      {!isNew && (
        <>
          <NavCard
            s={s}
            onPress={() => router.push('/members' as never)}
            icon="👥"
            title="สมาชิก"
            desc={hasMembers ? `${state.members.length} คน` : 'ยังไม่มีสมาชิก — แตะเพื่อเพิ่ม'}
            accent={c.food}
          />
          <NavCard
            s={s}
            onPress={() => router.push('/bills' as never)}
            icon="🧾"
            title="บิลทั้งหมด"
            desc={hasBills ? `${state.bills.length} บิล` : 'ยังไม่มีบิล — แตะเพื่อสร้าง'}
            accent={c.drink}
          />
          <NavCard
            s={s}
            onPress={() => router.push('/summary' as never)}
            icon="💰"
            title="สรุปหารเงิน"
            desc="ยอดต่อคน + ใครโอนให้ใคร"
            accent={c.primary}
          />
        </>
      )}
    </ScrollView>
  );
}

type Styles = ReturnType<typeof makeStyles>;

function Step({ s, n, title, desc }: Readonly<{ s: Styles; n: number; title: string; desc: string }>) {
  return (
    <View style={s.step}>
      <View style={s.stepNum}>
        <Text style={s.stepNumText}>{n}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.stepTitle}>{title}</Text>
        <Text style={s.stepDesc}>{desc}</Text>
      </View>
    </View>
  );
}

function NavCard({
  s,
  onPress,
  icon,
  title,
  desc,
  accent,
}: Readonly<{
  s: Styles;
  onPress: () => void;
  icon: string;
  title: string;
  desc: string;
  accent: string;
}>) {
  return (
    <Pressable
      style={s.card}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${desc}`}
    >
      <View style={[s.accent, { backgroundColor: accent }]} />
      <Text style={s.cardIcon}>{icon}</Text>
      <View style={s.cardBody}>
        <Text style={s.cardTitle}>{title}</Text>
        <Text style={s.cardDesc}>{desc}</Text>
      </View>
      <Text style={s.chevron}>›</Text>
    </Pressable>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.bg },
  content: { padding: 16, gap: 12 },
  hero: {
    backgroundColor: c.card,
    borderRadius: 20,
    padding: 24,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: c.border,
  },
  heroLabel: { color: c.sub, fontSize: 14 },
  heroValue: { color: c.text, fontSize: 40, fontWeight: '800', marginVertical: 4 },
  heroSub: { color: c.sub, fontSize: 13 },
  groupBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: c.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: c.border,
    padding: 14,
  },
  groupIcon: { fontSize: 22 },
  groupTitle: { color: c.text, fontSize: 16, fontWeight: '700' },
  groupDesc: { color: c.sub, fontSize: 12, marginTop: 2 },
  onboard: {
    backgroundColor: c.card,
    borderRadius: 16,
    padding: 18,
    gap: 14,
    borderWidth: 1,
    borderColor: c.border,
  },
  onboardTitle: { color: c.text, fontSize: 18, fontWeight: '800' },
  step: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  stepNum: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: c.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumText: { color: c.onPrimary, fontWeight: '800' },
  stepTitle: { color: c.text, fontSize: 15, fontWeight: '700' },
  stepDesc: { color: c.sub, fontSize: 13 },
  cta: {
    backgroundColor: c.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  ctaText: { color: c.onPrimary, fontWeight: '800', fontSize: 16 },
  card: {
    backgroundColor: c.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: c.border,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
  },
  accent: { width: 6, alignSelf: 'stretch' },
  cardIcon: { fontSize: 24, marginLeft: 14 },
  cardBody: { padding: 16, flex: 1 },
  cardTitle: { color: c.text, fontSize: 18, fontWeight: '700' },
  cardDesc: { color: c.sub, fontSize: 13, marginTop: 4 },
  chevron: { color: c.sub, fontSize: 28, paddingRight: 16 },
});
