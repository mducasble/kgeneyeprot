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
import { GlassBackground } from "@/components/GlassBackground";

function StatCard({ icon, value, label, color }: { icon: string; value: string; label: string; color: string }) {
  return (
    <View style={statStyles.card}>
      <LinearGradient
        colors={[color + "20", color + "05"]}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />
      <View style={[statStyles.iconWrap, { backgroundColor: color + "22" }]}>
        <Ionicons name={icon as any} size={17} color={color} />
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
    borderColor: "rgba(255,255,255,0.10)",
    gap: 7,
    overflow: "hidden" as const,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  value: { fontSize: 22, fontFamily: "Inter_700Bold" },
  label: { fontSize: 11, fontFamily: "Inter_500Medium", color: Colors.dark.textTertiary, textAlign: "center" as const },
});

export default function AccountScreen() {
  const { user, logout } = useAuth();
  const { recordings } = useRecordings();
  const insets = useSafeAreaInsets();

  const total = recordings.length;
  const uploaded = recordings.filter((r) => r.uploadStatus === "uploaded").length;
  const size = recordings.reduce((s, r) => s + r.fileSize, 0);
  const initial = (user?.username?.[0] || "?").toUpperCase();
  const webTopInset = Platform.OS === "web" ? 67 : 0;

  const handleLogout = () => {
    const doLogout = async () => {
      if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await logout();
      router.push("/(auth)/login");
    };
    if (Platform.OS === "web") { doLogout(); return; }
    Alert.alert("Sign Out", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign Out", style: "destructive", onPress: doLogout },
    ]);
  };

  return (
    <View style={styles.container}>
      <GlassBackground variant="account" />

      <View style={[styles.header, { paddingTop: insets.top + webTopInset + 16 }]}>
        <Text style={styles.pageTitle}>Account</Text>
      </View>

      <View style={styles.content}>
        <View style={styles.profileCard}>
          <LinearGradient
            colors={[Colors.primary + "18", "#7C3AED12", "transparent"]}
            style={StyleSheet.absoluteFill}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          />
          <View style={styles.topShimmer} />

          <LinearGradient
            colors={[Colors.primary, "#7C3AED"]}
            style={styles.avatar}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <Text style={styles.avatarText}>{initial}</Text>
          </LinearGradient>

          <View style={styles.userInfo}>
            <Text style={styles.username}>{user?.username || "User"}</Text>
            <View style={styles.roleBadge}>
              <LinearGradient
                colors={[Colors.primary + "22", Colors.primary + "08"]}
                style={StyleSheet.absoluteFill}
              />
              <Ionicons name="shield-checkmark" size={11} color={Colors.primary} />
              <Text style={styles.roleText}>Data Collector</Text>
            </View>
          </View>

          <View style={styles.onlineBadge}>
            <View style={styles.onlineDot} />
            <Text style={styles.onlineText}>Active</Text>
          </View>
        </View>

        <View style={styles.statsRow}>
          <StatCard icon="videocam" value={String(total)} label="Recordings" color={Colors.primary} />
          <StatCard icon="cloud-upload" value={String(uploaded)} label="Uploaded" color="#818CF8" />
          <StatCard
            icon="folder"
            value={size > 0 ? `${(size / (1024 * 1024)).toFixed(0)}MB` : "0MB"}
            label="Storage"
            color="#FBBF24"
          />
        </View>

        <View style={styles.devCard}>
          <LinearGradient
            colors={["#FBBF2410", "transparent"]}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.devHeader}>
            <Ionicons name="code-slash-outline" size={12} color="#FBBF24" />
            <Text style={styles.devLabel}>Dev Tools</Text>
          </View>
          <Pressable
            style={({ pressed }) => [styles.menuItem, { opacity: pressed ? 0.8 : 1 }]}
            onPress={() => {
              if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push("/test-qc");
            }}
          >
            <View style={[styles.menuIcon, { backgroundColor: "#FBBF2415" }]}>
              <Ionicons name="shield-checkmark-outline" size={16} color="#FBBF24" />
            </View>
            <Text style={styles.menuLabel}>Test QC Pipeline</Text>
            <Ionicons name="chevron-forward" size={14} color={Colors.dark.textTertiary} />
          </Pressable>
        </View>

        <Pressable
          style={({ pressed }) => [styles.signOutBtn, { opacity: pressed ? 0.8 : 1, transform: [{ scale: pressed ? 0.99 : 1 }] }]}
          onPress={handleLogout}
        >
          <LinearGradient
            colors={["#F8717118", "#F8717108"]}
            style={StyleSheet.absoluteFill}
          />
          <View style={[styles.menuIcon, { backgroundColor: "#F8717118" }]}>
            <Ionicons name="log-out-outline" size={16} color="#F87171" />
          </View>
          <Text style={styles.signOutText}>Sign Out</Text>
          <Ionicons name="chevron-forward" size={14} color={Colors.dark.textTertiary} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#060410" },
  header: { paddingHorizontal: 22, paddingBottom: 20 },
  pageTitle: { color: "#FFFFFF", fontSize: 34, fontFamily: "Inter_700Bold", letterSpacing: -1 },
  content: { flex: 1, paddingHorizontal: 18, gap: 12 },
  profileCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    padding: 20,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 16,
    overflow: "hidden" as const,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  topShimmer: {
    position: "absolute" as const,
    top: 0,
    left: 20,
    right: 20,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    flexShrink: 0,
  },
  avatarText: { color: "#fff", fontSize: 26, fontFamily: "Inter_700Bold" },
  userInfo: { flex: 1, gap: 8 },
  username: { color: "#F1F5F9", fontSize: 20, fontFamily: "Inter_700Bold" },
  roleBadge: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 5,
    borderWidth: 1,
    borderColor: Colors.primary + "28",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 9,
    alignSelf: "flex-start" as const,
    overflow: "hidden" as const,
  },
  roleText: { color: Colors.primary, fontSize: 11, fontFamily: "Inter_600SemiBold" },
  onlineBadge: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 5,
    backgroundColor: "#34D39915",
    borderWidth: 1,
    borderColor: "#34D39930",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  onlineDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#34D399" },
  onlineText: { color: "#34D399", fontSize: 11, fontFamily: "Inter_600SemiBold" },
  statsRow: { flexDirection: "row" as const, gap: 10 },
  devCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#FBBF2425",
    overflow: "hidden" as const,
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  devHeader: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 6,
  },
  devLabel: { color: "#FBBF24", fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 1, textTransform: "uppercase" as const },
  menuItem: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 12,
    padding: 14,
  },
  menuIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  menuLabel: { flex: 1, color: "#F1F5F9", fontSize: 15, fontFamily: "Inter_500Medium" },
  signOutBtn: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 12,
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#F8717125",
    overflow: "hidden" as const,
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  signOutText: { flex: 1, color: "#F87171", fontSize: 15, fontFamily: "Inter_600SemiBold" },
});
