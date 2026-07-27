import { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Consumes } from '../src/domain/types';
import { colors, confirmRemove, consumesLabel, timeStr } from '../src/ui';
import { useStore } from '../src/data/store';

const OPTIONS: Consumes[] = ['both', 'food', 'drink'];

export default function Members() {
  const { state, addMember, removeMember, updateMember, toggleArrived, toggleLeft } = useStore();
  const [name, setName] = useState('');
  const [consumes, setConsumes] = useState<Consumes>('both');

  const canAdd = name.trim().length > 0;

  const submit = () => {
    if (!canAdd) return;
    addMember(name, consumes);
    setName('');
    setConsumes('both');
  };

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      <View style={s.form}>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="ชื่อสมาชิก"
          placeholderTextColor={colors.sub}
          style={s.input}
          onSubmitEditing={submit}
          returnKeyType="done"
          accessibilityLabel="ชื่อสมาชิก"
          accessibilityHint="พิมพ์ชื่อคนที่จะเพิ่ม แล้วกดปุ่มเพิ่มสมาชิก"
        />
        <Text style={s.fieldLabel}>กินอะไร</Text>
        <View style={s.chips}>
          {OPTIONS.map((o) => (
            <Chip key={o} label={consumesLabel[o]} active={consumes === o} onPress={() => setConsumes(o)} />
          ))}
        </View>
        <Pressable
          style={[s.addBtn, !canAdd && s.addBtnDisabled]}
          onPress={submit}
          disabled={!canAdd}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canAdd }}
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
                  label={consumesLabel[o]}
                  active={m.consumes === o}
                  small
                  onPress={() => updateMember(m.id, { consumes: o })}
                />
              ))}
            </View>
            <Text style={s.time}>
              มา {timeStr(m.arrivedAt)} · กลับ {timeStr(m.leftAt)}
            </Text>
          </View>
          <View style={s.actions}>
            <TinyBtn
              label={m.arrivedAt ? '✓ มาแล้ว' : 'มาถึง'}
              active={!!m.arrivedAt}
              color={colors.good}
              onPress={() => toggleArrived(m.id)}
            />
            <TinyBtn
              label={m.leftAt ? '✓ กลับแล้ว' : 'กลับ'}
              active={!!m.leftAt}
              color={colors.food}
              onPress={() => toggleLeft(m.id)}
            />
            <TinyBtn label="ลบ" color={colors.danger} onPress={() => confirmRemove(m.name, () => removeMember(m.id))} />
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

function Chip({
  label,
  active,
  small,
  onPress,
}: Readonly<{
  label: string;
  active: boolean;
  small?: boolean;
  onPress: () => void;
}>) {
  return (
    <Pressable
      onPress={onPress}
      style={[s.chip, active && s.chipActive, small && s.chipSmall]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
    >
      <Text style={[s.chipText, active && s.chipTextActive, small && { fontSize: 12 }]}>{label}</Text>
    </Pressable>
  );
}

function TinyBtn({
  label,
  color,
  active,
  onPress,
}: Readonly<{
  label: string;
  color: string;
  active?: boolean;
  onPress: () => void;
}>) {
  return (
    <Pressable
      onPress={onPress}
      style={[s.tiny, { borderColor: color }, active && { backgroundColor: color }]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text style={[s.tinyText, { color: active ? '#0b0d10' : color }]}>{label}</Text>
    </Pressable>
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
  fieldLabel: { color: colors.sub, fontSize: 13, fontWeight: '600' },
  chips: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.cardAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipSmall: { paddingVertical: 5, paddingHorizontal: 10 },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.sub, fontSize: 14 },
  chipTextActive: { color: '#fff', fontWeight: '700' },
  addBtn: { backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  addBtnDisabled: { opacity: 0.4 },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  empty: { color: colors.sub, textAlign: 'center', marginTop: 20 },
  emptyBox: {
    alignItems: 'center',
    gap: 6,
    paddingVertical: 32,
    paddingHorizontal: 24,
  },
  emptyIcon: { fontSize: 44 },
  emptyTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  emptyDesc: { color: colors.sub, fontSize: 13, textAlign: 'center' },
  row: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  name: { color: colors.text, fontSize: 17, fontWeight: '700', marginBottom: 6 },
  time: { color: colors.sub, fontSize: 12, marginTop: 6 },
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
