import { Tabs } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ColorValue, Pressable, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Palette } from '../src/ui';
import { useTheme } from '../src/ui/theme';
import { StoreProvider } from '../src/data/store';

/** ไอคอน tab แบบ emoji (ไม่ต้องพึ่ง vector-icons) — เทียบ active/inactive จาก palette ปัจจุบัน */
function TabIcon({ icon, color, sub }: Readonly<{ icon: string; color: ColorValue; sub: string }>) {
  return <Text style={{ fontSize: 22, color, opacity: color === sub ? 0.7 : 1 }}>{icon}</Text>;
}

/** ปุ่มสลับธีมบน header (ขึ้นทุกหน้า) — กดครั้งเดียวสลับ light↔dark */
function ThemeToggle({ c, theme, toggleTheme }: Readonly<{ c: Palette; theme: 'light' | 'dark'; toggleTheme: () => void }>) {
  return (
    <Pressable
      onPress={toggleTheme}
      accessibilityRole="button"
      accessibilityLabel="สลับธีม"
      hitSlop={8}
      style={{
        width: 40,
        height: 40,
        marginRight: 12,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* ไอคอนบอกธีมปัจจุบัน: มืด = 🌙, สว่าง = ☀️ */}
      <Text style={{ fontSize: 20, color: c.text }}>{theme === 'dark' ? '🌙' : '☀️'}</Text>
    </Pressable>
  );
}

/**
 * ต้องอยู่ "ใต้" StoreProvider ถึงจะเรียก useTheme (ห่อ useStore) ได้
 * — เรียกเหนือ provider จะ throw "useStore must be used within StoreProvider"
 */
function Layout() {
  const { colors: c, theme, toggleTheme } = useTheme();
  return (
    <>
      {/* StatusBar ตามธีม: มืด → ตัวอักษรสว่าง, สว่าง → ตัวอักษรเข้ม */}
      <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
      <Tabs
        screenOptions={{
          headerStyle: { backgroundColor: c.card },
          headerTintColor: c.text,
          headerTitleStyle: { fontWeight: '800' },
          headerRight: () => <ThemeToggle c={c} theme={theme} toggleTheme={toggleTheme} />,
          sceneStyle: { backgroundColor: c.bg },
          tabBarStyle: {
            backgroundColor: c.card,
            borderTopColor: c.border,
            height: 68,
            paddingBottom: 8,
            paddingTop: 6,
          },
          tabBarActiveTintColor: c.primary,
          tabBarInactiveTintColor: c.sub,
          tabBarLabelStyle: { fontSize: 12, fontWeight: '700' },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'หารเมา',
            tabBarLabel: 'หน้าแรก',
            tabBarIcon: ({ color }) => <TabIcon icon="🏠" color={color} sub={c.sub} />,
            tabBarAccessibilityLabel: 'หน้าแรก ภาพรวมยอดรวม',
          }}
        />
        <Tabs.Screen
          name="members"
          options={{
            title: 'สมาชิก',
            tabBarLabel: 'สมาชิก',
            tabBarIcon: ({ color }) => <TabIcon icon="👥" color={color} sub={c.sub} />,
            tabBarAccessibilityLabel: 'สมาชิก จัดการรายชื่อคน',
          }}
        />
        <Tabs.Screen
          name="bills"
          options={{
            title: 'บิลทั้งหมด',
            tabBarLabel: 'บิล',
            tabBarIcon: ({ color }) => <TabIcon icon="🧾" color={color} sub={c.sub} />,
            tabBarAccessibilityLabel: 'บิล รายการบิลทั้งหมด',
          }}
        />
        <Tabs.Screen
          name="summary"
          options={{
            title: 'สรุปหารเงิน',
            tabBarLabel: 'สรุป',
            tabBarIcon: ({ color }) => <TabIcon icon="💰" color={color} sub={c.sub} />,
            tabBarAccessibilityLabel: 'สรุปหารเงิน ยอดต่อคนและการโอน',
          }}
        />
        <Tabs.Screen
          name="me"
          options={{
            title: 'สรุปของฉัน',
            tabBarLabel: 'ฉัน',
            tabBarIcon: ({ color }) => <TabIcon icon="🙋" color={color} sub={c.sub} />,
            tabBarAccessibilityLabel: 'ฉัน สรุปเฉพาะของคุณ',
          }}
        />
        {/* หน้ารายละเอียดบิล เข้าจากแท็บบิล ไม่ต้องโชว์เป็น tab */}
        <Tabs.Screen name="bill/[id]" options={{ href: null, title: 'รายละเอียดบิล' }} />
        {/* หน้ากลุ่ม (หลายคน) + เข้าร่วมผ่านลิงก์/QR — เข้าจากหน้าแรก ไม่ต้องโชว์เป็น tab */}
        <Tabs.Screen name="group" options={{ href: null, title: 'กลุ่มหารเงิน' }} />
        <Tabs.Screen name="join/[code]" options={{ href: null, title: 'เข้าร่วมกลุ่ม' }} />
      </Tabs>
    </>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StoreProvider>
        <Layout />
      </StoreProvider>
    </SafeAreaProvider>
  );
}
