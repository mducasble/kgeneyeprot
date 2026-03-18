import React from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  useColorScheme,
  Platform,
  Alert,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useAuth } from "@/lib/auth-context";
import { useRecordings } from "@/lib/recordings-context";
import Colors from "@/constants/colors";

function StatCard({
  icon,
  label,
  value,
  color,
  isDark,
}: {
  icon: string;
  label: string;
  value: string;
  color: string;
  isDark: boolean;
}) {
  const c = isDark ? Colors.dark : Colors.light;
  return (
    <View style={[styles.statCard, { backgroundColor: c.card, borderColor: c.border }]}>
      <View style={[styles.statIcon, { backgroundColor: color + "15" }]}>
        <Ionicons name={icon as any} size={20} color={color} />
      </View>
      <Text style={[styles.statValue, { color: c.text }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: c.textSecondary }]}>{label}</Text>
    </View>
  );
}

function MenuItem({
  icon,
  label,
  onPress,
  isDark,
  destructive,
  noBorder,
}: {
  icon: string;
  label: string;
  onPress: () => void;
  isDark: boolean;
  destructive?: boolean;
  noBorder?: boolean;
}) {
  const c = isDark ? Colors.dark : Colors.light;
  const iconColor = destructive ? c.error : c.textSecondary;
  const textColor = destructive ? c.error : c.text;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.menuItem,
        noBorder
          ? { backgroundColor: "transparent", borderWidth: 0 }
          : { backgroundColor: c.card, borderColor: c.border },
        { opacity: pressed ? 0.9 : 1 },
      ]}
      onPress={onPress}
    >
      <View style={styles.menuLeft}>
        <Ionicons name={icon as any} size={22} color={iconColor} />
        <Text style={[styles.menuLabel, { color: textColor }]}>{label}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={c.textTertiary} />
    </Pressable>
  );
}

export default function AccountScreen() {
  const { user, logout } = useAuth();
  const { recordings } = useRecordings();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const c = isDark ? Colors.dark : Colors.light;

  const totalRecordings = recordings.length;
  const uploadedCount = recordings.filter((r) => r.uploadStatus === "uploaded").length;
  const totalSize = recordings.reduce((sum, r) => sum + r.fileSize, 0);

  const handleLogout = () => {
    const doLogout = async () => {
      if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await logout();
      router.push("/(auth)/login");
    };

    if (Platform.OS === "web") {
      doLogout();
      return;
    }
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign Out", style: "destructive", onPress: doLogout },
    ]);
  };

  const webTopInset = Platform.OS === "web" ? 67 : 0;

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + webTopInset + 12 }]}>
        <Text style={[styles.headerTitle, { color: c.text }]}>Account</Text>
      </View>

      <View style={styles.content}>
        <View style={[styles.profileCard, { backgroundColor: c.card, borderColor: c.border }]}>
          <View style={[styles.avatar, { backgroundColor: Colors.primary + "20" }]}>
            <Text style={styles.avatarText}>
              {(user?.username?.[0] || "?").toUpperCase()}
            </Text>
          </View>
          <View style={styles.profileInfo}>
            <Text style={[styles.profileName, { color: c.text }]}>{user?.username || "User"}</Text>
            <Text style={[styles.profileRole, { color: c.textSecondary }]}>Data Collector</Text>
          </View>
        </View>

        <View style={styles.statsRow}>
          <StatCard
            icon="videocam"
            label="Recordings"
            value={String(totalRecordings)}
            color={Colors.primary}
            isDark={isDark}
          />
          <StatCard
            icon="cloud-upload"
            label="Uploaded"
            value={String(uploadedCount)}
            color={Colors.accent}
            isDark={isDark}
          />
          <StatCard
            icon="folder"
            label="Storage"
            value={totalSize > 0 ? `${(totalSize / (1024 * 1024)).toFixed(0)}MB` : "0MB"}
            color="#F59E0B"
            isDark={isDark}
          />
        </View>

        <View style={styles.menuSection}>
          <View style={[styles.devSection, { backgroundColor: "#F59E0B08", borderColor: "#F59E0B30" }]}>
            <View style={styles.devHeader}>
              <Ionicons name="code-slash-outline" size={14} color="#F59E0B" />
              <Text style={styles.devLabel}>Ferramentas de Desenvolvimento</Text>
            </View>
            <MenuItem
              icon="shield-checkmark-outline"
              label="Testar QC com Vídeo"
              onPress={() => {
                if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push("/test-qc");
              }}
              isDark={isDark}
              noBorder
            />
          </View>
          <MenuItem
            icon="log-out-outline"
            label="Sign Out"
            onPress={handleLogout}
            isDark={isDark}
            destructive
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  headerTitle: { fontSize: 26, fontFamily: "Inter_700Bold" },
  content: { flex: 1, paddingHorizontal: 20, gap: 20 },
  profileCard: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    gap: 14,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  avatarText: { fontSize: 24, fontFamily: "Inter_700Bold", color: Colors.primary },
  profileInfo: { gap: 2 },
  profileName: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  profileRole: { fontSize: 13, fontFamily: "Inter_400Regular" },
  statsRow: {
    flexDirection: "row" as const,
    gap: 10,
  },
  statCard: {
    flex: 1,
    alignItems: "center" as const,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    gap: 6,
  },
  statIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  statValue: { fontSize: 20, fontFamily: "Inter_700Bold" },
  statLabel: { fontSize: 11, fontFamily: "Inter_500Medium" },
  menuSection: { gap: 10, marginTop: 4 },
  devSection: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden" as const,
  },
  devHeader: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 6,
  },
  devLabel: { color: "#F59E0B", fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.6 },
  menuItem: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
  },
  menuLeft: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 12,
  },
  menuLabel: { fontSize: 16, fontFamily: "Inter_500Medium" },
});
