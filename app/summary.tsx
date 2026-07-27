import * as Location from 'expo-location';
import { useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { distanceM } from '../src/utils/geo';
import { computeBill, computeNetBalances, computeTotals, settleUp } from '../src/domain/split';
import { baht, categoryLabel, colors, splitModeLabel } from '../src/ui';
import { useStore } from '../src/data/store';

export default function Summary() {
  const { state, setVenue } = useStore();
  const { perMember, grandTotal } = computeTotals(state);
  const net = computeNetBalances(state);
  const transfers = settleUp(state);
  const [checking, setChecking] = useState(false);
  const [distance, setDistance] = useState<number | null>(null);

  const name = (id: string) => state.members.find((m) => m.id === id)?.name ?? '?';

  const setHere = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('ไม่ได้รับอนุญาตตำแหน่ง');
      return;
    }
    const pos = await Location.getCurrentPositionAsync({});
    setVenue({ lat: pos.coords.latitude, lng: pos.coords.longitude, radiusM: 150 });
    Alert.alert('บันทึกพื้นที่ร้านแล้ว', 'รัศมี 150 เมตร');
  };

  const checkHere = async () => {
    if (!state.venue) {
      Alert.alert('ยังไม่ได้ตั้งพื้นที่ร้าน', 'กด "ตั้งพื้นที่ร้าน" ก่อน');
      return;
    }
    setChecking(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('ไม่ได้รับอนุญาตตำแหน่ง');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({});
      const d = distanceM(state.venue, {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
      });
      setDistance(d);
      Alert.alert(
        d <= state.venue.radiusM ? 'ยังอยู่ในพื้นที่ ✓' : 'ออกนอกพื้นที่แล้ว ⚠️',
        `ห่างจากร้าน ${Math.round(d)} เมตร`,
      );
    } finally {
      setChecking(false);
    }
  };

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      <View style={s.hero}>
        <Text style={s.heroLabel}>ยอดรวมทุกบิล</Text>
        <Text style={s.heroValue}>{baht(grandTotal)}</Text>
      </View>

      <Text style={s.section}>ยอดที่แต่ละคนต้องจ่าย</Text>
      {[...perMember.entries()].map(([id, amt]) => (
        <View key={id} style={s.row}>
          <Text style={s.rowName}>{name(id)}</Text>
          <Text style={s.rowValue}>{baht(amt)}</Text>
        </View>
      ))}
      {perMember.size === 0 && (
        <View style={s.emptyBox}>
          <Text style={s.emptyIcon}>💰</Text>
          <Text style={s.emptyTitle}>ยังไม่มีข้อมูลให้สรุป</Text>
          <Text style={s.emptyDesc}>เพิ่มสมาชิกและสร้างบิลก่อน แล้วยอดจะสรุปที่นี่</Text>
        </View>
      )}

      {/* แยกรายบิล: บิลนี้มีใครร่วม + แต่ละคนจ่ายเท่าไร */}
      <Text style={s.section}>แยกตามบิล</Text>
      {state.bills.length === 0 && <Text style={s.hint}>ยังไม่มีบิล</Text>}
      {state.bills.map((bill) => {
        const bd = computeBill(bill, state.members);
        const payer = bill.paidById ? name(bill.paidById) : null;
        return (
          <View key={bill.id} style={s.billCard}>
            <View style={s.billTop}>
              <Text style={s.billName}>{bill.name}</Text>
              <Text style={s.billTotal}>{baht(bd.total)}</Text>
            </View>
            <Text style={s.billMeta}>
              {categoryLabel[bill.category]} · {splitModeLabel[bill.splitMode]} ·{' '}
              {payer ? `ออกเงิน: ${payer}` : 'ยังไม่ระบุคนจ่าย'}
            </Text>
            {[...bd.perMember.entries()].map(([mid, amt]) => (
              <View key={mid} style={s.billMemberRow}>
                <Text style={s.billMemberName}>
                  {name(mid)}
                  {bill.paidById === mid ? ' (คนจ่าย)' : ''}
                </Text>
                <Text style={s.billMemberAmt}>{baht(amt)}</Text>
              </View>
            ))}
            {bd.perMember.size === 0 && (
              <Text style={s.hint}>ยังไม่มีคนเข้าเงื่อนไขบิลนี้</Text>
            )}
          </View>
        );
      })}

      <Text style={s.section}>ใครโอนให้ใคร</Text>
      <Text style={s.hint}>คำนวณจากคนที่ออกเงินแต่ละบิล (จำนวนโอนน้อยที่สุด)</Text>
      {transfers.length === 0 && <Text style={s.hint}>ยังไม่มีรายการโอน (ระบุคนจ่ายในแต่ละบิล)</Text>}
      {transfers.map((t, i) => (
        <View key={i} style={s.transfer}>
          <Text style={s.transferText}>
            <Text style={s.debtor}>{name(t.fromId)}</Text> → <Text style={s.creditor}>{name(t.toId)}</Text>
          </Text>
          <Text style={s.transferAmt}>{baht(t.amount)}</Text>
        </View>
      ))}

      {/* สถานะสุทธิ: ใครออกเกิน/ค้าง */}
      <Text style={s.section}>สถานะแต่ละคน</Text>
      {[...net.entries()].map(([id, v]) => {
        const r = Math.round(v * 100) / 100;
        if (Math.abs(r) < 0.01) return null;
        return (
          <View key={id} style={s.row}>
            <Text style={s.rowName}>{name(id)}</Text>
            <Text style={[s.rowValue, { color: r > 0 ? colors.good : colors.food }]}>
              {r > 0 ? `ได้คืน ${baht(r)}` : `ต้องจ่าย ${baht(-r)}`}
            </Text>
          </View>
        );
      })}

      {/* Location check */}
      {Platform.OS !== 'web' && (
        <>
          <Text style={s.section}>เช็กพื้นที่ร้าน</Text>
          <Text style={s.hint}>
            {state.venue ? 'ตั้งพื้นที่ร้านแล้ว' : 'ยังไม่ได้ตั้งพื้นที่'}
            {distance != null ? ` · ล่าสุดห่าง ${Math.round(distance)} ม.` : ''}
          </Text>
          <View style={s.locRow}>
            <Pressable
              style={[s.locBtn, { borderColor: colors.primary }]}
              onPress={setHere}
              accessibilityRole="button"
              accessibilityLabel="ตั้งพื้นที่ร้าน จากตำแหน่งปัจจุบัน"
            >
              <Text style={[s.locText, { color: colors.primary }]}>ตั้งพื้นที่ร้าน</Text>
            </Pressable>
            <Pressable
              style={[s.locBtn, { borderColor: colors.good }]}
              onPress={checkHere}
              disabled={checking}
              accessibilityRole="button"
              accessibilityState={{ disabled: checking }}
              accessibilityLabel="เช็กว่ายังอยู่ในพื้นที่ร้านไหม"
            >
              <Text style={[s.locText, { color: colors.good }]}>
                {checking ? '...' : 'เช็กว่ายังอยู่ไหม'}
              </Text>
            </Pressable>
          </View>
        </>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 8, paddingBottom: 40 },
  hero: {
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: colors.border,
  },
  heroLabel: { color: colors.sub, fontSize: 14 },
  heroValue: { color: colors.text, fontSize: 36, fontWeight: '800', marginTop: 4 },
  section: { color: colors.text, fontSize: 16, fontWeight: '700', marginTop: 16 },
  hint: { color: colors.sub, fontSize: 12 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowName: { color: colors.text, fontSize: 16 },
  rowValue: { color: colors.text, fontSize: 16, fontWeight: '700' },
  transfer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  transferText: { color: colors.text, fontSize: 16 },
  debtor: { color: colors.food, fontWeight: '700' },
  creditor: { color: colors.good, fontWeight: '700' },
  transferAmt: { color: colors.text, fontSize: 16, fontWeight: '800' },
  emptyBox: { alignItems: 'center', gap: 6, paddingVertical: 32, paddingHorizontal: 24 },
  emptyIcon: { fontSize: 44 },
  emptyTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  emptyDesc: { color: colors.sub, fontSize: 13, textAlign: 'center' },
  billCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 14,
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  billTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  billName: { color: colors.text, fontSize: 16, fontWeight: '700', flex: 1 },
  billTotal: { color: colors.primary, fontSize: 16, fontWeight: '800' },
  billMeta: { color: colors.sub, fontSize: 12, marginBottom: 4 },
  billMemberRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  billMemberName: { color: colors.text, fontSize: 14 },
  billMemberAmt: { color: colors.text, fontSize: 14, fontWeight: '600' },
  locRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  locBtn: { flex: 1, borderWidth: 1, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  locText: { fontWeight: '700' },
});
