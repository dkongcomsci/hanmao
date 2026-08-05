import { useRouter } from "expo-router";
import { useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { confirmAction, friendlyError, notify, Palette } from "../src/ui";
import { useTheme } from "../src/ui/theme";
import { useStore } from "../src/data/store";

export default function Home() {
  const { state, mode, group, remoteEnabled, reset } = useStore();
  const { colors: c } = useTheme();
  const s = useMemo(() => makeStyles(c), [c]);
  const router = useRouter();

  const hasData = state.members.length > 0 || state.bills.length > 0;

  // "เริ่มทำรายการใหม่" = ลบทุกอย่างแล้วเริ่มใหม่เหมือนเข้าครั้งแรก (ลบถาวร)
  const startFresh = () => {
    if (!hasData) return; // ว่างอยู่แล้ว = เหมือนเพิ่งเข้ามา ไม่ต้องทำอะไร
    confirmAction({
      title: "เริ่มทำรายการใหม่",
      message: "ลบสมาชิกและบิลทั้งหมด แล้วเริ่มใหม่เหมือนเพิ่งเข้าใช้ครั้งแรก (ลบถาวร กู้คืนไม่ได้)",
      confirmLabel: "ลบทั้งหมดแล้วเริ่มใหม่",
      onConfirm: () => {
        try {
          reset();
          notify("เริ่มรายการใหม่แล้ว");
        } catch (e) {
          notify("ทำรายการไม่สำเร็จ", friendlyError(e, "ลองใหม่อีกครั้ง"));
        }
      },
    });
  };

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      {/* onboarding: แนะนำ 3 ขั้น */}
      <View style={s.onboard}>
        <Text style={s.onboardTitle}>เริ่มใช้งานใน 3 ขั้น 👋</Text>
        <Step
          s={s}
          n={1}
          title="เพิ่มสมาชิก"
          desc="ใครร่วมกลุ่มบ้าง กินอาหารหรือเครื่องดื่ม"
        />
        <Step
          s={s}
          n={2}
          title="สร้างบิล"
          desc="ใส่เมนู เลือกคนจ่าย และวิธีหาร"
        />
        <Step s={s} n={3} title="ดูสรุป" desc="ใครจ่ายเท่าไร ใครโอนให้ใคร" />
      </View>
      {/* ปุ่มลัดหลัก: ไอคอนสี่เหลี่ยมจัตุรัส 3 ปุ่ม */}
      <View style={s.tiles}>
        <IconTile
          s={s}
          onPress={() => router.push("/members" as never)}
          icon="🧍"
          title="หารคนเดียว"
          accent={c.food}
        />
        <IconTile
          s={s}
          onPress={() => router.push("/group" as never)}
          icon="👥"
          title="หารร่วมกันหลายคน"
          accent={c.drink}
        />
        <IconTile
          s={s}
          onPress={startFresh}
          icon="🧾"
          title="เริ่มทำรายการใหม่"
          accent={c.primary}
        />
      </View>

      {/* แถบกลุ่ม: โชว์ชื่อกลุ่มเมื่ออยู่ในกลุ่มแล้ว (สถานะ + ทางเข้า QR/ลิงก์เชิญ) */}
      {remoteEnabled && mode === "group" && group && (
        <Pressable
          style={s.groupBar}
          onPress={() => router.push("/group" as never)}
          accessibilityRole="button"
          accessibilityLabel={`อยู่ในกลุ่ม ${group.name} แตะเพื่อดูรายละเอียด`}
        >
          <Text style={s.groupIcon}>🟢</Text>
          <View style={{ flex: 1 }}>
            <Text style={s.groupTitle}>{group.name}</Text>
            <Text style={s.groupDesc}>อยู่ในกลุ่ม · แตะเพื่อดู QR/ลิงก์เชิญ</Text>
          </View>
          <Text style={s.chevron}>›</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

type Styles = ReturnType<typeof makeStyles>;

function IconTile({
  s,
  onPress,
  icon,
  title,
  accent,
}: Readonly<{
  s: Styles;
  onPress: () => void;
  icon: string;
  title: string;
  accent: string;
}>) {
  return (
    <Pressable
      style={s.tile}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      <View style={[s.tileIconWrap, { backgroundColor: accent }]}>
        <Text style={s.tileIcon}>{icon}</Text>
      </View>
      <Text style={s.tileTitle}>{title}</Text>
    </Pressable>
  );
}

function Step({
  s,
  n,
  title,
  desc,
}: Readonly<{ s: Styles; n: number; title: string; desc: string }>) {
  return (
    <View style={s.step}>
      <View style={s.stepNum}>
        <Text style={s.stepNumText}>{n}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.stepTitle}>{title}</Text>
        <Text style={s.stepDesc}>{desc}</Text>
      </View>
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    content: { padding: 16, gap: 12 },
    tiles: { flexDirection: "row", gap: 12 },
    tile: {
      flex: 1,
      aspectRatio: 1,
      backgroundColor: c.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.border,
      padding: 12,
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
    },
    tileIconWrap: {
      width: 52,
      height: 52,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
    },
    tileIcon: { fontSize: 28 },
    tileTitle: {
      color: c.text,
      fontSize: 13,
      fontWeight: "700",
      textAlign: "center",
    },
    groupBar: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      backgroundColor: c.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.border,
      padding: 14,
    },
    groupIcon: { fontSize: 22 },
    groupTitle: { color: c.text, fontSize: 16, fontWeight: "700" },
    groupDesc: { color: c.sub, fontSize: 12, marginTop: 2 },
    onboard: {
      backgroundColor: c.card,
      borderRadius: 16,
      padding: 18,
      gap: 14,
      borderWidth: 1,
      borderColor: c.border,
    },
    onboardTitle: { color: c.text, fontSize: 18, fontWeight: "800" },
    step: { flexDirection: "row", gap: 12, alignItems: "center" },
    stepNum: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: c.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    stepNumText: { color: c.onPrimary, fontWeight: "800" },
    stepTitle: { color: c.text, fontSize: 15, fontWeight: "700" },
    stepDesc: { color: c.sub, fontSize: 13 },
    chevron: { color: c.sub, fontSize: 28, paddingRight: 16 },
  });
