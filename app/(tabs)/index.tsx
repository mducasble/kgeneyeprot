import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  useColorScheme,
  Platform,
  RefreshControl,
} from "react-native";
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

const difficultyColors: Record<string, string> = {
  easy: "#22C55E",
  medium: "#F59E0B",
  hard: "#EF4444",
};

function QuestCard({ quest, isDark }: { quest: Quest; isDark: boolean }) {
  const c = isDark ? Colors.dark : Colors.light;
  const iconName = categoryIcons[quest.category] || "folder-outline";

  const handlePress = () => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({ pathname: "/quest/[id]", params: { id: quest.id } });
  };

  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: c.card,
          borderColor: c.border,
          opacity: pressed ? 0.95 : 1,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        },
      ]}
      onPress={handlePress}
    >
      <View style={styles.cardHeader}>
        <View style={[styles.categoryBadge, { backgroundColor: Colors.primary + "15" }]}>
          <Ionicons name={iconName as any} size={16} color={Colors.primary} />
          <Text style={[styles.categoryText, { color: Colors.primary }]}>{quest.category}</Text>
        </View>
        <View style={[styles.difficultyDot, { backgroundColor: difficultyColors[quest.difficulty] }]} />
      </View>

      <Text style={[styles.cardTitle, { color: c.text }]} numberOfLines={2}>
        {quest.title}
      </Text>
      <Text style={[styles.cardDescription, { color: c.textSecondary }]} numberOfLines={2}>
        {quest.description}
      </Text>

      <View style={styles.cardFooter}>
        <View style={styles.metaItem}>
          <Ionicons name="time-outline" size={14} color={c.textTertiary} />
          <Text style={[styles.metaText, { color: c.textTertiary }]}>{quest.estimatedDuration}</Text>
        </View>
        <View style={styles.metaItem}>
          <Ionicons name="star-outline" size={14} color={Colors.primary} />
          <Text style={[styles.metaText, { color: Colors.primary }]}>{quest.reward} pts</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={c.textTertiary} />
      </View>
    </Pressable>
  );
}

export default function QuestsScreen() {
  const { user, token, isLoading: authLoading } = useAuth();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const c = isDark ? Colors.dark : Colors.light;

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

  if (authLoading || !user) {
    return (
      <View style={[styles.centered, { backgroundColor: c.background }]}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  const webTopInset = Platform.OS === "web" ? 67 : 0;

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + webTopInset + 12 }]}>
        <View>
          <Text style={[styles.greeting, { color: c.textSecondary }]}>
            Hello, {user.username}
          </Text>
          <Text style={[styles.headerTitle, { color: c.text }]}>Available Quests</Text>
        </View>
        <View style={[styles.questCount, { backgroundColor: Colors.primary + "15" }]}>
          <Text style={[styles.questCountText, { color: Colors.primary }]}>{quests.length}</Text>
        </View>
      </View>

      {loading && !refreshing ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Ionicons name="cloud-offline-outline" size={48} color={c.textTertiary} />
          <Text style={[styles.emptyText, { color: c.textSecondary }]}>{error}</Text>
          <Pressable
            style={[styles.retryButton, { backgroundColor: Colors.primary + "15" }]}
            onPress={() => { setLoading(true); fetchQuests().finally(() => setLoading(false)); }}
          >
            <Text style={[styles.retryText, { color: Colors.primary }]}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={quests}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <QuestCard quest={item} isDark={isDark} />}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 90 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
          }
          ListEmptyComponent={
            <View style={styles.centered}>
              <Ionicons name="telescope-outline" size={48} color={c.textTertiary} />
              <Text style={[styles.emptyText, { color: c.textSecondary }]}>No quests available</Text>
              <Text style={[styles.emptySubtext, { color: c.textTertiary }]}>
                Check back later for new data collection tasks
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: "center" as const, justifyContent: "center" as const, gap: 12, padding: 24 },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    alignItems: "flex-end" as const,
  },
  greeting: { fontSize: 14, fontFamily: "Inter_400Regular", marginBottom: 2 },
  headerTitle: { fontSize: 26, fontFamily: "Inter_700Bold" },
  questCount: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    marginBottom: 4,
  },
  questCountText: { fontSize: 16, fontFamily: "Inter_700Bold" },
  list: { paddingHorizontal: 20, gap: 12 },
  card: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
  },
  cardHeader: {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    alignItems: "center" as const,
    marginBottom: 10,
  },
  categoryBadge: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  categoryText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  difficultyDot: { width: 8, height: 8, borderRadius: 4 },
  cardTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold", marginBottom: 4 },
  cardDescription: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20, marginBottom: 12 },
  cardFooter: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 16,
  },
  metaItem: { flexDirection: "row" as const, alignItems: "center" as const, gap: 4 },
  metaText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  emptyText: { fontSize: 16, fontFamily: "Inter_600SemiBold", textAlign: "center" as const },
  emptySubtext: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" as const },
  retryButton: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, marginTop: 4 },
  retryText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
});
