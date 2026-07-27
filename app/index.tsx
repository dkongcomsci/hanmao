import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { computeTotals } from '../src/domain/split';
import { baht, colors } from '../src/ui';
import { useStore } from '../src/data/store';

export default function Home() {
  const { state } = useStore();
  const router = useRouter();
  const { grandTotal } = computeTotals(state);
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

      {/* onboarding: แนะนำ 3 ขั้นสำหรับผู้ใช้ใหม่ */}
      {isNew && (
        <View style={s.onboard}>
          <Text style={s.onboardTitle}>เริ่มใช้งานใน 3 ขั้น 👋</Text>
          <Step n={1} title="เพิ่มสมาชิก" desc="ใครร่วมวงบ้าง กินอาหารหรือเครื่องดื่ม" />
          <Step n={2} title="สร้างบิล" desc="ใส่เมนู เลือกคนจ่าย และวิธีหาร" />
          <Step n={3} title="ดูสรุป" desc="ใครจ่ายเท่าไร ใครโอนให้ใคร" />
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
            onPress={() => router.push('/members' as never)}
            icon="👥"
            title="สมาชิก"
            desc={hasMembers ? `${state.members.length} คน` : 'ยังไม่มีสมาชิก — แตะเพื่อเพิ่ม'}
            accent={colors.food}
          />
          <NavCard
            onPress={() => router.push('/bills' as never)}
            icon="🧾"
            title="บิลทั้งหมด"
            desc={hasBills ? `${state.bills.length} บิล` : 'ยังไม่มีบิล — แตะเพื่อสร้าง'}
            accent={colors.drink}
          />
          <NavCard
            onPress={() => router.push('/summary' as never)}
            icon="💰"
            title="สรุปหารเงิน"
            desc="ยอดต่อคน + ใครโอนให้ใคร"
            accent={colors.primary}
          />
        </>
      )}
    </ScrollView>
  );
}

function Step({ n, title, desc }: Readonly<{ n: number; title: string; desc: string }>) {
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
  onPress,
  icon,
  title,
  desc,
  accent,
}: Readonly<{
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

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 12 },
  hero: {
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: 24,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  heroLabel: { color: colors.sub, fontSize: 14 },
  heroValue: { color: colors.text, fontSize: 40, fontWeight: '800', marginVertical: 4 },
  heroSub: { color: colors.sub, fontSize: 13 },
  onboard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 18,
    gap: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  onboardTitle: { color: colors.text, fontSize: 18, fontWeight: '800' },
  step: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  stepNum: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumText: { color: '#fff', fontWeight: '800' },
  stepTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },
  stepDesc: { color: colors.sub, fontSize: 13 },
  cta: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  ctaText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
  },
  accent: { width: 6, alignSelf: 'stretch' },
  cardIcon: { fontSize: 24, marginLeft: 14 },
  cardBody: { padding: 16, flex: 1 },
  cardTitle: { color: colors.text, fontSize: 18, fontWeight: '700' },
  cardDesc: { color: colors.sub, fontSize: 13, marginTop: 4 },
  chevron: { color: colors.sub, fontSize: 28, paddingRight: 16 },
});
