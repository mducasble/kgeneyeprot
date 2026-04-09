import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Platform,
  RefreshControl,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useAuth } from "@/lib/auth-context";
import { getApiUrl } from "@/lib/query-client";
import { fetch } from "expo/fetch";
import Colors from "@/constants/colors";
import { GlassBackground } from "@/components/GlassBackground";
import type { Quest } from "@/lib/types";

const categoryIcons: Record<string, string> = {
  "Daily Life": "sunny-outline",
  Cooking: "restaurant-outline",
  Navigation: "navigate-outline",
  Work: "briefcase-outline",
  Transportation: "bus-outline",
  Shopping: "cart-outline",
};

const difficultyConfig: Record<string, { color: string; label: string }> = {
  easy: { color: "#34D399", label: "Easy" },
  medium: { color: "#FBBF24", label: "Mid" },
  hard: { color: "#F87171", label: "Hard" },
};

function QuestCard({ quest }: { quest: Quest }) {
  const iconName = categoryIcons[quest.category] || "folder-outline";
  const diff = difficultyConfig[quest.difficulty] ?? { color: Colors.dark.textTertiary, label: quest.difficulty };

  const handlePress = () => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push({ pathname: "/quest/[id]", params: { id: quest.id } });
  };

  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        { opacity: pressed ? 0.88 : 1, transform: [{ scale: pressed ? 0.982 : 1 }] },
      ]}
      onPress={handlePress}
    >
      <View style={[styles.cardAccent, { backgroundColor: diff.color }]} />

      <View style={styles.cardInner}>
        <View style={styles.cardHeader}>
          <View style={styles.categoryBadge}>
            <Ionicons name={iconName as any} size={13} color={Colors.primary} />
            <Text style={styles.categoryText}>{quest.category}</Text>
          </View>
          <View style={[styles.diffDot, { backgroundColor: diff.color }]}>
            <Text style={styles.diffText}>{diff.label}</Text>
          </View>
        </View>

        <Text style={styles.cardTitle} numberOfLines={2}>{quest.title}</Text>
        <Text style={styles.cardDesc} numberOfLines={2}>{quest.description}</Text>

        <View style={styles.cardFooter}>
          <View style={styles.metaItem}>
            <Ionicons name="time-outline" size={12} color={Colors.dark.textTertiary} />
            <Text style={styles.metaText}>{quest.estimatedDuration}</Text>
          </View>
          <View style={[styles.pointsBadge]}>
            <Ionicons name="star" size={11} color="#FBBF24" />
            <Text style={styles.pointsText}>{quest.reward} pts</Text>
          </View>
          <View style={styles.arrowWrap}>
            <Ionicons name="arrow-forward" size={15} color={Colors.primary} />
          </View>
        </View>
      </View>
    </Pressable>
  );
}

