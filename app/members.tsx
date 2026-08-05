import { useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Consumes } from '../src/domain/types';
import {
  a11y,
  confirmRemove,
  consumesLabel,
  formatPromptPay,
  isValidPromptPay,
  Palette,
} from '../src/ui';
import { useTheme } from '../src/ui/theme';
import { useStore } from '../src/data/store';

const OPTIONS: Consumes[] = ['both', 'food', 'drink'];

export default function Members() {
  const { state, addMember, updateMember, removeMember } = useStore();
  const { colors: c } = useTheme();
  const s = useMemo(() => makeStyles(c), [c]);
  const [name, setName] = useState('');
  const [consumes, setConsumes] = useState<Consumes>('both');
  const [promptPay, setPromptPay] = useState('');

  const ppValid = isValidPromptPay(promptPay);
  const canAdd = name.trim().length > 0 && ppValid;

  const submit = () => {
    if (!canAdd) return;
    addMember(name, consumes, promptPay.trim() || null);
    setName('');
    setConsumes('both');
    setPromptPay('');
  };

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      <View style={s.form}>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="ชื่อสมาชิก"
          placeholderTextColor={c.sub}
          style={s.input}
          onSubmitEditing={submit}
          returnKeyType="done"
          accessibilityLabel="ชื่อสมาชิก"
          accessibilityHint="พิมพ์ชื่อคนที่จะเพิ่ม แล้วกดปุ่มเพิ่มสมาชิก"
        />
        <Text style={s.fieldLabel}>กินอะไร</Text>
        <View style={s.chips}>
          {OPTIONS.map((o) => (
            <Chip key={o} s={s} label={consumesLabel[o]} active={consumes === o} onPress={() => setConsumes(o)} />
          ))}
        </View>
        <Text style={s.fieldLabel}>พร้อมเพย์ (ไม่บังคับ)</Text>
        <TextInput
          value={promptPay}
          onChangeText={setPromptPay}
          placeholder="เบอร์มือถือ หรือ เลขบัตร ปชช."
          placeholderTextColor={c.sub}
          keyboardType="number-pad"
          style={[s.input, !ppValid && s.inputError]}
          accessibilityLabel="พร้อมเพย์ เบอร์มือถือหรือเลขบัตรประชาชน"
        />
        {!ppValid && <Text style={s.errorText}>ต้องเป็นเบอร์มือถือ 10 หลัก หรือ เลขบัตร 13 หลัก</Text>}
        <Pressable
          style={[s.addBtn, !canAdd && s.addBtnDisabled]}
          onPress={submit}
          disabled={!canAdd}
          {...a11y('button', { disabled: !canAdd })}
          accessibilityLabel="เพิ่มสมาชิก"
          accessibilityHint={canAdd ? undefined : 'พิมพ์ชื่อก่อนจึงจะเพิ่มได้'}
        >
          <Text style={s.addBtnText}>+ เพิ่มสมาชิก</Text>
        </Pressable>
      </View>

      {state.members.length === 0 && (
        <View style={s.emptyBox}>
          <Text style={s.emptyIcon}>👥</Text>
          <Text style={s.emptyTitle}>ยังไม่มีสมาชิก</Text>
          <Text style={s.emptyDesc}>พิมพ์ชื่อด้านบนแล้วกด “เพิ่มสมาชิก” เพื่อเริ่มต้น</Text>
        </View>
      )}

      {state.members.map((m) => (
        <View key={m.id} style={s.row}>
          <View style={{ flex: 1 }}>
            <Text style={s.name}>{m.name}</Text>
            <View style={s.chips}>
              {OPTIONS.map((o) => (
                <Chip
                  key={o}
                  s={s}
                  label={consumesLabel[o]}
                  active={m.consumes === o}
                  small
                  onPress={() => updateMember(m.id, { consumes: o })}
                />
              ))}
            </View>
            <PromptPayEdit
              s={s}
              c={c}
              name={m.name}
              value={m.promptPay ?? ''}
              onSave={(v) => updateMember(m.id, { promptPay: v || null })}
            />
          </View>
          <View style={s.actions}>
            {/* ปุ่ม "มาถึง"/"กลับ" ปิดไว้ชั่วคราว — ใช้กับโหมดหารตามเวลาที่ปิดอยู่ */}
            <TinyBtn s={s} c={c} label="ลบ" color={c.danger} onPress={() => confirmRemove(m.name, () => removeMember(m.id))} />
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

type Styles = ReturnType<typeof makeStyles>;

/** แก้พร้อมเพย์ของสมาชิกแบบ inline (บันทึกเมื่อกดปุ่ม "บันทึก") */
function PromptPayEdit({
  s,
  c,
  name,
  value,
  onSave,
}: Readonly<{ s: Styles; c: Palette; name: string; value: string; onSave: (v: string) => void }>) {
  const [text, setText] = useState(value);
  // ค่าจากภายนอกเปลี่ยน (เพื่อนในกลุ่มแก้ผ่าน realtime) และเราไม่ได้พิมพ์ค้างไว้ → sync ตาม
  useEffect(() => {
    setText((prev) => (prev.trim() === value.trim() ? prev : value));
  }, [value]);

  const valid = isValidPromptPay(text);
  const dirty = text.trim() !== value.trim(); // มีการแก้ไขที่ยังไม่บันทึกไหม
  const canSave = dirty && valid;
  const save = () => {
    if (canSave) onSave(text.trim());
  };

  return (
    <View style={{ marginTop: 6, gap: 2 }}>
      <Text style={s.ppLabel}>พร้อมเพย์: {value ? formatPromptPay(value) : '— ยังไม่ระบุ'}</Text>
      <View style={s.ppRow}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="เบอร์มือถือ / เลขบัตร ปชช."
          placeholderTextColor={c.sub}
          keyboardType="number-pad"
          style={[s.ppInput, { flex: 1 }, !valid && s.inputError]}
          accessibilityLabel={`แก้พร้อมเพย์ของ ${name}`}
        />
        {/* ปุ่มบันทึก: โผล่เมื่อมีการแก้ไข, กดได้เมื่อค่าถูกต้อง */}
        {dirty && (
          <Pressable
            onPress={save}
            disabled={!canSave}
            style={[s.ppSaveBtn, !canSave && s.addBtnDisabled]}
            {...a11y('button', { disabled: !canSave })}
            accessibilityLabel={`บันทึกพร้อมเพย์ของ ${name}`}
            accessibilityHint={canSave ? undefined : 'กรอกพร้อมเพย์ให้ถูกต้องก่อนจึงจะบันทึกได้'}
          >
            <Text style={s.ppSaveText}>บันทึก</Text>
          </Pressable>
        )}
      </View>
      {!valid && <Text style={s.errorText}>ต้องเป็นเบอร์มือถือ 10 หลัก หรือ เลขบัตร 13 หลัก</Text>}
    </View>
  );
}

function Chip({
  s,
  label,
  active,
  small,
  onPress,
}: Readonly<{
  s: Styles;
  label: string;
  active: boolean;
  small?: boolean;
  onPress: () => void;
}>) {
  return (
    <Pressable
      onPress={onPress}
      style={[s.chip, active && s.chipActive, small && s.chipSmall]}
      {...a11y('button', { selected: active })}
      accessibilityLabel={label}
    >
      <Text style={[s.chipText, active && s.chipTextActive, small && { fontSize: 12 }]}>{label}</Text>
    </Pressable>
  );
}

function TinyBtn({
  s,
  c,
  label,
  color,
  active,
  toggle,
  onPress,
}: Readonly<{
  s: Styles;
  c: Palette;
  label: string;
  color: string;
  active?: boolean;
  /** เป็นปุ่มสองสถานะไหม (มา/กลับ) — ถ้าใช่ประกาศเป็น checkbox ให้ screen reader รู้สถานะ */
  toggle?: boolean;
  onPress: () => void;
}>) {
  return (
    <Pressable
      onPress={onPress}
      style={[s.tiny, { borderColor: color }, active && { backgroundColor: color }]}
      {...(toggle ? a11y('checkbox', { checked: !!active }) : a11y('button'))}
      accessibilityLabel={label}
    >
      <Text style={[s.tinyText, { color: active ? c.onLight : color }]}>{label}</Text>
    </Pressable>
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
  fieldLabel: { color: c.sub, fontSize: 13, fontWeight: '600' },
  inputError: { borderWidth: 1, borderColor: c.danger },
  errorText: { color: c.danger, fontSize: 12 },
  ppLabel: { color: c.sub, fontSize: 12 },
  ppRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  ppInput: {
    backgroundColor: c.cardAlt,
    color: c.text,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
  },
  ppSaveBtn: {
    backgroundColor: c.primary,
    borderRadius: 8,
    paddingHorizontal: 14,
    minHeight: 40,
    justifyContent: 'center',
  },
  ppSaveText: { color: c.onPrimary, fontWeight: '700', fontSize: 14 },
  chips: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: c.cardAlt,
    borderWidth: 1,
    borderColor: c.border,
  },
  chipSmall: { paddingVertical: 5, paddingHorizontal: 10 },
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
  addBtnDisabled: { opacity: 0.4 },
  addBtnText: { color: c.onPrimary, fontWeight: '700', fontSize: 16 },
  empty: { color: c.sub, textAlign: 'center', marginTop: 20 },
  emptyBox: {
    alignItems: 'center',
    gap: 6,
    paddingVertical: 32,
    paddingHorizontal: 24,
  },
  emptyIcon: { fontSize: 44 },
  emptyTitle: { color: c.text, fontSize: 16, fontWeight: '700' },
  emptyDesc: { color: c.sub, fontSize: 13, textAlign: 'center' },
  row: {
    flexDirection: 'row',
    backgroundColor: c.card,
    borderRadius: 14,
    padding: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: c.border,
  },
  name: { color: c.text, fontSize: 17, fontWeight: '700', marginBottom: 6 },
  time: { color: c.sub, fontSize: 12, marginTop: 6 },
  actions: { gap: 6, justifyContent: 'center' },
  tiny: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 9,
    minWidth: 84,
    minHeight: 40,
    justifyContent: 'center',
  },
  tinyText: { fontSize: 12, fontWeight: '700', textAlign: 'center' },
});
