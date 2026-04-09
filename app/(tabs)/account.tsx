import React from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Platform,
  Alert,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useAuth } from "@/lib/auth-context";
import { useRecordings } from "@/lib/recordings-context";
import Colors from "@/constants/colors";

function StatCard({ icon, label, value, color }: { icon: string; label: string; value: string; color: string }) {
  return (
    <View style={[statStyles.card]}>
      <LinearGradient
        colors={[color + "18", color + "06"]}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />
      <View style={[statStyles.icon, { backgroundColor: color + "20" }]}>
        <Ionicons name={icon as any} size={18} color={color} />
      </View>
      <Text style={[statStyles.value, { color }]}>{value}</Text>
      <Text style={statStyles.label}>{label}</Text>
    </View>
  );
}

const statStyles = StyleSheet.create({
  card: {
    flex: 1,
    alignItems: "center" as const,
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    gap: 6,
    overflow: "hidden" as const,
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  value: { fontSize: 22, fontFamily: "Inter_700Bold" },
  label: { fontSize: 11, fontFamily: "Inter_500Medium", color: Colors.dark.textTertiary },
});

function MenuItem({ icon, label, onPress, destructive, noBorder }: {
  icon: string; label: string; onPress: () => void; destructive?: boolean; noBorder?: boolean;
}) {
  const color = destructive ? Colors.dark.error : Colors.dark.text;
  const iconColor = destructive ? Colors.dark.error : Colors.dark.textSecondary;

  return (
    <Pressable
      style={({ pressed }) => [
        menuStyles.item,
        noBorder
          ? { backgroundColor: "transparent", borderWidth: 0 }
          : { backgroundColor: Colors.glass.card, borderColor: Colors.glass.border },
        { opacity: pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.99 : 1 }] },
      ]}
      onPress={onPress}
    >
      <View style={menuStyles.left}>
        <View style={[menuStyles.iconWrap, { backgroundColor: iconColor + "15" }]}>
          <Ionicons name={icon as any} size={18} color={iconColor} />
        </View>
        <Text style={[menuStyles.label, { color }]}>{label}</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={Colors.dark.textTertiary} />
    </Pressable>
  );
}

const menuStyles = StyleSheet.create({
  item: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  left: { flexDirection: "row" as const, alignItems: "center" as const, gap: 12 },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  label: { fontSize: 16, fontFamily: "Inter_500Medium" },
});

export default function AccountScreen() {
  const { user, logout } = useAuth();
  const { recordings } = useRecordings();
  const insets = useSafeAreaInsets();

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
  const initial = (user?.username?.[0] || "?").toUpperCase();

  return (
    <View style={styles.container}>
      <LinearGradient colors={["#060812", "#090F1E", "#060812"]} style={StyleSheet.absoluteFill} />
      <View style={styles.orbTop} />
      <View style={styles.orbBottom} />

      <View style={[styles.header, { paddingTop: insets.top + webTopInset + 16 }]}>
        <Text style={styles.headerTitle}>Account</Text>
      </View>

      <View style={styles.content}>
        <View style={styles.profileCard}>
          <LinearGradient
            colors={[Colors.primary + "14", Colors.accent + "08"]}
            style={StyleSheet.absoluteFill}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          />
          <View style={styles.profileCardTopLine} />
          <View style={styles.avatarWrap}>
            <LinearGradient
              colors={[Colors.primary, Colors.accent]}
              style={styles.avatarGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Text style={styles.avatarText}>{initial}</Text>
            </LinearGradient>
            <View style={styles.onlineDot} />
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>{user?.username || "User"}</Text>
            <View style={styles.roleBadge}>
              <Ionicons name="shield-checkmark" size={11} color={Colors.primary} />
              <Text style={styles.roleText}>Data Collector</Text>
            </View>
          </View>
        </View>

        <View style={styles.statsRow}>
          <StatCard icon="videocam" label="Recordings" value={String(totalRecordings)} color={Colors.primary} />
          <StatCard icon="cloud-upload" label="Uploaded" value={String(uploadedCount)} color={Colors.accent} />
          <StatCard
            icon="folder"
            label="Storage"
            value={totalSize > 0 ? `${(totalSize / (1024 * 1024)).toFixed(0)}MB` : "0MB"}
            color={Colors.dark.warning}
          />
        </View>

        <View style={styles.menuSection}>
          <View style={styles.devSection}>
            <LinearGradient
              colors={[Colors.dark.warning + "08", "transparent"]}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.devHeader}>
              <Ionicons name="code-slash-outline" size={13} color={Colors.dark.warning} />
              <Text style={styles.devLabel}>Dev Tools</Text>
            </View>
            <MenuItem
              icon="shield-checkmark-outline"
              label="Test QC Pipeline"
              onPress={() => {
                if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push("/test-qc");
              }}
              noBorder
            />
          </View>

          <MenuItem
            icon="log-out-outline"
            label="Sign Out"
            onPress={handleLogout}
            destructive
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#060812" },
  orbTop: {
    position: "absolute" as const,
    top: -80,
    left: -80,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: Colors.primary,
    opacity: 0.06,
  },
  orbBottom: {
    position: "absolute" as const,
    bottom: 100,
    right: -100,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: Colors.accent,
    opacity: 0.05,
  },
  header: {
    paddingHorizontal: 22,
    paddingBottom: 16,
  },
  headerTitle: { color: Colors.dark.text, fontSize: 30, fontFamily: "Inter_700Bold", letterSpacing: -0.5 },
  content: { flex: 1, paddingHorizontal: 18, gap: 14 },
  profileCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    padding: 18,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 16,
    overflow: "hidden" as const,
  },
  profileCardTopLine: {
    position: "absolute" as const,
    top: 0,
    left: 20,
    right: 20,
    height: 1,
    backgroundColor: Colors.glass.borderStrong,
    opacity: 0.6,
  },
  avatarWrap: { position: "relative" as const },
  avatarGradient: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  avatarText: { fontSize: 26, fontFamily: "Inter_700Bold", color: "#fff" },
  onlineDot: {
    position: "absolute" as const,
    bottom: 2,
    right: 2,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.dark.success,
    borderWidth: 2,
    borderColor: "#060812",
  },
  profileInfo: { gap: 6 },
  profileName: { color: Colors.dark.text, fontSize: 20, fontFamily: "Inter_700Bold" },
  roleBadge: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 5,
    backgroundColor: Colors.primary + "12",
    borderWidth: 1,
    borderColor: Colors.primary + "25",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    alignSelf: "flex-start" as const,
  },
  roleText: { color: Colors.primary, fontSize: 12, fontFamily: "Inter_600SemiBold" },
  statsRow: { flexDirection: "row" as const, gap: 10 },
  menuSection: { gap: 10, marginTop: 4 },
  devSection: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.dark.warning + "25",
    overflow: "hidden" as const,
  },
  devHeader: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 6,
  },
  devLabel: { color: Colors.dark.warning, fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 0.8, textTransform: "uppercase" as const },
});
