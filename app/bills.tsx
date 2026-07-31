import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { billComplete, computeBill } from '../src/domain/split';
import { Bill } from '../src/domain/types';
import { baht, categoryLabel, colors, splitModeLabel } from '../src/ui';
import { useStore } from '../src/data/store';

const CATS: Bill['category'][] = ['food', 'drink', 'mixed'];

export default function Bills() {
  const { state, addBill } = useStore();
  const router = useRouter();
  const [name, setName] = useState('');
  const [cat, setCat] = useState<Bill['category']>('food');

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
          placeholderTextColor={colors.sub}
          style={s.input}
          onSubmitEditing={submit}
          returnKeyType="done"
          accessibilityLabel="ชื่อบิล"
          accessibilityHint="ปล่อยว่างได้ ระบบจะตั้งชื่อบิลให้อัตโนมัติ"
        />
        <View style={s.chips}>
          {CATS.map((c) => (
            <Pressable
              key={c}
              onPress={() => setCat(c)}
              style={[s.chip, cat === c && s.chipActive]}
            >
              <Text style={[s.chipText, cat === c && s.chipTextActive]}>{categoryLabel[c]}</Text>
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
        const bd = computeBill(b, state.members);
        const payer = state.members.find((m) => m.id === b.paidById);
        const complete = billComplete(b);
        return (
          <Pressable
            key={b.id}
            style={[s.card, !complete && s.cardIncomplete]}
            onPress={() => router.push(`/bill/${b.id}` as never)}
            accessibilityRole="button"
            accessibilityLabel={`บิล ${b.name} ยอดรวม ${baht(bd.total)}${complete ? '' : ' ยังไม่สมบูรณ์'} แตะเพื่อดูรายละเอียด`}
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
            {!complete && <Text style={s.incompleteTag}>⚠️ ยังไม่เข้าสรุป — แตะเพื่อแก้ให้ครบ</Text>}
          </Pressable>
        );
      })}
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
  input: {
    backgroundColor: colors.cardAlt,
    color: colors.text,
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
    backgroundColor: colors.cardAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.sub, fontSize: 14 },
  chipTextActive: { color: '#fff', fontWeight: '700' },
  addBtn: { backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  empty: { color: colors.sub, textAlign: 'center', marginTop: 20 },
  emptyBox: { alignItems: 'center', gap: 6, paddingVertical: 32, paddingHorizontal: 24 },
  emptyIcon: { fontSize: 44 },
  emptyTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  emptyDesc: { color: colors.sub, fontSize: 13, textAlign: 'center' },
  card: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 16,
    gap: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardIncomplete: { borderColor: colors.food },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardName: { color: colors.text, fontSize: 18, fontWeight: '700' },
  cardTotal: { color: colors.primary, fontSize: 18, fontWeight: '800' },
  cardMeta: { color: colors.sub, fontSize: 13 },
  incompleteTag: { color: colors.food, fontSize: 12, fontWeight: '700', marginTop: 4 },
});
