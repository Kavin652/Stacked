import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

import { colors, fonts } from "@/src/theme";

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.onSurfaceTertiary,
        tabBarStyle: {
          backgroundColor: colors.surfaceSecondary,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: Platform.OS === "ios" ? 88 : 64,
          paddingTop: 8,
        },
        tabBarLabelStyle: { fontFamily: fonts.bodyMedium, fontSize: 11, letterSpacing: 0.5 },
      }}
      screenListeners={{
        tabPress: () => Haptics.selectionAsync(),
      }}
    >
      <Tabs.Screen name="index" options={{
        title: "Home",
        tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? "home" : "home-outline"} size={22} color={color} />,
      }} />
      <Tabs.Screen name="transactions" options={{
        title: "Transactions",
        tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? "swap-horizontal" : "swap-horizontal-outline"} size={22} color={color} />,
      }} />
      <Tabs.Screen name="advisor" options={{
        title: "Advisor",
        tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? "sparkles" : "sparkles-outline"} size={22} color={color} />,
      }} />
      <Tabs.Screen name="investments" options={{
        title: "Invest",
        tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? "trending-up" : "trending-up-outline"} size={22} color={color} />,
      }} />
      <Tabs.Screen name="goals" options={{
        title: "Goals",
        tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? "flag" : "flag-outline"} size={22} color={color} />,
      }} />
    </Tabs>
  );
}
