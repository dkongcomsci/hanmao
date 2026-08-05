import * as Location from 'expo-location';
import { useMemo, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { distanceM } from '../src/utils/geo';
import {
  billIssues,
  computeBill,
  computeNetBalances,
  computeTotals,
  nothingOwed,
  settleUp,
  transferKey,
} from '../src/domain/split';
import {
  a11y,
  baht,
  categoryLabel,
  confirmAction,
  copyText,
  formatPromptPay,
  friendlyError,
  notify,
  Palette,
  splitModeLabel,
} from '../src/ui';
import { useTheme } from '../src/ui/theme';
import { shareViewAsImage } from '../src/ui/share';
import { useStore } from '../src/data/store';

/**
 * ข้อความยืนยันก่อนเคลียร์/ปิดวง — เป็นการลบถาวร ต้องบอกให้ชัดว่ากู้คืนไม่ได้
 * ในวง: ลบวงได้เฉพาะคนที่สร้างวง คนอื่นกดแล้วเป็นการ "ออกจากวง" → ต้องบอกตามจริง
 */
function closeConfirmCopy(
  inGroup: boolean,
  isHost: boolean,
  groupName: string,
): { title: string; message: string; confirmLabel: string } {
  if (!inGroup) {
    return {
      title: 'ลบข้อมูลทั้งหมดถาวร?',
      message: 'สมาชิก บิล และรายการโอนทั้งหมดจะถูกลบถาวร กู้คืนไม่ได้',
      confirmLabel: 'ลบถาวร',
    };
  }
  if (isHost) {
    return {
      title: `ปิดวง "${groupName}" ถาวร?`,
      message: 'สมาชิก บิล และรายการโอนของวงนี้จะถูกลบถาวรสำหรับทุกคนในวง กู้คืนไม่ได้',
      confirmLabel: 'ปิดวง',
    };
  }
  return {
    title: `ออกจากวง "${groupName}"?`,
    message: 'ลบวงได้เฉพาะคนที่สร้างวง — ยืนยันแล้วคุณจะออกจากวงนี้ และกลับไปใช้ข้อมูลในเครื่อง',
    confirmLabel: 'ออกจากวง',
  };
}

export default function Summary() {
  const { state, setVenue, mode, group, isHost, toggleSettlement, closeGroup } = useStore();
  const { colors: c } = useTheme();
  const s = useMemo(() => makeStyles(c), [c]);
  // เวลาอ้างอิงเดียวสำหรับทั้ง render (บิลโหมด "หารตามเวลา" ต้องใช้ค่าเดียวกันทุกจุด ไม่งั้นยอดในหน้าเดียวไม่ตรงกัน)
  const now = Date.now();
  const { perMember, grandTotal } = computeTotals(state, now);
  const net = computeNetBalances(state, now);
  // เอาเฉพาะคนที่มียอดค้างจริง (ตัดคนที่เสมอตัวออก เพื่อรู้ว่าต้องโชว์หัวข้อว่างไหม)
  const netRows = [...net.entries()].filter(([, v]) => Math.abs(v) >= 0.01);
  const transfers = settleUp(state, now);
  const doneCount = transfers.filter((t) => state.settlements.includes(transferKey(t))).length;
  const hasSummary = perMember.size > 0;
  // "เคลียร์ได้" = มีข้อมูลให้สรุปจริง และไม่มีหนี้ค้าง (โอนครบ หรือหารลงตัวไม่ต้องโอนเลย)
  const everyoneSettled = hasSummary && nothingOwed(transfers, state.settlements);
  const [checking, setChecking] = useState(false);
  const [distance, setDistance] = useState<number | null>(null);
  const [sharing, setSharing] = useState(false);
  const [closing, setClosing] = useState(false);
  const cardRef = useRef<View>(null);

  const name = (id: string) => state.members.find((m) => m.id === id)?.name ?? '?';
  const promptPay = (id: string) => state.members.find((m) => m.id === id)?.promptPay ?? null;

  // export การ์ดสรุปเป็นรูป (web: ดาวน์โหลด, native: share sheet)
  const onShare = async () => {
    setSharing(true);
    try {
      await shareViewAsImage(cardRef, group?.name ? `หารเมา-${group.name}` : 'หารเมา-สรุป');
    } catch {
      notify('แชร์รูปไม่สำเร็จ', 'ลองใหม่อีกครั้ง');
    } finally {
      setSharing(false);
    }
  };

  const copyPromptPay = async (pp: string, who: string) => {
    const ok = await copyText(pp);
    if (ok) notify('คัดลอกแล้ว', `พร้อมเพย์ของ ${who}\n${formatPromptPay(pp)}`);
    else notify('คัดลอกไม่สำเร็จ', `พร้อมเพย์ของ ${who}: ${formatPromptPay(pp)}`);
  };

  const closeCopy = closeConfirmCopy(mode === 'group', isHost, group?.name ?? '');

  const onClose = () => {
    confirmAction({
      title: closeCopy.title,
      message: closeCopy.message,
      confirmLabel: closeCopy.confirmLabel,
      onConfirm: () => {
        setClosing(true);
        closeGroup()
          .catch((e) => notify('ทำรายการไม่สำเร็จ', friendlyError(e, 'ลองใหม่อีกครั้ง')))
          .finally(() => setClosing(false));
      },
    });
  };

  const setHere = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      notify('ไม่ได้รับอนุญาตตำแหน่ง');
      return;
    }
    const pos = await Location.getCurrentPositionAsync({});
    setVenue({ lat: pos.coords.latitude, lng: pos.coords.longitude, radiusM: 150 });
    notify('บันทึกพื้นที่ร้านแล้ว', 'รัศมี 150 เมตร');
  };

  const checkHere = async () => {
    if (!state.venue) {
      notify('ยังไม่ได้ตั้งพื้นที่ร้าน', 'กด "ตั้งพื้นที่ร้าน" ก่อน');
      return;
    }
    setChecking(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        notify('ไม่ได้รับอนุญาตตำแหน่ง');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({});
      const d = distanceM(state.venue, {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
      });
      setDistance(d);
      notify(
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

  // ป้ายปุ่มเคลียร์/ปิดวง — ใช้คำเดียวกับปุ่มยืนยัน ยกเว้น local mode ที่ใช้คำคุ้นเดิม
  let closeLabel: string;
  if (closing) closeLabel = 'กำลังลบ...';
  else if (mode === 'group') closeLabel = closeCopy.confirmLabel;
  else closeLabel = 'เคลียร์ทั้งหมด';

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
        {!hasSummary && <Text style={s.hint}>ยังไม่มีข้อมูลให้สรุป</Text>}

        {transfers.length > 0 && (
          <>
            <Text style={s.cardSection}>ใครโอนให้ใคร</Text>
            {/* หมายเหตุความเป็นส่วนตัว: ห้ามใส่เบอร์พร้อมเพย์ในการ์ดนี้ เพราะรูปถูกส่งต่อในกลุ่มแชท */}
            {transfers.map((t) => (
              <View key={transferKey(t)} style={s.cardRow}>
                <Text style={s.rowName}>
                  <Text style={s.debtor}>{name(t.fromId)}</Text> → <Text style={s.creditor}>{name(t.toId)}</Text>
                </Text>
                <Text style={s.rowValue}>{baht(t.amount)}</Text>
              </View>
            ))}
          </>
        )}
      </View>

      {/* ปุ่มแชร์/ดาวน์โหลดรูปสรุป */}
      <Pressable
        style={[s.shareBtn, (sharing || !hasSummary) && s.shareBtnDisabled]}
        onPress={onShare}
        disabled={sharing || !hasSummary}
        {...a11y('button', { disabled: sharing || !hasSummary })}
        accessibilityLabel={Platform.OS === 'web' ? 'ดาวน์โหลดรูปสรุป' : 'แชร์รูปสรุป'}
        accessibilityHint={hasSummary ? undefined : 'เพิ่มสมาชิกและบิลก่อนจึงจะบันทึกรูปได้'}
      >
        <Text style={s.shareBtnText}>{shareLabel}</Text>
      </Pressable>
      <Text style={s.hint}>รูปสรุปไม่มีเบอร์พร้อมเพย์ ส่งต่อในกลุ่มได้ปลอดภัย</Text>

      {!hasSummary && (
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
        const bd = computeBill(bill, state.members, now);
        const payer = bill.paidById ? name(bill.paidById) : null;
        // เหตุผลที่บิลนี้ยังไม่เข้าสรุป (ว่าง = เข้าสรุปแล้ว) — บอกผู้ใช้ตรง ๆ ไม่เงียบ
        const issues = billIssues(bill, state.members);
        return (
          <View key={bill.id} style={[s.billCard, issues.length > 0 && s.billCardIncomplete]}>
            <View style={s.billTop}>
              <Text style={s.billName}>{bill.name}</Text>
              <Text style={s.billTotal}>{baht(bd.total)}</Text>
            </View>
            <Text style={s.billMeta}>
              {categoryLabel[bill.category]} · {splitModeLabel[bill.splitMode]} ·{' '}
              {payer ? `ออกเงิน: ${payer}` : 'ยังไม่ระบุคนจ่าย'}
            </Text>
            {issues.length > 0 && (
              <View style={s.issueBox} accessibilityRole="alert">
                <Text style={s.issueTitle}>⚠️ บิลนี้ยังไม่เข้าสรุป</Text>
                {issues.map((msg) => (
                  <Text key={msg} style={s.issueText}>
                    • {msg}
                  </Text>
                ))}
              </View>
            )}
            {!!bd.soleBearerId && (
              <Text style={s.billNote}>
                {bill.isTreat
                  ? `🎁 ${name(bd.soleBearerId)} เลี้ยง — คนอื่นไม่ต้องหาร`
                  : `${name(bd.soleBearerId)} รับยอดนี้คนเดียว (ไม่มีคนเข้าเงื่อนไขบิล)`}
              </Text>
            )}
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
      {transfers.length === 0 && (
        <Text style={s.hint}>
          {hasSummary
            ? 'ไม่มีใครต้องโอน — ทุกคนออกเงินพอดีกับส่วนของตัวเองแล้ว'
            : 'ยังไม่มีรายการโอน (ระบุคนจ่ายในแต่ละบิล)'}
        </Text>
      )}
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
              {...a11y('checkbox', { checked: paid })}
              accessibilityLabel={`${name(t.fromId)} โอนให้ ${name(t.toId)} แล้ว`}
            >
              <Text style={[s.checkText, paid && s.checkTextOn]}>
                {paid ? '✓ โอนแล้ว' : 'ยังไม่โอน — แตะเมื่อโอนแล้ว'}
              </Text>
            </Pressable>
          </View>
        );
      })}

      {/* ไม่มีหนี้ค้าง (โอนครบ หรือหารลงตัวไม่ต้องโอน) → เคลียร์/ปิดวงได้ */}
      {everyoneSettled && (
        <View style={s.doneBox}>
          <Text style={s.doneIcon}>🎉</Text>
          <Text style={s.doneTitle}>จ่ายครบทุกคนแล้ว!</Text>
          <Text style={s.doneDesc}>
            {mode === 'group'
              ? 'ปิดวงนี้เพื่อลบข้อมูลถาวรสำหรับทุกคน (กู้คืนไม่ได้)'
              : 'เคลียร์ข้อมูลทั้งหมดเพื่อเริ่มหารรอบใหม่ (ลบถาวร กู้คืนไม่ได้)'}
          </Text>
          <Pressable
            style={[s.doneBtn, closing && s.doneBtnDisabled]}
            onPress={onClose}
            disabled={closing}
            {...a11y('button', { disabled: closing })}
            accessibilityLabel={mode === 'group' ? closeCopy.title : 'ลบข้อมูลทั้งหมดถาวร'}
          >
            <Text style={s.doneBtnText}>{closeLabel}</Text>
          </Pressable>
        </View>
      )}

      {/* สถานะสุทธิ: ใครออกเกิน/ค้าง */}
      <Text style={s.section}>สถานะแต่ละคน</Text>
      {netRows.length === 0 && (
        <Text style={s.hint}>
          {hasSummary ? 'ทุกคนเสมอตัว ไม่มีใครค้างใคร' : 'ยังไม่มียอดค้าง — สร้างบิลก่อน'}
        </Text>
      )}
      {netRows.map(([id, v]) => {
        const r = Math.round(v * 100) / 100;
        return (
          <View key={id} style={s.row}>
            <Text style={s.rowName}>{name(id)}</Text>
            <Text style={[s.rowValue, { color: r > 0 ? c.good : c.food }]}>
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
              style={[s.locBtn, { borderColor: c.primary }]}
              onPress={setHere}
              accessibilityRole="button"
              accessibilityLabel="ตั้งพื้นที่ร้าน จากตำแหน่งปัจจุบัน"
            >
              <Text style={[s.locText, { color: c.primary }]}>ตั้งพื้นที่ร้าน</Text>
            </Pressable>
            <Pressable
              style={[s.locBtn, { borderColor: c.good }]}
              onPress={checkHere}
              disabled={checking}
              {...a11y('button', { disabled: checking })}
              accessibilityLabel="เช็กว่ายังอยู่ในพื้นที่ร้านไหม"
            >
              <Text style={[s.locText, { color: c.good }]}>
                {checking ? '...' : 'เช็กว่ายังอยู่ไหม'}
              </Text>
            </Pressable>
          </View>
        </>
      )}
    </ScrollView>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.bg },
  content: { padding: 16, gap: 8, paddingBottom: 40 },
  hero: {
    backgroundColor: c.card,
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: c.border,
  },
  heroLabel: { color: c.sub, fontSize: 14 },
  heroValue: { color: c.text, fontSize: 36, fontWeight: '800', marginTop: 4 },
  // การ์ดสรุปสำหรับจับภาพ export
  shareCard: {
    backgroundColor: c.card,
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: c.border,
    gap: 4,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  brand: { color: c.primary, fontSize: 18, fontWeight: '800' },
  brandSub: { color: c.sub, fontSize: 13, fontWeight: '600' },
  cardSection: { color: c.text, fontSize: 15, fontWeight: '700', marginTop: 14, marginBottom: 2 },
  cardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: c.border,
    gap: 8,
  },
  shareBtn: {
    backgroundColor: c.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  shareBtnDisabled: { opacity: 0.4 },
  shareBtnText: { color: c.onPrimary, fontWeight: '800', fontSize: 15 },
  section: { color: c.text, fontSize: 16, fontWeight: '700', marginTop: 16 },
  hint: { color: c.sub, fontSize: 12 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: c.card,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: c.border,
  },
  rowName: { color: c.text, fontSize: 16 },
  rowValue: { color: c.text, fontSize: 16, fontWeight: '700' },
  transfer: {
    backgroundColor: c.card,
    borderRadius: 12,
    padding: 14,
    gap: 8,
    borderWidth: 1,
    borderColor: c.border,
  },
  transferMain: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  transferText: { color: c.text, fontSize: 16 },
  debtor: { color: c.food, fontWeight: '700' },
  creditor: { color: c.good, fontWeight: '700' },
  transferAmt: { color: c.text, fontSize: 16, fontWeight: '800' },
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
  progress: { color: c.sub, fontSize: 13, fontWeight: '600' },
  transferPaid: { opacity: 0.6, borderColor: c.good },
  paidText: { textDecorationLine: 'line-through', color: c.sub },
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
  doneBox: {
    alignItems: 'center',
    gap: 6,
    backgroundColor: c.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: c.good,
    padding: 20,
    marginTop: 16,
  },
  doneIcon: { fontSize: 40 },
  doneTitle: { color: c.good, fontSize: 18, fontWeight: '800' },
  doneDesc: { color: c.sub, fontSize: 13, textAlign: 'center' },
  doneBtn: {
    backgroundColor: c.danger,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 24,
    marginTop: 8,
  },
  doneBtnDisabled: { opacity: 0.5 },
  doneBtnText: { color: c.onPrimary, fontWeight: '800', fontSize: 15 },
  emptyBox: { alignItems: 'center', gap: 6, paddingVertical: 32, paddingHorizontal: 24 },
  emptyIcon: { fontSize: 44 },
  emptyTitle: { color: c.text, fontSize: 16, fontWeight: '700' },
  emptyDesc: { color: c.sub, fontSize: 13, textAlign: 'center' },
  billCard: {
    backgroundColor: c.card,
    borderRadius: 12,
    padding: 14,
    gap: 6,
    borderWidth: 1,
    borderColor: c.border,
  },
  billCardIncomplete: { borderColor: c.food },
  billTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  billName: { color: c.text, fontSize: 16, fontWeight: '700', flex: 1 },
  billTotal: { color: c.primary, fontSize: 16, fontWeight: '800' },
  billMeta: { color: c.sub, fontSize: 12, marginBottom: 4 },
  billNote: { color: c.primary, fontSize: 12, fontWeight: '600' },
  // กล่องบอกเหตุผลที่บิลยังไม่เข้าสรุป (จาก billIssues)
  issueBox: {
    backgroundColor: c.cardAlt,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: c.food,
    padding: 10,
    gap: 2,
  },
  issueTitle: { color: c.food, fontSize: 13, fontWeight: '800' },
  issueText: { color: c.sub, fontSize: 12, lineHeight: 18 },
  billMemberRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    borderTopWidth: 1,
    borderTopColor: c.border,
  },
  billMemberName: { color: c.text, fontSize: 14 },
  billMemberAmt: { color: c.text, fontSize: 14, fontWeight: '600' },
  locRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  locBtn: { flex: 1, borderWidth: 1, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  locText: { fontWeight: '700' },
});
