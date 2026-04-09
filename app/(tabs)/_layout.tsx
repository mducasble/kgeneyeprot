import { isLiquidGlassAvailable } from "expo-glass-effect";
import { Tabs } from "expo-router";
import { NativeTabs, Icon, Label, Badge } from "expo-router/unstable-native-tabs";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { Platform, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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

type TabIconName =
  | "list"
  | "list-outline"
  | "cloud-upload"
  | "cloud-upload-outline"
  | "videocam"
  | "videocam-outline"
  | "person"
  | "person-outline";

function FloatingTabIcon({
  focused,
  activeIcon,
  inactiveIcon,
  badge,
}: {
  focused: boolean;
  activeIcon: TabIconName;
  inactiveIcon: TabIconName;
  badge?: number;
}) {
  return (
    <View style={tabIconStyles.wrapper}>
      {focused && (
        <View style={tabIconStyles.glow} />
      )}
      <View style={[tabIconStyles.iconContainer, focused && tabIconStyles.iconContainerActive]}>
        <Ionicons
          name={focused ? activeIcon : inactiveIcon}
          size={22}
          color={focused ? Colors.primary : Colors.dark.textTertiary}
        />
      </View>
      {badge !== undefined && badge > 0 && (
        <View style={tabIconStyles.badge}>
        </View>
      )}
    </View>
  );
}

const tabIconStyles = StyleSheet.create({
  wrapper: {
    alignItems: "center" as const,
    justifyContent: "center" as const,
    width: 52,
    height: 52,
  },
  glow: {
    position: "absolute" as const,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.primary,
    opacity: 0.12,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  iconContainerActive: {
    backgroundColor: Colors.primary + "18",
    borderWidth: 1,
    borderColor: Colors.primary + "30",
  },
  badge: {
    position: "absolute" as const,
    top: 8,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.dark.error,
    borderWidth: 1.5,
    borderColor: "#060812",
  },
});

function FloatingTabBar() {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { pendingUploads } = useRecordings();

  const tabBottom = isWeb ? 34 : insets.bottom + 12;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarItemStyle: {
          flex: 1,
          height: 68,
          paddingTop: 0,
          paddingBottom: 0,
          alignItems: "center" as const,
          justifyContent: "center" as const,
        },
        tabBarStyle: {
          position: "absolute" as const,
          bottom: tabBottom,
          left: 40,
          right: 40,
          height: 68,
          borderRadius: 34,
          backgroundColor: "transparent",
          borderTopWidth: 0,
          elevation: 0,
          shadowColor: Colors.primary,
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.25,
          shadowRadius: 32,
          overflow: "hidden" as const,
        },
        tabBarBackground: () => (
          <View style={styles.tabBarBackground}>
            {isWeb ? (
              <View style={[StyleSheet.absoluteFill, styles.webBackground]} />
            ) : (
              <BlurView
                intensity={60}
                tint="dark"
                style={[StyleSheet.absoluteFill, styles.blurFill]}
              />
            )}
            <LinearGradient
              colors={[
                "rgba(255,255,255,0.12)",
                "rgba(255,255,255,0.04)",
              ]}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={styles.gradientBorder}
              pointerEvents="none"
            />
          </View>
        ),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          tabBarIcon: ({ focused }) => (
            <FloatingTabIcon
              focused={focused}
              activeIcon="list"
              inactiveIcon="list-outline"
            />
          ),
        }}
      />
      <Tabs.Screen
        name="uploads"
        options={{
          tabBarIcon: ({ focused }) => (
            <FloatingTabIcon
              focused={focused}
              activeIcon="cloud-upload"
              inactiveIcon="cloud-upload-outline"
              badge={pendingUploads.length}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="recordings"
        options={{
          tabBarIcon: ({ focused }) => (
            <FloatingTabIcon
              focused={focused}
              activeIcon="videocam"
              inactiveIcon="videocam-outline"
            />
          ),
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          tabBarIcon: ({ focused }) => (
            <FloatingTabIcon
              focused={focused}
              activeIcon="person"
              inactiveIcon="person-outline"
            />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBarBackground: {
    flex: 1,
    borderRadius: 34,
    overflow: "hidden" as const,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  blurFill: {
    borderRadius: 34,
  },
  webBackground: {
    backgroundColor: "rgba(6,8,18,0.85)",
    borderRadius: 34,
  },
  gradientBorder: {
    position: "absolute" as const,
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    borderRadius: 1,
  },
});

export default function TabLayout() {
  if (isLiquidGlassAvailable()) {
    return <NativeTabLayout />;
  }
  return <FloatingTabBar />;
}
