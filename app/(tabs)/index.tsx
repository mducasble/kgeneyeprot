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
  easy: { color: Colors.dark.success, label: "Easy" },
  medium: { color: Colors.dark.warning, label: "Med" },
  hard: { color: Colors.dark.error, label: "Hard" },
};

function QuestCard({ quest }: { quest: Quest }) {
  const iconName = categoryIcons[quest.category] || "folder-outline";
  const diff = difficultyConfig[quest.difficulty] ?? { color: Colors.dark.textTertiary, label: quest.difficulty };

  const handlePress = () => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({ pathname: "/quest/[id]", params: { id: quest.id } });
  };

  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        {
          opacity: pressed ? 0.9 : 1,
          transform: [{ scale: pressed ? 0.985 : 1 }],
        },
      ]}
      onPress={handlePress}
    >
      <View style={styles.cardGlow} />

      <View style={styles.cardHeader}>
        <View style={styles.categoryBadge}>
          <Ionicons name={iconName as any} size={14} color={Colors.primary} />
          <Text style={styles.categoryText}>{quest.category}</Text>
        </View>
        <View style={[styles.diffBadge, { backgroundColor: diff.color + "20", borderColor: diff.color + "40" }]}>
          <Text style={[styles.diffText, { color: diff.color }]}>{diff.label}</Text>
        </View>
      </View>

      <Text style={styles.cardTitle} numberOfLines={2}>{quest.title}</Text>
      <Text style={styles.cardDescription} numberOfLines={2}>{quest.description}</Text>

      <View style={styles.cardFooter}>
        <View style={styles.metaItem}>
          <Ionicons name="time-outline" size={13} color={Colors.dark.textTertiary} />
          <Text style={styles.metaText}>{quest.estimatedDuration}</Text>
        </View>
        <View style={styles.metaItem}>
          <Ionicons name="star" size={13} color={Colors.dark.warning} />
          <Text style={[styles.metaText, { color: Colors.dark.warning }]}>{quest.reward} pts</Text>
        </View>
        <View style={styles.arrowBtn}>
          <Ionicons name="arrow-forward" size={16} color={Colors.primary} />
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
      const baseUrl = getApiUrl();
      const res = await fetch(new URL("/api/quests", baseUrl).toString(), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch quests");
      const data = await res.json();
      setQuests(data);
      setError("");
    } catch (err: any) {
      setError(err.message || "Failed to load quests");
    }
  }, [token]);

  useEffect(() => {
    if (token) {
      setLoading(true);
      fetchQuests().finally(() => setLoading(false));
    }
  }, [token]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchQuests();
    setRefreshing(false);
  };

  const webTopInset = Platform.OS === "web" ? 67 : 0;

  if (authLoading || !user) {
    return (
      <LinearGradient colors={["#060812", "#0A1020", "#060812"]} style={styles.centered}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </LinearGradient>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={["#060812", "#090F1E", "#060812"]}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.orb1]} />
      <View style={[styles.orb2]} />

      <View style={[styles.header, { paddingTop: insets.top + webTopInset + 16 }]}>
        <View>
          <Text style={styles.greeting}>Welcome back, {user.username}</Text>
          <Text style={styles.headerTitle}>Quests</Text>
        </View>
        <View style={styles.countBubble}>
          <Text style={styles.countText}>{quests.length}</Text>
        </View>
      </View>

      {loading && !refreshing ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <View style={styles.emptyIconWrap}>
            <Ionicons name="cloud-offline-outline" size={36} color={Colors.dark.textTertiary} />
          </View>
          <Text style={styles.emptyText}>{error}</Text>
          <Pressable
            style={styles.retryBtn}
            onPress={() => { setLoading(true); fetchQuests().finally(() => setLoading(false)); }}
          >
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={quests}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <QuestCard quest={item} />}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 110 + (Platform.OS === "web" ? 34 : 0) }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
          }
          ListEmptyComponent={
            <View style={styles.centered}>
              <View style={styles.emptyIconWrap}>
                <Ionicons name="telescope-outline" size={36} color={Colors.primary} />
              </View>
              <Text style={styles.emptyText}>No quests available</Text>
              <Text style={styles.emptySubtext}>Check back later for new tasks</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#060812" },
  centered: { flex: 1, alignItems: "center" as const, justifyContent: "center" as const, gap: 14, padding: 24 },
  orb1: {
    position: "absolute" as const,
    top: -60,
    right: -80,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: Colors.primary,
    opacity: 0.06,
  },
  orb2: {
    position: "absolute" as const,
    bottom: 200,
    left: -100,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: Colors.accent,
    opacity: 0.05,
  },
  header: {
    paddingHorizontal: 22,
    paddingBottom: 16,
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    alignItems: "flex-end" as const,
  },
  greeting: {
    color: Colors.dark.textTertiary,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    marginBottom: 3,
    letterSpacing: 0.2,
  },
  headerTitle: {
    color: Colors.dark.text,
    fontSize: 30,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
  },
  countBubble: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.glass.card,
    borderWidth: 1,
    borderColor: Colors.primary + "40",
    alignItems: "center" as const,
    justifyContent: "center" as const,
    marginBottom: 4,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
  },
  countText: { color: Colors.primary, fontSize: 16, fontFamily: "Inter_700Bold" },
  list: { paddingHorizontal: 18, paddingTop: 4, gap: 12 },
  card: {
    backgroundColor: Colors.glass.card,
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    overflow: "hidden" as const,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
  },
  cardGlow: {
    position: "absolute" as const,
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: Colors.glass.borderStrong,
    opacity: 0.6,
  },
  cardHeader: {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    alignItems: "center" as const,
    marginBottom: 12,
  },
  categoryBadge: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 5,
    backgroundColor: Colors.primary + "12",
    borderWidth: 1,
    borderColor: Colors.primary + "25",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  categoryText: { color: Colors.primary, fontSize: 12, fontFamily: "Inter_600SemiBold" },
  diffBadge: {
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
  },
  diffText: { fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 0.3 },
  cardTitle: {
    color: Colors.dark.text,
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 6,
    lineHeight: 23,
  },
  cardDescription: {
    color: Colors.dark.textSecondary,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
    marginBottom: 14,
  },
  cardFooter: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 14,
  },
  metaItem: { flexDirection: "row" as const, alignItems: "center" as const, gap: 4 },
  metaText: { color: Colors.dark.textTertiary, fontSize: 13, fontFamily: "Inter_500Medium" },
  arrowBtn: {
    marginLeft: "auto" as any,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: Colors.primary + "15",
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  emptyIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.glass.card,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  emptyText: {
    color: Colors.dark.text,
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    textAlign: "center" as const,
  },
  emptySubtext: {
    color: Colors.dark.textTertiary,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center" as const,
  },
  retryBtn: {
    backgroundColor: Colors.primary + "15",
    borderWidth: 1,
    borderColor: Colors.primary + "30",
    paddingHorizontal: 22,
    paddingVertical: 10,
    borderRadius: 12,
  },
  retryText: { color: Colors.primary, fontSize: 14, fontFamily: "Inter_600SemiBold" },
});
