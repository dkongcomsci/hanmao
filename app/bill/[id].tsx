import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { billComplete, billMembers, computeBill } from '../../src/domain/split';
import { SplitMode } from '../../src/domain/types';
import { baht, colors, confirmRemove, consumesLabel, splitModeLabel } from '../../src/ui';
import { useStore } from '../../src/data/store';

const MODES: SplitMode[] = ['equal', 'itemized', 'time'];

export default function BillDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const store = useStore();
  const bill = store.state.bills.find((b) => b.id === id);

  const [itemName, setItemName] = useState('');
  const [itemPrice, setItemPrice] = useState('');

  if (!bill) {
    return (
      <View style={s.container}>
        <Text style={s.empty}>ไม่พบบิลนี้</Text>
      </View>
    );
  }

  const bd = computeBill(bill, store.state.members);
  const eligible = billMembers(bill, store.state.members);
  const complete = billComplete(bill);
  const hasPricedItem = bill.items.some((it) => it.price > 0);

  const addItem = () => {
    const price = parseFloat(itemPrice);
    if (!itemName.trim() || isNaN(price)) return;
    store.addItem(bill.id, itemName, price);
    setItemName('');
    setItemPrice('');
  };

  const num = (v: string) => {
    const n = parseFloat(v);
    return isNaN(n) ? 0 : n;
  };

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      {/* ชื่อบิล */}
      <TextInput
        value={bill.name}
        onChangeText={(t) => store.updateBill(bill.id, { name: t })}
        style={s.title}
        placeholderTextColor={colors.sub}
      />

      {/* เตือนเมื่อบิลยังไม่สมบูรณ์ (ไม่เข้าสรุปจนกว่าจะครบ) */}
      {!complete && (
        <View style={s.warnBox} accessibilityRole="alert">
          <Text style={s.warnTitle}>บิลนี้ยังไม่เข้าสรุป</Text>
          <Text style={s.warnText}>
            {!bill.paidById && '• ต้องเลือกคนออกเงิน\n'}
            {!hasPricedItem && '• ต้องมีเมนูอย่างน้อย 1 รายการที่มีราคา'}
          </Text>
        </View>
      )}

      {/* วิธีหาร */}
      <Text style={s.section}>วิธีหาร</Text>
      <View style={s.chips}>
        {MODES.map((m) => (
          <Pressable
            key={m}
            onPress={() => store.updateBill(bill.id, { splitMode: m })}
            style={[s.chip, bill.splitMode === m && s.chipActive]}
          >
            <Text style={[s.chipText, bill.splitMode === m && s.chipTextActive]}>
              {splitModeLabel[m]}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* คนจ่ายบิลนี้ (จำเป็น) */}
      <Text style={s.section}>
        ใครออกเงินบิลนี้ <Text style={s.required}>*</Text>
      </Text>
      <View style={s.chips}>
        {store.state.members.map((m) => (
          <Pressable
            key={m.id}
            onPress={() =>
              store.updateBill(bill.id, { paidById: bill.paidById === m.id ? null : m.id })
            }
            style={[s.chip, bill.paidById === m.id && s.chipActive]}
            accessibilityRole="button"
            accessibilityState={{ selected: bill.paidById === m.id }}
            accessibilityLabel={`คนออกเงิน ${m.name}`}
          >
            <Text style={[s.chipText, bill.paidById === m.id && s.chipTextActive]}>{m.name}</Text>
          </Pressable>
        ))}
        {store.state.members.length === 0 && <Text style={s.hint}>เพิ่มสมาชิกก่อน</Text>}
      </View>

      {/* บิลเลี้ยง: คนจ่ายรับผิดชอบยอดเต็ม คนอื่นจ่าย 0 */}
      <Pressable
        style={[s.treatRow, bill.isTreat && s.treatRowActive]}
        onPress={() => store.updateBill(bill.id, { isTreat: !bill.isTreat })}
        disabled={!bill.paidById}
        accessibilityRole="switch"
        accessibilityState={{ checked: !!bill.isTreat, disabled: !bill.paidById }}
        accessibilityLabel="บิลนี้คนจ่ายเลี้ยง"
      >
        <View style={{ flex: 1 }}>
          <Text style={[s.treatTitle, !bill.paidById && { opacity: 0.4 }]}>🎁 คนจ่ายเลี้ยง</Text>
          <Text style={[s.treatDesc, !bill.paidById && { opacity: 0.4 }]}>
            {bill.paidById
              ? `${store.state.members.find((m) => m.id === bill.paidById)?.name ?? ''} จ่ายเต็ม คนอื่นไม่ต้องหาร`
              : 'เลือกคนออกเงินก่อน'}
          </Text>
        </View>
        <View style={[s.toggle, bill.isTreat && s.toggleOn]}>
          <View style={[s.knob, bill.isTreat && s.knobOn]} />
        </View>
      </Pressable>

      {/* ใครร่วมบิลนี้ (เผื่อมาทีหลัง/กลับก่อน) */}
      <Text style={s.section}>ใครร่วมบิลนี้</Text>
      <Text style={s.hint}>ไม่เลือก = ทุกคนที่กิน{bill.category !== 'mixed' ? consumesLabel[bill.category] : ''}</Text>
      <View style={s.chips}>
        {store.state.members.map((m) => {
          const on = bill.memberIds.includes(m.id);
          return (
            <Pressable
              key={m.id}
              onPress={() => {
                const next = on
                  ? bill.memberIds.filter((x) => x !== m.id)
                  : [...bill.memberIds, m.id];
                store.updateBill(bill.id, { memberIds: next });
              }}
              style={[s.chip, on && s.chipActive]}
            >
              <Text style={[s.chipText, on && s.chipTextActive]}>{m.name}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* เมนู */}
      <Text style={s.section}>เมนู</Text>
      <View style={s.addItemRow}>
        <TextInput
          value={itemName}
          onChangeText={setItemName}
          placeholder="ชื่อเมนู"
          placeholderTextColor={colors.sub}
          style={[s.input, { flex: 1 }]}
        />
        <TextInput
          value={itemPrice}
          onChangeText={setItemPrice}
          placeholder="ราคา"
          placeholderTextColor={colors.sub}
          keyboardType="numeric"
          style={[s.input, { width: 90 }]}
          onSubmitEditing={addItem}
        />
        <Pressable style={s.addSmall} onPress={addItem}>
          <Text style={s.addBtnText}>+</Text>
        </Pressable>
      </View>

      {bill.items.map((it) => (
        <View key={it.id} style={s.item}>
          <View style={s.itemTop}>
            <Text style={s.itemName}>{it.name}</Text>
            <Text style={s.itemPrice}>{baht(it.price)}</Text>
            <Pressable onPress={() => store.removeItem(bill.id, it.id)}>
              <Text style={s.del}>✕</Text>
            </Pressable>
          </View>
          {bill.splitMode === 'itemized' && (
            <>
              <Text style={s.hint}>ใครกินเมนูนี้ (ไม่เลือก = ทุกคนในบิล)</Text>
              <View style={s.chips}>
                {eligible.map((m) => {
                  const on = it.participantIds.includes(m.id);
                  return (
                    <Pressable
                      key={m.id}
                      onPress={() => store.toggleItemParticipant(bill.id, it.id, m.id)}
                      style={[s.chipSmall, on && s.chipActive]}
                    >
                      <Text style={[s.chipText, on && s.chipTextActive, { fontSize: 12 }]}>
                        {m.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          )}
        </View>
      ))}

      {/* ค่าบริการ / vat / ส่วนลด */}
      <Text style={s.section}>ค่าบริการ & ส่วนลด</Text>
      <View style={s.chargeRow}>
        <ChargeInput
          label="Service %"
          value={String(bill.serviceChargePct)}
          onChange={(v) => store.updateBill(bill.id, { serviceChargePct: num(v) })}
        />
        <ChargeInput
          label="VAT %"
          value={String(bill.vatPct)}
          onChange={(v) => store.updateBill(bill.id, { vatPct: num(v) })}
        />
        <ChargeInput
          label="ส่วนลด ฿"
          value={String(bill.discount)}
          onChange={(v) => store.updateBill(bill.id, { discount: num(v) })}
        />
      </View>

      {/* สรุปบิล */}
      <View style={s.summary}>
        <SumRow label="ยอดเมนู" value={baht(bd.subtotal)} />
        {bd.service > 0 && <SumRow label="Service charge" value={baht(bd.service)} />}
        {bd.vat > 0 && <SumRow label="VAT" value={baht(bd.vat)} />}
        {bd.discount > 0 && <SumRow label="ส่วนลด" value={'-' + baht(bd.discount)} />}
        <SumRow label="รวมบิลนี้" value={baht(bd.total)} bold />
      </View>

      <Text style={s.section}>ยอดต่อคนในบิลนี้</Text>
      {[...bd.perMember.entries()].map(([mid, amt]) => {
        const m = store.state.members.find((x) => x.id === mid);
        if (!m) return null;
        return <SumRow key={mid} label={m.name} value={baht(amt)} />;
      })}
      {bd.perMember.size === 0 && <Text style={s.hint}>ยังไม่มีคนเข้าเงื่อนไขบิลนี้</Text>}

      <Pressable
        style={s.deleteBill}
        onPress={() =>
          confirmRemove(bill.name, () => {
            store.removeBill(bill.id);
            router.back();
          })
        }
        accessibilityRole="button"
        accessibilityLabel={`ลบบิล ${bill.name}`}
      >
        <Text style={s.deleteBillText}>ลบบิลนี้</Text>
      </Pressable>
    </ScrollView>
  );
}

function ChargeInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={s.chargeLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        keyboardType="numeric"
        style={s.input}
        placeholderTextColor={colors.sub}
      />
    </View>
  );
}

function SumRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={s.sumRow}>
      <Text style={[s.sumLabel, bold && s.sumBold]}>{label}</Text>
      <Text style={[s.sumValue, bold && s.sumBold]}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 10, paddingBottom: 40 },
  empty: { color: colors.sub, textAlign: 'center', marginTop: 40 },
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '800',
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  section: { color: colors.text, fontSize: 16, fontWeight: '700', marginTop: 12 },
  required: { color: colors.danger, fontWeight: '800' },
  hint: { color: colors.sub, fontSize: 12 },
  warnBox: {
    backgroundColor: colors.cardAlt,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.food,
    padding: 12,
    gap: 4,
  },
  warnTitle: { color: colors.food, fontSize: 14, fontWeight: '800' },
  warnText: { color: colors.sub, fontSize: 13, lineHeight: 19 },
  treatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginTop: 4,
  },
  treatRowActive: { borderColor: colors.primary },
  treatTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },
  treatDesc: { color: colors.sub, fontSize: 12, marginTop: 2 },
  toggle: {
    width: 48,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.cardAlt,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 2,
    justifyContent: 'center',
  },
  toggleOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  knob: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.sub },
  knobOn: { backgroundColor: '#fff', alignSelf: 'flex-end' },
  chips: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipSmall: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.sub, fontSize: 14 },
  chipTextActive: { color: '#fff', fontWeight: '700' },
  input: {
    backgroundColor: colors.cardAlt,
    color: colors.text,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
  },
  addItemRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  addSmall: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    width: 48,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnText: { color: '#fff', fontWeight: '800', fontSize: 22 },
  item: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 12,
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  itemTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  itemName: { color: colors.text, fontSize: 16, fontWeight: '600', flex: 1 },
  itemPrice: { color: colors.text, fontSize: 16 },
  del: { color: colors.danger, fontSize: 18, paddingHorizontal: 4 },
  chargeRow: { flexDirection: 'row', gap: 8 },
  chargeLabel: { color: colors.sub, fontSize: 12, marginBottom: 4 },
  summary: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 14,
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: 8,
  },
  sumRow: { flexDirection: 'row', justifyContent: 'space-between' },
  sumLabel: { color: colors.sub, fontSize: 14 },
  sumValue: { color: colors.text, fontSize: 14 },
  sumBold: { color: colors.text, fontWeight: '800', fontSize: 16 },
  deleteBill: {
    marginTop: 24,
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  deleteBillText: { color: colors.danger, fontWeight: '700' },
});
