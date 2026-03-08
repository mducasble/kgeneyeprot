import { isLiquidGlassAvailable } from "expo-glass-effect";
import { Tabs } from "expo-router";
import { NativeTabs, Icon, Label, Badge } from "expo-router/unstable-native-tabs";
import { BlurView } from "expo-blur";
import { Platform, StyleSheet, useColorScheme, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { useRecordings } from "@/lib/recordings-context";
import Colors from "@/constants/colors";

function NativeTabLayout() {
  const { pendingUploads } = useRecordings();
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="index">
        <Icon sf={{ default: "list.bullet.rectangle", selected: "list.bullet.rectangle.fill" }} />
        <Label>Quests</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="uploads">
        <Icon sf={{ default: "arrow.up.circle", selected: "arrow.up.circle.fill" }} />
        <Label>Uploads</Label>
        {pendingUploads.length > 0 && <Badge>{String(pendingUploads.length)}</Badge>}
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="recordings">
        <Icon sf={{ default: "film", selected: "film.fill" }} />
        <Label>Recordings</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="account">
        <Icon sf={{ default: "person.circle", selected: "person.circle.fill" }} />
        <Label>Account</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

function ClassicTabLayout() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const isWeb = Platform.OS === "web";
  const isIOS = Platform.OS === "ios";
  const { pendingUploads } = useRecordings();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: isDark ? Colors.dark.textTertiary : Colors.light.tabIconDefault,
        tabBarStyle: {
          position: "absolute" as const,
          backgroundColor: isIOS ? "transparent" : isDark ? Colors.dark.background : Colors.light.surface,
          borderTopWidth: isWeb ? 1 : 0,
          borderTopColor: isDark ? Colors.dark.border : Colors.light.border,
          elevation: 0,
          ...(isWeb ? { height: 84 } : {}),
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView intensity={100} tint={isDark ? "dark" : "light"} style={StyleSheet.absoluteFill} />
          ) : isWeb ? (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: isDark ? Colors.dark.background : Colors.light.surface }]} />
          ) : null,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Quests",
          tabBarIcon: ({ color, size }) => <Ionicons name="list" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="uploads"
        options={{
          title: "Uploads",
          tabBarIcon: ({ color, size }) => <Ionicons name="cloud-upload-outline" size={size} color={color} />,
          tabBarBadge: pendingUploads.length > 0 ? pendingUploads.length : undefined,
        }}
      />
      <Tabs.Screen
        name="recordings"
        options={{
          title: "Recordings",
          tabBarIcon: ({ color, size }) => <Ionicons name="videocam-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: "Account",
          tabBarIcon: ({ color, size }) => <Ionicons name="person-outline" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}

export default function TabLayout() {
  if (isLiquidGlassAvailable()) {
    return <NativeTabLayout />;
  }
  return <ClassicTabLayout />;
}
