import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { billIssues, billMembers, computeBill } from '../../src/domain/split';
import { SplitMode } from '../../src/domain/types';
import { a11y, baht, confirmRemove, consumesLabel, Palette, splitModeLabel } from '../../src/ui';
import { useTheme } from '../../src/ui/theme';
import { useStore } from '../../src/data/store';

const MODES: SplitMode[] = ['equal', 'itemized', 'time'];

/** แปลงข้อความเป็นตัวเลข (ว่าง/ไม่ใช่เลข = 0) */
function num(v: string): number {
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
}

export default function BillDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const store = useStore();
  const { colors: c } = useTheme();
  const s = useMemo(() => makeStyles(c), [c]);
  const bill = store.state.bills.find((b) => b.id === id);

  const [itemName, setItemName] = useState('');
  const [itemPrice, setItemPrice] = useState('');

  if (!bill) {
    return (
      <View style={s.container}>
        <View style={s.emptyBox}>
          <Text style={s.emptyIcon}>🧾</Text>
          <Text style={s.emptyTitle}>ไม่พบบิลนี้</Text>
          <Text style={s.emptyDesc}>บิลอาจถูกลบไปแล้ว — กลับไปเลือกบิลอื่นที่แท็บ “บิล”</Text>
          <Pressable
            style={s.emptyBtn}
            onPress={() => router.replace('/bills' as never)}
            accessibilityRole="button"
            accessibilityLabel="กลับไปหน้าบิลทั้งหมด"
          >
            <Text style={s.emptyBtnText}>ไปหน้าบิลทั้งหมด</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // เวลาอ้างอิงเดียวสำหรับทั้ง render (บิลโหมด "หารตามเวลา" ต้องใช้ค่าเดียวกันทุกจุด)
  const now = Date.now();
  const bd = computeBill(bill, store.state.members, now);
  const eligible = billMembers(bill, store.state.members);
  // เหตุผลที่บิลยังไม่เข้าสรุป — ใช้ข้อความจาก domain ให้ตรงกับเกณฑ์จริงเสมอ
  const issues = billIssues(bill, store.state.members);
  const priceNum = parseFloat(itemPrice);
  const canAddItem = itemName.trim().length > 0 && !isNaN(priceNum);

  const addItem = () => {
    if (!canAddItem) return;
    store.addItem(bill.id, itemName, priceNum);
    setItemName('');
    setItemPrice('');
  };

  // เลือก/ยกเลิกคนออกเงิน — ยกเลิกแล้วต้องปลด "บิลเลี้ยง" ด้วย (เลี้ยงโดยไม่มีคนจ่ายไม่มีความหมาย)
  const pickPayer = (memberId: string) => {
    if (bill.paidById === memberId) store.updateBill(bill.id, { paidById: null, isTreat: false });
    else store.updateBill(bill.id, { paidById: memberId });
  };

  const payerName = store.state.members.find((m) => m.id === bill.paidById)?.name ?? null;

  // คำอธิบายใต้หัวข้อ "ใครร่วมบิลนี้" (ไม่เลือกใคร = ทุกคนที่เข้าเงื่อนไขหมวด)
  const allWord =
    bill.category === 'mixed' ? 'ทุกคนในวง' : `ทุกคนที่กิน${consumesLabel[bill.category]}`;
  const participantHint =
    bill.memberIds.length === 0
      ? `ไม่เลือก = ${allWord} (${eligible.length} คน)`
      : `เลือกไว้ ${bill.memberIds.length} คน · แตะซ้ำเพื่อเอาออก`;

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      {/* ชื่อบิล */}
      <TextInput
        value={bill.name}
        onChangeText={(t) => store.updateBill(bill.id, { name: t })}
        style={s.title}
        placeholder="ชื่อบิล"
        placeholderTextColor={c.sub}
        accessibilityLabel="ชื่อบิล"
      />
      {bill.name.trim().length === 0 && (
        <Text style={s.errorText}>ยังไม่ได้ตั้งชื่อบิล — ตั้งชื่อไว้จะหาง่ายกว่า</Text>
      )}

      {/* เตือนเมื่อบิลยังไม่สมบูรณ์ (ไม่เข้าสรุปจนกว่าจะครบ) */}
      {issues.length > 0 && (
        <View style={s.warnBox} accessibilityRole="alert">
          <Text style={s.warnTitle}>บิลนี้ยังไม่เข้าสรุป</Text>
          {issues.map((msg) => (
            <Text key={msg} style={s.warnText}>
              • {msg}
            </Text>
          ))}
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
            {...a11y('button', { selected: bill.splitMode === m })}
            accessibilityLabel={`วิธีหาร ${splitModeLabel[m]}`}
          >
            <Text style={[s.chipText, bill.splitMode === m && s.chipTextActive]}>
              {splitModeLabel[m]}
            </Text>
          </Pressable>
        ))}
      </View>
      {bill.splitMode === 'time' && (
        <Text style={s.hint}>
          ใช้เวลามา-กลับของแต่ละคน (ตั้งที่แท็บสมาชิก) · คนที่ยังไม่กลับคิดถึงตอนนี้
        </Text>
      )}

      {/* คนจ่ายบิลนี้ (จำเป็น) */}
      <Text style={s.section}>
        ใครออกเงินบิลนี้ <Text style={s.required}>*</Text>
      </Text>
      <View style={s.chips}>
        {store.state.members.map((m) => (
          <Pressable
            key={m.id}
            onPress={() => pickPayer(m.id)}
            style={[s.chip, bill.paidById === m.id && s.chipActive]}
            {...a11y('button', { selected: bill.paidById === m.id })}
            accessibilityLabel={`คนออกเงิน ${m.name}`}
          >
            <Text style={[s.chipText, bill.paidById === m.id && s.chipTextActive]}>{m.name}</Text>
          </Pressable>
        ))}
        {store.state.members.length === 0 && (
          <Pressable
            style={s.linkBtn}
            onPress={() => router.push('/members' as never)}
            accessibilityRole="button"
            accessibilityLabel="ไปหน้าเพิ่มสมาชิก"
          >
            <Text style={s.linkBtnText}>ยังไม่มีสมาชิก — แตะเพื่อไปเพิ่ม</Text>
          </Pressable>
        )}
      </View>

      {/* บิลเลี้ยง: คนจ่ายรับผิดชอบยอดเต็ม คนอื่นจ่าย 0 */}
      <Pressable
        style={[s.treatRow, bill.isTreat && s.treatRowActive]}
        onPress={() => store.updateBill(bill.id, { isTreat: !bill.isTreat })}
        disabled={!bill.paidById}
        {...a11y('switch', { checked: !!bill.isTreat, disabled: !bill.paidById })}
        accessibilityLabel="บิลนี้คนจ่ายเลี้ยง"
      >
        <View style={{ flex: 1 }}>
          <Text style={[s.treatTitle, !bill.paidById && { opacity: 0.4 }]}>🎁 คนจ่ายเลี้ยง</Text>
          <Text style={[s.treatDesc, !bill.paidById && { opacity: 0.4 }]}>
            {payerName ? `${payerName} จ่ายเต็ม คนอื่นไม่ต้องหาร` : 'เลือกคนออกเงินก่อน'}
          </Text>
        </View>
        <View style={[s.toggle, bill.isTreat && s.toggleOn]}>
          <View style={[s.knob, bill.isTreat && s.knobOn]} />
        </View>
      </Pressable>

      {/* ใครร่วมบิลนี้ (เผื่อมาทีหลัง/กลับก่อน) */}
      <Text style={s.section}>ใครร่วมบิลนี้</Text>
      <Text style={s.hint}>{participantHint}</Text>
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
              {...a11y('checkbox', { checked: on })}
              accessibilityLabel={`ผู้ร่วมบิล ${m.name}`}
            >
              <Text style={[s.chipText, on && s.chipTextActive]}>{m.name}</Text>
            </Pressable>
          );
        })}
      </View>
      {/* เลือกคนไว้แต่ไม่มีใครเข้าเงื่อนไขหมวดบิล = ยอดจะไปกองที่คนจ่ายคนเดียว ต้องบอกให้รู้ */}
      {store.state.members.length > 0 && eligible.length === 0 && (
        <Text style={s.errorText}>
          ยังไม่มีใครเข้าเงื่อนไขบิลนี้ ({allWord}) — ยอดทั้งบิลจะตกเป็นของคนออกเงินคนเดียว
        </Text>
      )}

      {/* เมนู */}
      <Text style={s.section}>เมนู</Text>
      <View style={s.addItemRow}>
        <TextInput
          value={itemName}
          onChangeText={setItemName}
          placeholder="ชื่อเมนู"
          placeholderTextColor={c.sub}
          style={[s.input, { flex: 1 }]}
          accessibilityLabel="ชื่อเมนู"
          onSubmitEditing={addItem}
        />
        <TextInput
          value={itemPrice}
          onChangeText={setItemPrice}
          placeholder="ราคา"
          placeholderTextColor={c.sub}
          keyboardType="numeric"
          style={[s.input, { width: 90 }]}
          accessibilityLabel="ราคาเมนู"
          onSubmitEditing={addItem}
        />
        <Pressable
          style={[s.addSmall, !canAddItem && s.btnDisabled]}
          onPress={addItem}
          disabled={!canAddItem}
          {...a11y('button', { disabled: !canAddItem })}
          accessibilityLabel="เพิ่มเมนู"
          accessibilityHint={canAddItem ? undefined : 'ใส่ชื่อเมนูและราคาก่อนจึงจะเพิ่มได้'}
        >
          <Text style={s.addBtnText}>+</Text>
        </Pressable>
      </View>
      {!canAddItem && (itemName.trim().length > 0 || itemPrice.length > 0) && (
        <Text style={s.errorText}>ต้องใส่ทั้งชื่อเมนูและราคา (ตัวเลข) ก่อนจึงจะเพิ่มได้</Text>
      )}
      {bill.items.length === 0 && (
        <Text style={s.hint}>ยังไม่มีเมนู — ใส่ชื่อเมนูกับราคาด้านบนแล้วกด +</Text>
      )}

      {bill.items.map((it) => (
        <View key={it.id} style={s.item}>
          <View style={s.itemTop}>
            <Text style={s.itemName}>{it.name}</Text>
            <Text style={s.itemPrice}>{baht(it.price)}</Text>
            <Pressable
              style={s.delBtn}
              onPress={() => confirmRemove(it.name, () => store.removeItem(bill.id, it.id))}
              accessibilityRole="button"
              accessibilityLabel={`ลบเมนู ${it.name}`}
            >
              <Text style={s.del}>✕</Text>
            </Pressable>
          </View>
          {bill.splitMode === 'itemized' && (
            <>
              <Text style={s.hint}>
                {it.participantIds.length === 0
                  ? 'ใครกินเมนูนี้ (ไม่เลือก = ทุกคนในบิล)'
                  : `ใครกินเมนูนี้ · เลือกไว้ ${it.participantIds.length} คน`}
              </Text>
              <View style={s.chips}>
                {eligible.map((m) => {
                  const on = it.participantIds.includes(m.id);
                  return (
                    <Pressable
                      key={m.id}
                      onPress={() => store.toggleItemParticipant(bill.id, it.id, m.id)}
                      style={[s.chipSmall, on && s.chipActive]}
                      {...a11y('checkbox', { checked: on })}
                      accessibilityLabel={`${m.name} กิน ${it.name}`}
                    >
                      <Text style={[s.chipText, on && s.chipTextActive, { fontSize: 12 }]}>
                        {m.name}
                      </Text>
                    </Pressable>
                  );
                })}
                {eligible.length === 0 && (
                  <Text style={s.hint}>ยังไม่มีคนเข้าเงื่อนไขบิลนี้ให้เลือก</Text>
                )}
              </View>
            </>
          )}
        </View>
      ))}

      {/* ค่าบริการ / vat / ส่วนลด */}
      <Text style={s.section}>ค่าบริการ & ส่วนลด</Text>
      <View style={s.chargeRow}>
        <ChargeInput
          s={s}
          c={c}
          label="Service %"
          a11yLabel="ค่าบริการ เปอร์เซ็นต์"
          value={bill.serviceChargePct}
          onChange={(n) => store.updateBill(bill.id, { serviceChargePct: n })}
        />
        <ChargeInput
          s={s}
          c={c}
          label="VAT %"
          a11yLabel="ภาษีมูลค่าเพิ่ม เปอร์เซ็นต์"
          value={bill.vatPct}
          onChange={(n) => store.updateBill(bill.id, { vatPct: n })}
        />
        <ChargeInput
          s={s}
          c={c}
          label="ส่วนลด ฿"
          a11yLabel="ส่วนลด บาท"
          value={bill.discount}
          onChange={(n) => store.updateBill(bill.id, { discount: n })}
        />
      </View>

      {/* สรุปบิล */}
      <View style={s.summary}>
        <SumRow s={s} label="ยอดเมนู" value={baht(bd.subtotal)} />
        {bd.service > 0 && <SumRow s={s} label="Service charge" value={baht(bd.service)} />}
        {bd.vat > 0 && <SumRow s={s} label="VAT" value={baht(bd.vat)} />}
        {bd.discount > 0 && <SumRow s={s} label="ส่วนลด" value={'-' + baht(bd.discount)} />}
        <SumRow s={s} label="รวมบิลนี้" value={baht(bd.total)} bold />
      </View>
      {/* ส่วนลดมากกว่ายอดที่ต้องจ่าย = ยอดรวมติดลบ ต้องเตือน ไม่ปล่อยเงียบ */}
      {bd.total < 0 && (
        <Text style={s.errorText}>ยอดรวมติดลบ — ส่วนลดมากกว่ายอดบิล ตรวจตัวเลขอีกครั้ง</Text>
      )}

      <Text style={s.section}>ยอดต่อคนในบิลนี้</Text>
      {!!bd.soleBearerId && (
        <Text style={s.hint}>
          {bill.isTreat
            ? `🎁 ${payerName ?? 'คนออกเงิน'} เลี้ยงบิลนี้ — คนอื่นไม่ต้องหาร`
            : 'ไม่มีคนเข้าเงื่อนไขบิลนี้ — ยอดทั้งบิลตกเป็นของคนออกเงินคนเดียว'}
        </Text>
      )}
      {[...bd.perMember.entries()].map(([mid, amt]) => {
        const m = store.state.members.find((x) => x.id === mid);
        // ไม่เจอ member (ถูกลบ/ยังไม่ sync) ก็ต้องโชว์ยอด ไม่ซ่อนเงินหาย
        return <SumRow s={s} key={mid} label={m?.name ?? '(ไม่อยู่ในรายชื่อสมาชิก)'} value={baht(amt)} />;
      })}
      {bd.perMember.size === 0 && <Text style={s.hint}>ยังไม่มีคนเข้าเงื่อนไขบิลนี้</Text>}

      <Pressable
        style={s.deleteBill}
        onPress={() =>
          confirmRemove(bill.name || 'บิลนี้', () => {
            store.removeBill(bill.id);
            // ใช้ replace เพื่อไม่ให้ย้อนกลับมาหน้าบิลที่ถูกลบแล้ว (เข้าจาก deep link ก็ยังกลับได้)
            router.replace('/bills' as never);
          })
        }
        accessibilityRole="button"
        accessibilityLabel={`ลบบิล ${bill.name || 'ไม่มีชื่อ'}`}
      >
        <Text style={s.deleteBillText}>ลบบิลนี้</Text>
      </Pressable>
    </ScrollView>
  );
}

