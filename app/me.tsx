import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  billIssues,
  computeBill,
  computeNetBalances,
  computeTotals,
  settleUp,
  transferKey,
} from '../src/domain/split';
import {
  a11y,
  baht,
  categoryLabel,
  consumesLabel,
  copyText,
  formatPromptPay,
  friendlyError,
  notify,
  Palette,
  splitModeLabel,
} from '../src/ui';
import { useTheme } from '../src/ui/theme';
import { useStore } from '../src/data/store';

/** แท็บ "ฉัน" — สรุปเฉพาะของผู้ใช้คนเดียว: ต้องจ่ายเท่าไร ได้คืน/ค้างใคร ร่วมบิลไหนบ้าง */
export default function Me() {
  const { state, myMemberId, setMe, claimMember, mode, toggleSettlement } = useStore();
  const { colors: c } = useTheme();
  const s = useMemo(() => makeStyles(c), [c]);
  const router = useRouter();
  const [picking, setPicking] = useState(false);

  const me = state.members.find((m) => m.id === myMemberId) ?? null;

  /**
   * ตั้งว่า "ฉันคือใคร"
   * - group mode: ต้อง claimMember เพื่อผูก user_id บน server (ไม่ใช่จำแค่ในเครื่อง)
   * - local mode: setMe อย่างเดียว
   */
  const pickMe = (memberId: string) => {
    if (mode !== 'group') {
      setMe(memberId);
      return;
    }
    setPicking(true);
    claimMember(memberId)
      // เช่น ชื่อนี้มีคนอื่น claim ไปแล้ว — ต้องบอกเหตุผล ไม่ใช่กดแล้วเงียบ
      .catch((e) => notify('บันทึกตัวตนในวงไม่สำเร็จ', friendlyError(e, 'ลองใหม่อีกครั้ง')))
      .finally(() => setPicking(false));
  };

  // ยังไม่ได้เลือกว่าฉันคือใคร → ให้เลือกจากรายชื่อ
  if (!me) {
    return (
      <ScrollView style={s.container} contentContainerStyle={s.content}>
        {state.members.length === 0 ? (
          <View style={s.emptyBox}>
            <Text style={s.emptyIcon}>🙋</Text>
            <Text style={s.emptyTitle}>ยังไม่มีสมาชิก</Text>
            <Text style={s.emptyDesc}>เพิ่มสมาชิกก่อน แล้วเลือกว่าคนไหนคือคุณ</Text>
            <Pressable
              style={s.cta}
              onPress={() => router.push('/members' as never)}
              accessibilityRole="button"
              accessibilityLabel="ไปหน้าเพิ่มสมาชิก"
            >
              <Text style={s.ctaText}>ไปเพิ่มสมาชิก</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <Text style={s.title}>คุณคือใคร?</Text>
            <Text style={s.subtitle}>เลือกชื่อของคุณ เพื่อดูสรุปเฉพาะของคุณ</Text>
            {state.members.map((m) => (
              <Pressable
                key={m.id}
                style={[s.pickRow, picking && s.rowDisabled]}
                onPress={() => pickMe(m.id)}
                disabled={picking}
                {...a11y('button', { disabled: picking })}
                accessibilityLabel={`ฉันคือ ${m.name}`}
              >
                <Text style={s.pickName}>{m.name}</Text>
                <Text style={s.chevron}>›</Text>
              </Pressable>
            ))}
          </>
        )}
      </ScrollView>
    );
  }

  // --- คำนวณเฉพาะของฉัน (reuse domain functions เดียวกับหน้าสรุป) ---
  // เวลาอ้างอิงเดียวสำหรับทั้ง render (บิลโหมด "หารตามเวลา" ต้องใช้ค่าเดียวกันทุกจุด)
  const now = Date.now();
  const { perMember } = computeTotals(state, now);
  const myTotal = perMember.get(me.id) ?? 0;
  const net = computeNetBalances(state, now).get(me.id) ?? 0;
  const netR = Math.round(net * 100) / 100;
  const transfers = settleUp(state, now);
  const name = (id: string) => state.members.find((m) => m.id === id)?.name ?? '?';
  const promptPay = (id: string) => state.members.find((m) => m.id === id)?.promptPay ?? null;

  const copyPromptPay = async (pp: string, who: string) => {
    const ok = await copyText(pp);
    if (ok) notify('คัดลอกแล้ว', `พร้อมเพย์ของ ${who}\n${formatPromptPay(pp)}`);
    else notify('คัดลอกไม่สำเร็จ', `พร้อมเพย์ของ ${who}: ${formatPromptPay(pp)}`);
  };

  const iPay = transfers.filter((t) => t.fromId === me.id); // ฉันต้องโอนให้ใคร
  const iGet = transfers.filter((t) => t.toId === me.id); // ใครต้องโอนให้ฉัน

  // บิลที่ฉันร่วม + ยอดของฉันในบิลนั้น (รวมบิลที่ยังไม่เข้าสรุป เพื่อให้เห็นว่าต้องไปแก้)
  const myBills = state.bills
    .map((bill) => ({
      bill,
      bd: computeBill(bill, state.members, now),
      issues: billIssues(bill, state.members),
    }))
    .filter(({ bd }) => bd.perMember.has(me.id));
  // บิลที่ยังไม่เข้าสรุป = ยอดบนหน้านี้ยังไม่ครบ ต้องบอกผู้ใช้
  const incompleteCount = myBills.filter(({ issues }) => issues.length > 0).length;

  // สีขอบการ์ดสถานะ: ได้คืน = เขียว, ต้องจ่าย = ส้ม, เสมอตัว = ขอบปกติ
  let netColor: string = c.border;
  if (netR > 0) netColor = c.good;
  else if (netR < 0) netColor = c.food;

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      <View style={s.hero}>
        <View style={s.heroTop}>
          <Text style={s.heroName}>{me.name}</Text>
          <Pressable
            onPress={() => setMe(null)}
            accessibilityRole="button"
            accessibilityLabel="เปลี่ยนคนที่เลือก"
            style={s.switchBtn}
          >
            <Text style={s.switchText}>เปลี่ยน</Text>
          </Pressable>
        </View>
        <Text style={s.heroLabel}>ยอดที่ฉันต้องจ่ายรวม · {consumesLabel[me.consumes]}</Text>
        <Text style={s.heroValue}>{baht(myTotal)}</Text>
        {incompleteCount > 0 && (
          <Text style={s.heroWarn}>
            ⚠️ ยังไม่นับ {incompleteCount} บิลที่กรอกไม่ครบ — แตะบิลด้านล่างเพื่อแก้
          </Text>
        )}
      </View>

      {/* สถานะสุทธิของฉัน */}
      <View style={[s.statusCard, { borderColor: netColor }]}>
        {Math.abs(netR) < 0.01 ? (
          <Text style={s.statusEven}>เคลียร์แล้ว ไม่มียอดค้าง ✓</Text>
        ) : (
          <>
            <Text style={s.statusLabel}>{netR > 0 ? 'สุทธิ: ฉันควรได้คืน' : 'สุทธิ: ฉันต้องจ่ายเพิ่ม'}</Text>
            <Text style={[s.statusValue, { color: netR > 0 ? c.good : c.food }]}>
              {baht(Math.abs(netR))}
            </Text>
          </>
        )}
      </View>

      {/* รายการโอนที่เกี่ยวกับฉัน — ติ๊กเมื่อโอน/รับแล้ว */}
      <Text style={s.section}>ฉันต้องโอนให้ใคร</Text>
      {iPay.length === 0 && <Text style={s.hint}>ไม่มี — ฉันไม่ติดใคร</Text>}
      {iPay.map((t) => {
        const key = transferKey(t);
        const paid = state.settlements.includes(key);
        const pp = promptPay(t.toId);
        return (
          <View key={key} style={[s.transfer, paid && s.transferPaid]}>
            <View style={s.transferMain}>
              <Text style={[s.transferText, paid && s.paidText]}>
                → <Text style={[s.creditor, paid && s.paidText]}>{name(t.toId)}</Text>
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
              {...a11y('checkbox', { checked: paid })}
              accessibilityLabel={`ฉันโอนให้ ${name(t.toId)} แล้ว`}
            >
              <Text style={[s.checkText, paid && s.checkTextOn]}>
                {paid ? '✓ โอนแล้ว' : 'ยังไม่โอน — แตะเมื่อโอนแล้ว'}
              </Text>
            </Pressable>
          </View>
        );
      })}

      <Text style={s.section}>ใครต้องโอนให้ฉัน</Text>
      {iGet.length === 0 && <Text style={s.hint}>ไม่มี — ไม่มีใครติดฉัน</Text>}
      {iGet.map((t) => {
        const key = transferKey(t);
        const paid = state.settlements.includes(key);
        return (
          <View key={key} style={[s.transfer, paid && s.transferPaid]}>
            <View style={s.transferMain}>
              <Text style={[s.transferText, paid && s.paidText]}>
                <Text style={[s.debtor, paid && s.paidText]}>{name(t.fromId)}</Text> →
              </Text>
              <Text style={[s.transferAmt, paid && s.paidText]}>{baht(t.amount)}</Text>
            </View>
            <Pressable
              style={[s.check, paid && s.checkOn]}
              onPress={() => toggleSettlement(key)}
              {...a11y('checkbox', { checked: paid })}
              accessibilityLabel={`${name(t.fromId)} โอนให้ฉันแล้ว`}
            >
              <Text style={[s.checkText, paid && s.checkTextOn]}>
                {paid ? '✓ รับเงินแล้ว' : 'ยังไม่ได้รับ — แตะเมื่อได้รับแล้ว'}
              </Text>
            </Pressable>
          </View>
        );
      })}

      {/* บิลที่ฉันร่วม */}
      <Text style={s.section}>บิลที่ฉันร่วม ({myBills.length})</Text>
      {myBills.length === 0 && <Text style={s.hint}>ฉันยังไม่ได้ร่วมบิลไหน</Text>}
      {myBills.map(({ bill, bd, issues }) => {
        const myAmt = bd.perMember.get(me.id) ?? 0;
        const iPaid = bill.paidById === me.id;
        return (
          <Pressable
            key={bill.id}
            style={[s.billCard, issues.length > 0 && s.billCardIncomplete]}
            onPress={() => router.push(`/bill/${bill.id}` as never)}
            accessibilityRole="button"
            accessibilityLabel={`บิล ${bill.name} ส่วนของฉัน ${baht(myAmt)}${
              issues.length > 0 ? ' ยังไม่เข้าสรุป' : ''
            } แตะเพื่อดูรายละเอียด`}
          >
            <View style={s.billTop}>
              <Text style={s.billName}>{bill.name}</Text>
              <Text style={s.billMyAmt}>{baht(myAmt)}</Text>
            </View>
            <Text style={s.billMeta}>
              {categoryLabel[bill.category]} · {splitModeLabel[bill.splitMode]}
              {iPaid ? ' · ฉันเป็นคนออกเงิน' : ''}
            </Text>
            {issues.map((msg) => (
              <Text key={msg} style={s.billIssue}>
                ⚠️ {msg}
              </Text>
            ))}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.bg },
  content: { padding: 16, gap: 8, paddingBottom: 40 },
  title: { color: c.text, fontSize: 22, fontWeight: '800' },
  subtitle: { color: c.sub, fontSize: 14, marginBottom: 6 },
  pickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: c.card,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: c.border,
  },
  pickName: { color: c.text, fontSize: 16, fontWeight: '600', flex: 1 },
  rowDisabled: { opacity: 0.5 },
  chevron: { color: c.sub, fontSize: 24 },
  hero: {
    backgroundColor: c.card,
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: c.border,
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heroName: { color: c.text, fontSize: 22, fontWeight: '800' },
  switchBtn: {
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    minHeight: 40,
    justifyContent: 'center',
  },
  switchText: { color: c.sub, fontSize: 13, fontWeight: '600' },
  heroLabel: { color: c.sub, fontSize: 13, marginTop: 12 },
  heroValue: { color: c.text, fontSize: 36, fontWeight: '800', marginTop: 4 },
  heroWarn: { color: c.food, fontSize: 12, fontWeight: '600', marginTop: 8 },
  statusCard: {
    backgroundColor: c.card,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    alignItems: 'center',
    gap: 2,
    marginTop: 4,
  },
  statusLabel: { color: c.sub, fontSize: 13 },
  statusValue: { fontSize: 28, fontWeight: '800' },
  statusEven: { color: c.good, fontSize: 16, fontWeight: '700' },
  section: { color: c.text, fontSize: 16, fontWeight: '700', marginTop: 16 },
  hint: { color: c.sub, fontSize: 12 },
  transfer: {
    backgroundColor: c.card,
    borderRadius: 12,
    padding: 14,
    gap: 8,
    borderWidth: 1,
    borderColor: c.border,
  },
  transferMain: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  transferPaid: { opacity: 0.6, borderColor: c.good },
  paidText: { textDecorationLine: 'line-through', color: c.sub },
  transferText: { color: c.text, fontSize: 16 },
  debtor: { color: c.food, fontWeight: '700' },
  creditor: { color: c.good, fontWeight: '700' },
  transferAmt: { color: c.text, fontSize: 16, fontWeight: '800' },
  check: {
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
    minHeight: 40,
    justifyContent: 'center',
  },
  checkOn: { borderColor: c.good, backgroundColor: c.cardAlt },
  checkText: { color: c.sub, fontSize: 13, fontWeight: '600' },
  checkTextOn: { color: c.good },
  ppCopy: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.cardAlt,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    minHeight: 40,
  },
  ppCopyText: { color: c.primary, fontSize: 14, fontWeight: '700' },
  ppNone: { color: c.sub, fontSize: 12, fontStyle: 'italic' },
  billCard: {
    backgroundColor: c.card,
    borderRadius: 12,
    padding: 14,
    gap: 4,
    borderWidth: 1,
    borderColor: c.border,
  },
  billCardIncomplete: { borderColor: c.food },
  billTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  billName: { color: c.text, fontSize: 16, fontWeight: '700', flex: 1 },
  billMyAmt: { color: c.primary, fontSize: 16, fontWeight: '800' },
  billMeta: { color: c.sub, fontSize: 12 },
  billIssue: { color: c.food, fontSize: 12, fontWeight: '600' },
  emptyBox: { alignItems: 'center', gap: 8, paddingVertical: 40, paddingHorizontal: 24 },
  emptyIcon: { fontSize: 44 },
  emptyTitle: { color: c.text, fontSize: 16, fontWeight: '700' },
  emptyDesc: { color: c.sub, fontSize: 13, textAlign: 'center' },
  cta: { backgroundColor: c.primary, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 24, marginTop: 8 },
  ctaText: { color: c.onPrimary, fontWeight: '800', fontSize: 15 },
});
