import { Tabs } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ColorValue, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { colors } from '../src/ui';
import { StoreProvider } from '../src/data/store';

/** ไอคอน tab แบบ emoji (ไม่ต้องพึ่ง vector-icons) */
function TabIcon({ icon, color }: Readonly<{ icon: string; color: ColorValue }>) {
  return <Text style={{ fontSize: 22, color, opacity: color === colors.sub ? 0.7 : 1 }}>{icon}</Text>;
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StoreProvider>
        <StatusBar style="light" />
        <Tabs
          screenOptions={{
            headerStyle: { backgroundColor: colors.card },
            headerTintColor: colors.text,
            headerTitleStyle: { fontWeight: '800' },
            sceneStyle: { backgroundColor: colors.bg },
            tabBarStyle: {
              backgroundColor: colors.card,
              borderTopColor: colors.border,
              height: 62,
              paddingBottom: 8,
              paddingTop: 6,
            },
            tabBarActiveTintColor: colors.primary,
            tabBarInactiveTintColor: colors.sub,
            tabBarLabelStyle: { fontSize: 12, fontWeight: '700' },
          }}
        >
          <Tabs.Screen
            name="index"
            options={{
              title: 'หารเมา',
              tabBarLabel: 'หน้าแรก',
              tabBarIcon: ({ color }) => <TabIcon icon="🏠" color={color} />,
              tabBarAccessibilityLabel: 'หน้าแรก ภาพรวมยอดรวม',
            }}
          />
          <Tabs.Screen
            name="members"
            options={{
              title: 'สมาชิก',
              tabBarLabel: 'สมาชิก',
              tabBarIcon: ({ color }) => <TabIcon icon="👥" color={color} />,
              tabBarAccessibilityLabel: 'สมาชิก จัดการรายชื่อคน',
            }}
          />
          <Tabs.Screen
            name="bills"
            options={{
              title: 'บิลทั้งหมด',
              tabBarLabel: 'บิล',
              tabBarIcon: ({ color }) => <TabIcon icon="🧾" color={color} />,
              tabBarAccessibilityLabel: 'บิล รายการบิลทั้งหมด',
            }}
          />
          <Tabs.Screen
            name="summary"
            options={{
              title: 'สรุปหารเงิน',
              tabBarLabel: 'สรุป',
              tabBarIcon: ({ color }) => <TabIcon icon="💰" color={color} />,
              tabBarAccessibilityLabel: 'สรุปหารเงิน ยอดต่อคนและการโอน',
            }}
          />
          <Tabs.Screen
            name="me"
            options={{
              title: 'สรุปของฉัน',
              tabBarLabel: 'ฉัน',
              tabBarIcon: ({ color }) => <TabIcon icon="🙋" color={color} />,
              tabBarAccessibilityLabel: 'ฉัน สรุปเฉพาะของคุณ',
            }}
          />
          {/* หน้ารายละเอียดบิล เข้าจากแท็บบิล ไม่ต้องโชว์เป็น tab */}
          <Tabs.Screen name="bill/[id]" options={{ href: null, title: 'รายละเอียดบิล' }} />
          {/* หน้าวง (หลายคน) + เข้าร่วมผ่านลิงก์/QR — เข้าจากหน้าแรก ไม่ต้องโชว์เป็น tab */}
          <Tabs.Screen name="group" options={{ href: null, title: 'วงหารเงิน' }} />
          <Tabs.Screen name="join/[code]" options={{ href: null, title: 'เข้าร่วมวง' }} />
        </Tabs>
      </StoreProvider>
    </SafeAreaProvider>
  );
}