/**
 * ช่องกรอกตัวเลข % / ส่วนลด — เก็บข้อความที่พิมพ์ไว้เอง
 * (ถ้า bind กับตัวเลขตรง ๆ จะพิมพ์ "0." หรือ "7.5" ไม่ได้ เพราะถูกแปลงเป็นเลขทุกตัวอักษร)
 */
type Styles = ReturnType<typeof makeStyles>;

function ChargeInput({
  s,
  c,
  label,
  a11yLabel,
  value,
  onChange,
}: Readonly<{
  s: Styles;
  c: Palette;
  label: string;
  a11yLabel: string;
  value: number;
  onChange: (n: number) => void;
}>) {
  const [text, setText] = useState(String(value));
  // ค่าจากภายนอกเปลี่ยน (เช่น เพื่อนในวงแก้) และไม่ตรงกับที่พิมพ์ค้างไว้ → sync ตาม
  useEffect(() => {
    setText((prev) => (num(prev) === value ? prev : String(value)));
  }, [value]);

  const trimmed = text.trim();
  const parsed = parseFloat(trimmed);
  const invalid = trimmed !== '' && (isNaN(parsed) || parsed < 0);

  const onText = (t: string) => {
    setText(t);
    if (t.trim() === '') onChange(0);
    else {
      const n = parseFloat(t);
      if (!isNaN(n) && n >= 0) onChange(n);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <Text style={s.chargeLabel}>{label}</Text>
      <TextInput
        value={text}
        onChangeText={onText}
        keyboardType="numeric"
        style={[s.input, invalid && s.inputError]}
        placeholder="0"
        placeholderTextColor={c.sub}
        accessibilityLabel={a11yLabel}
      />
      {invalid && <Text style={s.errorText}>ใส่ตัวเลขไม่ติดลบ</Text>}
    </View>
  );
}

function SumRow({
  s,
  label,
  value,
  bold,
}: Readonly<{ s: Styles; label: string; value: string; bold?: boolean }>) {
  return (
    <View style={s.sumRow}>
      <Text style={[s.sumLabel, bold && s.sumBold]}>{label}</Text>
      <Text style={[s.sumValue, bold && s.sumBold]}>{value}</Text>
    </View>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.bg },
  content: { padding: 16, gap: 10, paddingBottom: 40 },
  emptyBox: { alignItems: 'center', gap: 8, paddingVertical: 48, paddingHorizontal: 24 },
  emptyIcon: { fontSize: 44 },
  emptyTitle: { color: c.text, fontSize: 16, fontWeight: '700' },
  emptyDesc: { color: c.sub, fontSize: 13, textAlign: 'center' },
  emptyBtn: {
    backgroundColor: c.primary,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
    marginTop: 8,
    minHeight: 44,
    justifyContent: 'center',
  },
  emptyBtnText: { color: c.onPrimary, fontWeight: '800', fontSize: 15 },
  errorText: { color: c.danger, fontSize: 12 },
  inputError: { borderWidth: 1, borderColor: c.danger },
  btnDisabled: { opacity: 0.4 },
  linkBtn: { paddingVertical: 10, paddingHorizontal: 4, minHeight: 40, justifyContent: 'center' },
  linkBtnText: { color: c.primary, fontSize: 13, fontWeight: '700' },
  delBtn: { minWidth: 40, minHeight: 40, alignItems: 'center', justifyContent: 'center' },
  title: {
    color: c.text,
    fontSize: 24,
    fontWeight: '800',
    backgroundColor: c.card,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: c.border,
  },
  section: { color: c.text, fontSize: 16, fontWeight: '700', marginTop: 12 },
  required: { color: c.danger, fontWeight: '800' },
  hint: { color: c.sub, fontSize: 12 },
  warnBox: {
    backgroundColor: c.cardAlt,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.food,
    padding: 12,
    gap: 4,
  },
  warnTitle: { color: c.food, fontSize: 14, fontWeight: '800' },
  warnText: { color: c.sub, fontSize: 13, lineHeight: 19 },
  treatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: c.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.border,
    padding: 14,
    marginTop: 4,
  },
  treatRowActive: { borderColor: c.primary },
  treatTitle: { color: c.text, fontSize: 15, fontWeight: '700' },
  treatDesc: { color: c.sub, fontSize: 12, marginTop: 2 },
  toggle: {
    width: 48,
    height: 28,
    borderRadius: 14,
    backgroundColor: c.cardAlt,
    borderWidth: 1,
    borderColor: c.border,
    padding: 2,
    justifyContent: 'center',
  },
  toggleOn: { backgroundColor: c.primary, borderColor: c.primary },
  knob: { width: 22, height: 22, borderRadius: 11, backgroundColor: c.sub },
  knobOn: { backgroundColor: c.onPrimary, alignSelf: 'flex-end' },
  chips: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: c.card,
    borderWidth: 1,
    borderColor: c.border,
    minHeight: 40,
    justifyContent: 'center',
  },
  chipSmall: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: c.card,
    borderWidth: 1,
    borderColor: c.border,
    minHeight: 40,
    justifyContent: 'center',
  },
  chipActive: { backgroundColor: c.primary, borderColor: c.primary },
  chipText: { color: c.sub, fontSize: 14 },
  chipTextActive: { color: c.onPrimary, fontWeight: '700' },
  input: {
    backgroundColor: c.cardAlt,
    color: c.text,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
  },
  addItemRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  addSmall: {
    backgroundColor: c.primary,
    borderRadius: 10,
    width: 48,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnText: { color: c.onPrimary, fontWeight: '800', fontSize: 22 },
  item: {
    backgroundColor: c.card,
    borderRadius: 12,
    padding: 12,
    gap: 6,
    borderWidth: 1,
    borderColor: c.border,
  },
  itemTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  itemName: { color: c.text, fontSize: 16, fontWeight: '600', flex: 1 },
  itemPrice: { color: c.text, fontSize: 16 },
  del: { color: c.danger, fontSize: 18, paddingHorizontal: 4 },
  chargeRow: { flexDirection: 'row', gap: 8 },
  chargeLabel: { color: c.sub, fontSize: 12, marginBottom: 4 },
  summary: {
    backgroundColor: c.card,
    borderRadius: 12,
    padding: 14,
    gap: 6,
    borderWidth: 1,
    borderColor: c.border,
    marginTop: 8,
  },
  sumRow: { flexDirection: 'row', justifyContent: 'space-between' },
  sumLabel: { color: c.sub, fontSize: 14 },
  sumValue: { color: c.text, fontSize: 14 },
  sumBold: { color: c.text, fontWeight: '800', fontSize: 16 },
  deleteBill: {
    marginTop: 24,
    borderWidth: 1,
    borderColor: c.danger,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  deleteBillText: { color: c.danger, fontWeight: '700' },
});