export default function QuestsScreen() {
  const { user, token, isLoading: authLoading } = useAuth();
  const insets = useSafeAreaInsets();

  const [quests, setQuests] = useState<Quest[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const fetchQuests = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(new URL("/api/quests", getApiUrl()).toString(), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch quests");
      setQuests(await res.json());
      setError("");
    } catch (err: any) {
      setError(err.message || "Failed to load quests");
    }
  }, [token]);

  useEffect(() => {
    if (token) { setLoading(true); fetchQuests().finally(() => setLoading(false)); }
  }, [token]);

  const webTopInset = Platform.OS === "web" ? 67 : 0;

  if (authLoading || !user) {
    return (
      <View style={styles.container}>
        <GlassBackground variant="quests" />
        <View style={styles.centered}><ActivityIndicator size="large" color={Colors.primary} /></View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <GlassBackground variant="quests" />

      <View style={[styles.header, { paddingTop: insets.top + webTopInset + 16 }]}>
        <View>
          <Text style={styles.greeting}>Hey, {user.username}</Text>
          <View style={styles.titleRow}>
            <Text style={styles.headerTitle}>Quests</Text>
            <View style={styles.countPill}>
              <Text style={styles.countText}>{quests.length}</Text>
            </View>
          </View>
        </View>
      </View>

      {loading && !refreshing ? (
        <View style={styles.centered}><ActivityIndicator size="large" color={Colors.primary} /></View>
      ) : error ? (
        <View style={styles.centered}>
          <View style={styles.emptyIconWrap}>
            <Ionicons name="cloud-offline-outline" size={32} color={Colors.dark.textTertiary} />
          </View>
          <Text style={styles.emptyTitle}>{error}</Text>
          <Pressable style={styles.retryBtn} onPress={() => { setLoading(true); fetchQuests().finally(() => setLoading(false)); }}>
            <Text style={styles.retryText}>Try Again</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={quests}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <QuestCard quest={item} />}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 110 + (Platform.OS === "web" ? 34 : 0) }]}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await fetchQuests(); setRefreshing(false); }} tintColor={Colors.primary} />}
          ListEmptyComponent={
            <View style={styles.centered}>
              <View style={styles.emptyIconWrap}>
                <Ionicons name="telescope-outline" size={32} color={Colors.primary} />
              </View>
              <Text style={styles.emptyTitle}>No quests available</Text>
              <Text style={styles.emptySubtext}>Check back later</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#060410" },
  centered: { flex: 1, alignItems: "center" as const, justifyContent: "center" as const, gap: 16, padding: 24 },
  header: { paddingHorizontal: 22, paddingBottom: 20 },
  greeting: { color: Colors.dark.textTertiary, fontSize: 13, fontFamily: "Inter_400Regular", letterSpacing: 0.3, marginBottom: 4 },
  titleRow: { flexDirection: "row" as const, alignItems: "center" as const, gap: 12 },
  headerTitle: { color: "#FFFFFF", fontSize: 34, fontFamily: "Inter_700Bold", letterSpacing: -1 },
  countPill: {
    backgroundColor: Colors.primary + "20",
    borderWidth: 1,
    borderColor: Colors.primary + "40",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    marginBottom: 2,
  },
  countText: { color: Colors.primary, fontSize: 14, fontFamily: "Inter_700Bold" },
  list: { paddingHorizontal: 18, paddingTop: 4, gap: 10 },
  card: {
    backgroundColor: "rgba(255,255,255,0.055)",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    overflow: "hidden" as const,
    flexDirection: "row" as const,
  },
  cardAccent: {
    width: 3,
    borderTopLeftRadius: 20,
    borderBottomLeftRadius: 20,
  },
  cardInner: { flex: 1, padding: 16 },
  cardHeader: {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    alignItems: "center" as const,
    marginBottom: 10,
  },
  categoryBadge: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 5,
    backgroundColor: Colors.primary + "12",
    borderWidth: 1,
    borderColor: Colors.primary + "28",
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 9,
  },
  categoryText: { color: Colors.primary, fontSize: 11, fontFamily: "Inter_600SemiBold" },
  diffDot: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    opacity: 0.9,
  },
  diffText: { color: "#000", fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 0.2 },
  cardTitle: { color: "#F1F5F9", fontSize: 17, fontFamily: "Inter_600SemiBold", marginBottom: 5, lineHeight: 22 },
  cardDesc: { color: Colors.dark.textSecondary, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18, marginBottom: 14 },
  cardFooter: { flexDirection: "row" as const, alignItems: "center" as const, gap: 12 },
  metaItem: { flexDirection: "row" as const, alignItems: "center" as const, gap: 4 },
  metaText: { color: Colors.dark.textTertiary, fontSize: 12, fontFamily: "Inter_500Medium" },
  pointsBadge: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 4,
    backgroundColor: "#FBBF2415",
    borderWidth: 1,
    borderColor: "#FBBF2430",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  pointsText: { color: "#FBBF24", fontSize: 12, fontFamily: "Inter_600SemiBold" },
  arrowWrap: {
    marginLeft: "auto" as any,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.primary + "18",
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  emptyIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  emptyTitle: { color: Colors.dark.text, fontSize: 16, fontFamily: "Inter_600SemiBold", textAlign: "center" as const },
  emptySubtext: { color: Colors.dark.textTertiary, fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" as const },
  retryBtn: {
    backgroundColor: Colors.primary + "18",
    borderWidth: 1,
    borderColor: Colors.primary + "35",
    paddingHorizontal: 24,
    paddingVertical: 11,
    borderRadius: 14,
  },
  retryText: { color: Colors.primary, fontSize: 14, fontFamily: "Inter_600SemiBold" },
});
