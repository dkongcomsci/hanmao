import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { billIssues, computeBill } from '../src/domain/split';
import { Bill } from '../src/domain/types';
import { a11y, baht, categoryLabel, Palette, splitModeLabel } from '../src/ui';
import { useTheme } from '../src/ui/theme';
import { useStore } from '../src/data/store';

const CATS: Bill['category'][] = ['food', 'drink', 'mixed'];

export default function Bills() {
  const { state, addBill } = useStore();
  const { colors: c } = useTheme();
  const s = useMemo(() => makeStyles(c), [c]);
  const router = useRouter();
  const [name, setName] = useState('');
  const [cat, setCat] = useState<Bill['category']>('food');
  // เวลาอ้างอิงเดียวสำหรับทั้ง render (บิลโหมด "หารตามเวลา" ต้องใช้ค่าเดียวกันทุกจุด)
  const now = Date.now();

  const submit = () => {
    const label = name.trim() || `บิล ${state.bills.length + 1}`;
    const id = addBill(label, cat);
    setName('');
    router.push(`/bill/${id}` as never);
  };

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      <View style={s.form}>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="ชื่อบิล เช่น ร้านหมูกระทะ / เบียร์รอบ 2"
          placeholderTextColor={c.sub}
          style={s.input}
          onSubmitEditing={submit}
          returnKeyType="done"
          accessibilityLabel="ชื่อบิล"
          accessibilityHint="ปล่อยว่างได้ ระบบจะตั้งชื่อบิลให้อัตโนมัติ"
        />
        <View style={s.chips}>
          {CATS.map((ct) => (
            <Pressable
              key={ct}
              onPress={() => setCat(ct)}
              style={[s.chip, cat === ct && s.chipActive]}
              {...a11y('button', { selected: cat === ct })}
              accessibilityLabel={`หมวดบิล ${categoryLabel[ct]}`}
            >
              <Text style={[s.chipText, cat === ct && s.chipTextActive]}>{categoryLabel[ct]}</Text>
            </Pressable>
          ))}
        </View>
        <Pressable
          style={s.addBtn}
          onPress={submit}
          accessibilityRole="button"
          accessibilityLabel="เพิ่มบิลใหม่"
        >
          <Text style={s.addBtnText}>+ เพิ่มบิล</Text>
        </Pressable>
      </View>

      {state.bills.length === 0 && (
        <View style={s.emptyBox}>
          <Text style={s.emptyIcon}>🧾</Text>
          <Text style={s.emptyTitle}>ยังไม่มีบิล</Text>
          <Text style={s.emptyDesc}>
            {state.members.length === 0
              ? 'เพิ่มสมาชิกที่แท็บ “สมาชิก” ก่อน แล้วค่อยสร้างบิล'
              : 'พิมพ์ชื่อบิลด้านบนแล้วกด “เพิ่มบิล” เพื่อเริ่ม'}
          </Text>
        </View>
      )}

      {state.bills.map((b) => {
        const bd = computeBill(b, state.members, now);
        const payer = state.members.find((m) => m.id === b.paidById);
        // เหตุผลที่บิลยังไม่เข้าสรุป (ว่าง = ครบแล้ว) — บอกให้เห็นตั้งแต่หน้ารายการ
        const issues = billIssues(b, state.members);
        return (
          <Pressable
            key={b.id}
            style={[s.card, issues.length > 0 && s.cardIncomplete]}
            onPress={() => router.push(`/bill/${b.id}` as never)}
            accessibilityRole="button"
            accessibilityLabel={`บิล ${b.name} ยอดรวม ${baht(bd.total)}${
              issues.length > 0 ? ` ยังไม่เข้าสรุป: ${issues.join(', ')}` : ''
            } แตะเพื่อดูรายละเอียด`}
          >
            <View style={s.cardTop}>
              <Text style={s.cardName}>
                {b.name}
                {b.isTreat ? ' 🎁' : ''}
              </Text>
              <Text style={s.cardTotal}>{baht(bd.total)}</Text>
            </View>
            <Text style={s.cardMeta}>
              {categoryLabel[b.category]} · {splitModeLabel[b.splitMode]} · {b.items.length} เมนู
            </Text>
            <Text style={s.cardMeta}>คนจ่าย: {payer ? payer.name : '— ยังไม่ระบุ'}</Text>
            {issues.length > 0 && (
              <Text style={s.incompleteTag}>
                ⚠️ ยังไม่เข้าสรุป — {issues.join(' · ')}
              </Text>
            )}
          </Pressable>
        );
      })}
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
  input: {
    backgroundColor: c.cardAlt,
    color: c.text,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  chips: { flexDirection: 'row', gap: 8 },
  chip: {
    paddingHorizontal: 16,
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
  addBtn: {
    backgroundColor: c.primary,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  addBtnText: { color: c.onPrimary, fontWeight: '700', fontSize: 16 },
  empty: { color: c.sub, textAlign: 'center', marginTop: 20 },
  emptyBox: { alignItems: 'center', gap: 6, paddingVertical: 32, paddingHorizontal: 24 },
  emptyIcon: { fontSize: 44 },
  emptyTitle: { color: c.text, fontSize: 16, fontWeight: '700' },
  emptyDesc: { color: c.sub, fontSize: 13, textAlign: 'center' },
  card: {
    backgroundColor: c.card,
    borderRadius: 14,
    padding: 16,
    gap: 4,
    borderWidth: 1,
    borderColor: c.border,
  },
  cardIncomplete: { borderColor: c.food },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardName: { color: c.text, fontSize: 18, fontWeight: '700' },
  cardTotal: { color: c.primary, fontSize: 18, fontWeight: '800' },
  cardMeta: { color: c.sub, fontSize: 13 },
  incompleteTag: { color: c.food, fontSize: 12, fontWeight: '700', marginTop: 4 },
});
