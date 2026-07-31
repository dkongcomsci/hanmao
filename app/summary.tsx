import * as Location from 'expo-location';
import { useRef, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { distanceM } from '../src/utils/geo';
import { allSettled, computeBill, computeNetBalances, computeTotals, settleUp, transferKey } from '../src/domain/split';
import { baht, categoryLabel, colors, confirmRemove, copyText, formatPromptPay, splitModeLabel } from '../src/ui';
import { shareViewAsImage } from '../src/ui/share';
import { useStore } from '../src/data/store';

export default function Summary() {
  const { state, setVenue, mode, group, toggleSettlement, closeGroup } = useStore();
  const { perMember, grandTotal } = computeTotals(state);
  const net = computeNetBalances(state);
  const transfers = settleUp(state);
  const doneCount = transfers.filter((t) => state.settlements.includes(transferKey(t))).length;
  const everyoneSettled = allSettled(transfers, state.settlements);
  const [checking, setChecking] = useState(false);
  const [distance, setDistance] = useState<number | null>(null);
  const [sharing, setSharing] = useState(false);
  const cardRef = useRef<View>(null);

  const name = (id: string) => state.members.find((m) => m.id === id)?.name ?? '?';
  const promptPay = (id: string) => state.members.find((m) => m.id === id)?.promptPay ?? null;

  // export การ์ดสรุปเป็นรูป (web: ดาวน์โหลด, native: share sheet)
  const onShare = async () => {
    setSharing(true);
    try {
      await shareViewAsImage(cardRef, group?.name ? `หารเมา-${group.name}` : 'หารเมา-สรุป');
    } catch {
      Alert.alert('แชร์รูปไม่สำเร็จ', 'ลองใหม่อีกครั้ง');
    } finally {
      setSharing(false);
    }
  };

  const copyPromptPay = async (pp: string, who: string) => {
    await copyText(pp);
    Alert.alert('คัดลอกแล้ว', `พร้อมเพย์ของ ${who}\n${formatPromptPay(pp)}`);
  };

  // ปิดวง/เคลียร์ทั้งหมด (ยืนยันก่อน — ย้อนกลับไม่ได้)
  const onClose = () => {
    const label = mode === 'group' ? `ปิดวง "${group?.name ?? ''}"` : 'เคลียร์ข้อมูลทั้งหมด';
    confirmRemove(label, () => {
      closeGroup().catch(() => {});
    });
  };

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

  // ป้ายปุ่มแชร์ ตามสถานะ/แพลตฟอร์ม
  let shareLabel: string;
  if (sharing) shareLabel = 'กำลังสร้างรูป...';
  else if (Platform.OS === 'web') shareLabel = '⬇️ ดาวน์โหลดรูปสรุป';
  else shareLabel = '📤 แชร์รูปสรุป';

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      {/* การ์ดสรุปสะอาด — ใช้จับภาพ export เป็นรูป */}
      <View ref={cardRef} collapsable={false} style={s.shareCard}>
        <View style={s.brandRow}>
          <Text style={s.brand}>🍜 หารเมา</Text>
          {group?.name ? <Text style={s.brandSub}>{group.name}</Text> : null}
        </View>
        <Text style={s.heroLabel}>ยอดรวมทุกบิล</Text>
        <Text style={s.heroValue}>{baht(grandTotal)}</Text>

        <Text style={s.cardSection}>ยอดที่แต่ละคนต้องจ่าย</Text>
        {[...perMember.entries()].map(([id, amt]) => (
          <View key={id} style={s.cardRow}>
            <Text style={s.rowName}>{name(id)}</Text>
            <Text style={s.rowValue}>{baht(amt)}</Text>
          </View>
        ))}
        {perMember.size === 0 && <Text style={s.hint}>ยังไม่มีข้อมูลให้สรุป</Text>}

        {transfers.length > 0 && (
          <>
            <Text style={s.cardSection}>ใครโอนให้ใคร</Text>
            {transfers.map((t) => {
              const pp = promptPay(t.toId);
              return (
                <View key={transferKey(t)} style={s.cardRow}>
                  <Text style={s.rowName}>
                    <Text style={s.debtor}>{name(t.fromId)}</Text> → <Text style={s.creditor}>{name(t.toId)}</Text>
                    {pp ? `  (${formatPromptPay(pp)})` : ''}
                  </Text>
                  <Text style={s.rowValue}>{baht(t.amount)}</Text>
                </View>
              );
            })}
          </>
        )}
      </View>

      {/* ปุ่มแชร์/ดาวน์โหลดรูปสรุป */}
      <Pressable
        style={[s.shareBtn, (sharing || perMember.size === 0) && s.shareBtnDisabled]}
        onPress={onShare}
        disabled={sharing || perMember.size === 0}
        accessibilityRole="button"
        accessibilityState={{ disabled: sharing || perMember.size === 0 }}
        accessibilityLabel={Platform.OS === 'web' ? 'ดาวน์โหลดรูปสรุป' : 'แชร์รูปสรุป'}
      >
        <Text style={s.shareBtnText}>{shareLabel}</Text>
      </Pressable>

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
      {transfers.length > 0 && (
        <Text style={s.progress}>
          โอนแล้ว {doneCount}/{transfers.length} รายการ
        </Text>
      )}
      {transfers.map((t) => {
        const pp = promptPay(t.toId);
        const key = transferKey(t);
        const paid = state.settlements.includes(key);
        return (
          <View key={key} style={[s.transfer, paid && s.transferPaid]}>
            <View style={s.transferMain}>
              <Text style={[s.transferText, paid && s.paidText]}>
                <Text style={[s.debtor, paid && s.paidText]}>{name(t.fromId)}</Text> →{' '}
                <Text style={[s.creditor, paid && s.paidText]}>{name(t.toId)}</Text>
              </Text>
              <Text style={[s.transferAmt, paid && s.paidText]}>{baht(t.amount)}</Text>
            </View>
            {pp && !paid && (
              <Pressable
                style={s.ppCopy}
                onPress={() => copyPromptPay(pp, name(t.toId))}
                accessibilityRole="button"
                accessibilityLabel={`คัดลอกพร้อมเพย์ของ ${name(t.toId)}`}
              >
                <Text style={s.ppCopyText}>📋 พร้อมเพย์ {formatPromptPay(pp)}</Text>
              </Pressable>
            )}
            {!pp && !paid && <Text style={s.ppNone}>{name(t.toId)} ยังไม่ได้ใส่พร้อมเพย์</Text>}
            <Pressable
              style={[s.check, paid && s.checkOn]}
              onPress={() => toggleSettlement(key)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: paid }}
              accessibilityLabel={`${name(t.fromId)} โอนให้ ${name(t.toId)} แล้ว`}
            >
              <Text style={[s.checkText, paid && s.checkTextOn]}>
                {paid ? '✓ โอนแล้ว' : 'ยังไม่โอน — แตะเมื่อโอนแล้ว'}
              </Text>
            </Pressable>
          </View>
        );
      })}

      {/* จ่ายครบทุกคน → เคลียร์/ปิดวงได้ */}
      {everyoneSettled && (
        <View style={s.doneBox}>
          <Text style={s.doneIcon}>🎉</Text>
          <Text style={s.doneTitle}>จ่ายครบทุกคนแล้ว!</Text>
          <Text style={s.doneDesc}>
            {mode === 'group'
              ? 'ปิดวงนี้เพื่อลบข้อมูลถาวรสำหรับทุกคน'
              : 'เคลียร์ข้อมูลทั้งหมดเพื่อเริ่มหารรอบใหม่'}
          </Text>
          <Pressable
            style={s.doneBtn}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={mode === 'group' ? 'ปิดวง' : 'เคลียร์ข้อมูลทั้งหมด'}
          >
            <Text style={s.doneBtnText}>{mode === 'group' ? 'ปิดวง' : 'เคลียร์ทั้งหมด'}</Text>
          </Pressable>
        </View>
      )}

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
  // การ์ดสรุปสำหรับจับภาพ export
  shareCard: {
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  brand: { color: colors.primary, fontSize: 18, fontWeight: '800' },
  brandSub: { color: colors.sub, fontSize: 13, fontWeight: '600' },
  cardSection: { color: colors.text, fontSize: 15, fontWeight: '700', marginTop: 14, marginBottom: 2 },
  cardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: 8,
  },
  shareBtn: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  shareBtnDisabled: { opacity: 0.4 },
  shareBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
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
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 14,
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  transferMain: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  transferText: { color: colors.text, fontSize: 16 },
  debtor: { color: colors.food, fontWeight: '700' },
  creditor: { color: colors.good, fontWeight: '700' },
  transferAmt: { color: colors.text, fontSize: 16, fontWeight: '800' },
  ppCopy: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.cardAlt,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    minHeight: 40,
  },
  ppCopyText: { color: colors.primary, fontSize: 14, fontWeight: '700' },
  ppNone: { color: colors.sub, fontSize: 12, fontStyle: 'italic' },
  progress: { color: colors.sub, fontSize: 13, fontWeight: '600' },
  transferPaid: { opacity: 0.6, borderColor: colors.good },
  paidText: { textDecorationLine: 'line-through', color: colors.sub },
  check: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
    minHeight: 40,
    justifyContent: 'center',
  },
  checkOn: { borderColor: colors.good, backgroundColor: colors.cardAlt },
  checkText: { color: colors.sub, fontSize: 13, fontWeight: '600' },
  checkTextOn: { color: colors.good },
  doneBox: {
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.good,
    padding: 20,
    marginTop: 16,
  },
  doneIcon: { fontSize: 40 },
  doneTitle: { color: colors.good, fontSize: 18, fontWeight: '800' },
  doneDesc: { color: colors.sub, fontSize: 13, textAlign: 'center' },
  doneBtn: {
    backgroundColor: colors.danger,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 24,
    marginTop: 8,
  },
  doneBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
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
