import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { billIssues, billMembers, computeBill } from '../../src/domain/split';
import { Bill, SplitMode } from '../../src/domain/types';
import { a11y, baht, confirmRemove, consumesLabel, friendlyError, notify, Palette, splitModeLabel } from '../../src/ui';
import { useTheme } from '../../src/ui/theme';
import { useStore } from '../../src/data/store';
import { uuid } from '../../src/utils/id';

// ปิดโหมด "หารตามเวลา" ไว้ก่อน — ยังไม่ให้เลือกใหม่ (บิลเก่าที่เป็น time ยังคำนวณได้ตามเดิม)
const MODES: SplitMode[] = ['equal', 'itemized'];

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
  // เปิด popup เลือกหน้าถัดไปหลังบันทึกสำเร็จ (เป็น component ในแอป ไม่ใช้ dialog ของ browser)
  const [savedModal, setSavedModal] = useState(false);

  // draft = สำเนาที่แก้ในหน้านี้ ยังไม่เขียนลง store จนกว่าจะกด "บันทึก"
  const [draft, setDraft] = useState<Bill | null>(bill ?? null);
  // baseRef = ลายเซ็นของบิลใน store ที่ draft อ้างอิงอยู่ (เทียบว่าแก้ค้างไว้ไหม + รับค่าใหม่จาก realtime)
  const baseRef = useRef<string>(bill ? JSON.stringify(bill) : '');
  const base = bill ? JSON.stringify(bill) : '';
  // บิลใน store เปลี่ยน (เพื่อนในกลุ่มแก้/โหลดใหม่) และเราไม่ได้แก้ค้างไว้ → รับค่าใหม่มาเป็น draft
  useEffect(() => {
    if (!bill) return;
    setDraft((prev) => {
      const notDirty = prev === null || JSON.stringify(prev) === baseRef.current;
      baseRef.current = base;
      return notDirty ? bill : prev;
    });
  }, [base, bill]);

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

  // draft ยังไม่พร้อม (รอ effect รอบแรก) — ไม่ render อะไรก่อน
  if (!draft) return null;

  // แก้เฉพาะ draft (ไม่แตะ store) — commit ตอนกด "บันทึก"
  const patch = (p: Partial<Bill>) => setDraft((d) => (d ? { ...d, ...p } : d));

  // มีการแก้ไขที่ยังไม่บันทึกไหม
  const dirty = JSON.stringify(draft) !== baseRef.current;
  // บันทึกได้เมื่อ: เลือกคนออกเงินแล้ว + มีเมนูอย่างน้อย 1 รายการ (นอกจากต้องมีการแก้ไข)
  const hasPayer = !!draft.paidById;
  const hasItems = draft.items.length > 0;
  const canSave = dirty && hasPayer && hasItems;
  // เหตุผลที่ยังบันทึกไม่ได้ (ใช้เป็นทั้ง hint บนจอและ accessibilityHint)
  let saveBlock = '';
  if (!hasPayer) saveBlock = 'เลือกคนออกเงินก่อนจึงจะบันทึกได้';
  else if (!hasItems) saveBlock = 'เพิ่มเมนูอย่างน้อย 1 รายการก่อนจึงจะบันทึกได้';
  else if (!dirty) saveBlock = 'ยังไม่มีการแก้ไขให้บันทึก';

  const save = () => {
    if (!canSave) return;
    try {
      // เขียนทั้งบิล (รวมเมนู) ทีเดียว — saveBill จัดการ sync เมนูขึ้น server ให้เอง
      store.saveBill(draft);
      baseRef.current = JSON.stringify(draft);
    } catch (e) {
      notify('บันทึกไม่สำเร็จ', friendlyError(e, 'ลองใหม่อีกครั้ง'));
      return;
    }
    // บันทึกแล้ว — เปิด popup (component) ให้เลือกจะไปหน้าไหนต่อ
    setSavedModal(true);
  };

  // ปิด popup แล้วไปหน้าที่เลือก (ปิดก่อนเพื่อไม่ให้ modal ค้างบนหน้าใหม่)
  const goAfterSave = (path: string) => {
    setSavedModal(false);
    router.replace(path as never);
  };

  // เวลาอ้างอิงเดียวสำหรับทั้ง render (บิลโหมด "หารตามเวลา" ต้องใช้ค่าเดียวกันทุกจุด)
  const now = Date.now();
  const bd = computeBill(draft, store.state.members, now);
  const eligible = billMembers(draft, store.state.members);
  // เหตุผลที่บิลยังไม่เข้าสรุป — ใช้ข้อความจาก domain ให้ตรงกับเกณฑ์จริงเสมอ
  const issues = billIssues(draft, store.state.members);
  const priceNum = parseFloat(itemPrice);
  const canAddItem = itemName.trim().length > 0 && !isNaN(priceNum);

  const addItem = () => {
    if (!canAddItem) return;
    patch({ items: [...draft.items, { id: uuid(), name: itemName.trim(), price: priceNum, participantIds: [] }] });
    setItemName('');
    setItemPrice('');
  };

  const removeItem = (itemId: string) =>
    patch({ items: draft.items.filter((it) => it.id !== itemId) });

  const toggleItemParticipant = (itemId: string, memberId: string) =>
    patch({
      items: draft.items.map((it) =>
        it.id !== itemId
          ? it
          : {
              ...it,
              participantIds: it.participantIds.includes(memberId)
                ? it.participantIds.filter((x) => x !== memberId)
                : [...it.participantIds, memberId],
            },
      ),
    });

  // เลือก/ยกเลิกคนออกเงิน — ยกเลิกแล้วต้องปลด "บิลเลี้ยง" ด้วย (เลี้ยงโดยไม่มีคนจ่ายไม่มีความหมาย)
  const pickPayer = (memberId: string) => {
    if (draft.paidById === memberId) patch({ paidById: null, isTreat: false });
    else patch({ paidById: memberId });
  };

  const payerName = store.state.members.find((m) => m.id === draft.paidById)?.name ?? null;

  // คำอธิบายใต้หัวข้อ "ใครร่วมบิลนี้" (ไม่เลือกใคร = ทุกคนที่เข้าเงื่อนไขหมวด)
  const allWord =
    draft.category === 'mixed' ? 'ทุกคนในกลุ่ม' : `ทุกคนที่กิน${consumesLabel[draft.category]}`;
  const participantHint =
    draft.memberIds.length === 0
      ? `ไม่เลือก = ${allWord} (${eligible.length} คน)`
      : `เลือกไว้ ${draft.memberIds.length} คน · แตะซ้ำเพื่อเอาออก`;

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      {/* ชื่อบิล */}
      <TextInput
        value={draft.name}
        onChangeText={(t) => patch({ name: t })}
        style={s.title}
        placeholder="ชื่อบิล"
        placeholderTextColor={c.sub}
        accessibilityLabel="ชื่อบิล"
      />
      {draft.name.trim().length === 0 && (
        <Text style={s.errorText}>ยังไม่ได้ตั้งชื่อบิล — ตั้งชื่อไว้จะหาง่ายกว่า</Text>
      )}

      {/* วิธีหาร */}
      <Text style={s.section}>วิธีหาร</Text>
      <View style={s.chips}>
        {MODES.map((m) => (
          <Pressable
            key={m}
            onPress={() => patch({ splitMode: m })}
            style={[s.chip, draft.splitMode === m && s.chipActive]}
            {...a11y('button', { selected: draft.splitMode === m })}
            accessibilityLabel={`วิธีหาร ${splitModeLabel[m]}`}
          >
            <Text style={[s.chipText, draft.splitMode === m && s.chipTextActive]}>
              {splitModeLabel[m]}
            </Text>
          </Pressable>
        ))}
      </View>
      {draft.splitMode === 'time' && (
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
            style={[s.chip, draft.paidById === m.id && s.chipActive]}
            {...a11y('button', { selected: draft.paidById === m.id })}
            accessibilityLabel={`คนออกเงิน ${m.name}`}
          >
            <Text style={[s.chipText, draft.paidById === m.id && s.chipTextActive]}>{m.name}</Text>
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
        style={[s.treatRow, draft.isTreat && s.treatRowActive]}
        onPress={() => patch({ isTreat: !draft.isTreat })}
        disabled={!draft.paidById}
        {...a11y('switch', { checked: !!draft.isTreat, disabled: !draft.paidById })}
        accessibilityLabel="บิลนี้คนจ่ายเลี้ยง"
      >
        <View style={{ flex: 1 }}>
          <Text style={[s.treatTitle, !draft.paidById && { opacity: 0.4 }]}>🎁 คนจ่ายเลี้ยง</Text>
          <Text style={[s.treatDesc, !draft.paidById && { opacity: 0.4 }]}>
            {payerName ? `${payerName} จ่ายเต็ม คนอื่นไม่ต้องหาร` : 'เลือกคนออกเงินก่อน'}
          </Text>
        </View>
        <View style={[s.toggle, draft.isTreat && s.toggleOn]}>
          <View style={[s.knob, draft.isTreat && s.knobOn]} />
        </View>
      </Pressable>

      {/* ใครร่วมบิลนี้ (เผื่อมาทีหลัง/กลับก่อน) */}
      <Text style={s.section}>ใครร่วมบิลนี้</Text>
      <Text style={s.hint}>{participantHint}</Text>
      <View style={s.chips}>
        {store.state.members.map((m) => {
          const on = draft.memberIds.includes(m.id);
          return (
            <Pressable
              key={m.id}
              onPress={() =>
                patch({
                  memberIds: on
                    ? draft.memberIds.filter((x) => x !== m.id)
                    : [...draft.memberIds, m.id],
                })
              }
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
          style={[s.addSmall, draft.items.length === 0 && s.addSmallHighlight, !canAddItem && s.btnDisabled]}
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
      {draft.items.length === 0 && (
        <Text style={s.hint}>ยังไม่มีเมนู — ใส่ชื่อเมนูกับราคาด้านบนแล้วกด +</Text>
      )}

      {draft.items.map((it) => (
        <View key={it.id} style={s.item}>
          <View style={s.itemTop}>
            <Text style={s.itemName}>{it.name}</Text>
            <Text style={s.itemPrice}>{baht(it.price)}</Text>
            <Pressable
              style={s.delBtn}
              onPress={() => confirmRemove(it.name, () => removeItem(it.id))}
              accessibilityRole="button"
              accessibilityLabel={`ลบเมนู ${it.name}`}
            >
              <Text style={s.del}>✕</Text>
            </Pressable>
          </View>
          {draft.splitMode === 'itemized' && (
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
                      onPress={() => toggleItemParticipant(it.id, m.id)}
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
          value={draft.serviceChargePct}
          onChange={(n) => patch({ serviceChargePct: n })}
        />
        <ChargeInput
          s={s}
          c={c}
          label="VAT %"
          a11yLabel="ภาษีมูลค่าเพิ่ม เปอร์เซ็นต์"
          value={draft.vatPct}
          onChange={(n) => patch({ vatPct: n })}
        />
        <ChargeInput
          s={s}
          c={c}
          label="ส่วนลด ฿"
          a11yLabel="ส่วนลด บาท"
          value={draft.discount}
          onChange={(n) => patch({ discount: n })}
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
          {draft.isTreat
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

      {/* บันทึก: เขียน draft ลง store — กดได้เมื่อมีการแก้ไข + เลือกคนออกเงิน + มีเมนูแล้ว */}
      <Text style={s.hint}>{canSave ? 'มีการแก้ไขที่ยังไม่บันทึก' : saveBlock}</Text>
      <Pressable
        style={[s.saveBill, !canSave && s.btnDisabled]}
        onPress={save}
        disabled={!canSave}
        {...a11y('button', { disabled: !canSave })}
        accessibilityLabel="บันทึกบิล"
        accessibilityHint={canSave ? undefined : saveBlock}
      >
        <Text style={s.saveBillText}>บันทึก</Text>
      </Pressable>

      <Pressable
        style={s.deleteBill}
        onPress={() =>
          confirmRemove(draft.name || 'บิลนี้', () => {
            store.removeBill(draft.id);
            // ใช้ replace เพื่อไม่ให้ย้อนกลับมาหน้าบิลที่ถูกลบแล้ว (เข้าจาก deep link ก็ยังกลับได้)
            router.replace('/bills' as never);
          })
        }
        accessibilityRole="button"
        accessibilityLabel={`ลบบิล ${draft.name || 'ไม่มีชื่อ'}`}
      >
        <Text style={s.deleteBillText}>ลบบิลนี้</Text>
      </Pressable>

      {/* popup หลังบันทึกสำเร็จ — เลือกไปหน้าถัดไป (component ในแอป) */}
      <Modal
        visible={savedModal}
        transparent
        animationType="fade"
        onRequestClose={() => setSavedModal(false)}
      >
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>บันทึกบิลแล้ว ✅</Text>
            <Text style={s.modalDesc}>จะไปหน้าไหนต่อดี?</Text>
            <Pressable
              style={s.modalPrimary}
              onPress={() => goAfterSave('/summary')}
              accessibilityRole="button"
              accessibilityLabel="ไปหน้าสรุปหารเงิน"
            >
              <Text style={s.modalPrimaryText}>สรุปหารเงิน</Text>
            </Pressable>
            <Pressable
              style={s.modalSecondary}
              onPress={() => goAfterSave('/bills')}
              accessibilityRole="button"
              accessibilityLabel="ไปหน้าบิลทั้งหมด"
            >
              <Text style={s.modalSecondaryText}>บิลทั้งหมด</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
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
  // ค่าจากภายนอกเปลี่ยน (เช่น เพื่อนในกลุ่มแก้) และไม่ตรงกับที่พิมพ์ค้างไว้ → sync ตาม
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
    borderWidth: 2,
    borderColor: 'transparent',
  },
  // ยังไม่มีเมนูเลย → ตีกรอบปุ่ม + ให้เด่น ชวนให้กดเพิ่ม
  addSmallHighlight: { borderColor: c.food },
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
  saveBill: {
    marginTop: 16,
    backgroundColor: c.primary,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  saveBillText: { color: c.onPrimary, fontWeight: '800', fontSize: 16 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: c.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: c.border,
    padding: 20,
    gap: 10,
  },
  modalTitle: { color: c.text, fontSize: 18, fontWeight: '800' },
  modalDesc: { color: c.sub, fontSize: 14, marginBottom: 4 },
  modalPrimary: {
    backgroundColor: c.primary,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  modalPrimaryText: { color: c.onPrimary, fontWeight: '800', fontSize: 16 },
  modalSecondary: {
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  modalSecondaryText: { color: c.text, fontWeight: '700', fontSize: 16 },
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
