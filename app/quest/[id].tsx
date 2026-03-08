import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  useColorScheme,
  Platform,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useAuth } from "@/lib/auth-context";
import { getApiUrl } from "@/lib/query-client";
import { fetch } from "expo/fetch";
import Colors from "@/constants/colors";
import type { Quest } from "@/lib/types";

const difficultyConfig: Record<string, { label: string; color: string }> = {
  easy: { label: "Easy", color: "#22C55E" },
  medium: { label: "Medium", color: "#F59E0B" },
  hard: { label: "Hard", color: "#EF4444" },
};

export default function QuestDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { token } = useAuth();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const c = isDark ? Colors.dark : Colors.light;

  const [quest, setQuest] = useState<Quest | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const baseUrl = getApiUrl();
        const res = await fetch(new URL(`/api/quests/${id}`, baseUrl).toString(), {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) setQuest(await res.json());
      } catch {}
      setLoading(false);
    })();
  }, [id, token]);

  const handleStartRecording = () => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push({ pathname: "/record/[questId]", params: { questId: id!, questTitle: quest?.title || "" } });
  };

  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const diff = quest ? difficultyConfig[quest.difficulty] : null;

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: c.background }]}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (!quest) {
    return (
      <View style={[styles.centered, { backgroundColor: c.background }]}>
        <Ionicons name="alert-circle-outline" size={48} color={c.textTertiary} />
        <Text style={[styles.errorText, { color: c.textSecondary }]}>Quest not found</Text>
        <Pressable onPress={() => router.back()}>
          <Text style={[styles.link, { color: Colors.primary }]}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <View style={[styles.topBar, { paddingTop: insets.top + webTopInset + 8 }]}>
        <Pressable
          style={({ pressed }) => [styles.backBtn, { backgroundColor: c.card, opacity: pressed ? 0.8 : 1 }]}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={22} color={c.text} />
        </Pressable>
        <Text style={[styles.topBarTitle, { color: c.text }]} numberOfLines={1}>Quest Details</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.heroCard, { backgroundColor: c.card, borderColor: c.border }]}>
          <View style={styles.heroHeader}>
            <View style={[styles.categoryBadge, { backgroundColor: Colors.primary + "15" }]}>
              <Text style={[styles.categoryText, { color: Colors.primary }]}>{quest.category}</Text>
            </View>
            {diff && (
              <View style={[styles.diffBadge, { backgroundColor: diff.color + "15" }]}>
                <View style={[styles.diffDot, { backgroundColor: diff.color }]} />
                <Text style={[styles.diffText, { color: diff.color }]}>{diff.label}</Text>
              </View>
            )}
          </View>
          <Text style={[styles.questTitle, { color: c.text }]}>{quest.title}</Text>
          <Text style={[styles.questDescription, { color: c.textSecondary }]}>{quest.description}</Text>

          <View style={styles.metaRow}>
            <View style={[styles.metaCard, { backgroundColor: c.surfaceElevated }]}>
              <Ionicons name="time-outline" size={18} color={Colors.accent} />
              <Text style={[styles.metaValue, { color: c.text }]}>{quest.estimatedDuration}</Text>
              <Text style={[styles.metaLabel, { color: c.textTertiary }]}>Duration</Text>
            </View>
            <View style={[styles.metaCard, { backgroundColor: c.surfaceElevated }]}>
              <Ionicons name="star-outline" size={18} color={Colors.primary} />
              <Text style={[styles.metaValue, { color: c.text }]}>{quest.reward}</Text>
              <Text style={[styles.metaLabel, { color: c.textTertiary }]}>Points</Text>
            </View>
          </View>
        </View>

        <View style={[styles.section, { backgroundColor: c.card, borderColor: c.border }]}>
          <View style={styles.sectionHeader}>
            <Ionicons name="list" size={20} color={Colors.primary} />
            <Text style={[styles.sectionTitle, { color: c.text }]}>Instructions</Text>
          </View>
          {quest.instructions.map((instruction, index) => (
            <View key={index} style={styles.instructionItem}>
              <View style={[styles.stepNumber, { backgroundColor: Colors.primary + "15" }]}>
                <Text style={[styles.stepNumberText, { color: Colors.primary }]}>{index + 1}</Text>
              </View>
              <Text style={[styles.instructionText, { color: c.textSecondary }]}>{instruction}</Text>
            </View>
          ))}
        </View>
      </ScrollView>

      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 16, backgroundColor: c.background }]}>
        <Pressable
          style={({ pressed }) => [
            styles.recordButton,
            { backgroundColor: Colors.primary, opacity: pressed ? 0.9 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] },
          ]}
          onPress={handleStartRecording}
        >
          <Ionicons name="videocam" size={22} color="#fff" />
          <Text style={styles.recordButtonText}>Start Recording</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: "center" as const, justifyContent: "center" as const, gap: 12 },
  topBar: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  topBarTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  scrollContent: { paddingHorizontal: 20, gap: 14 },
  heroCard: { borderRadius: 18, padding: 20, borderWidth: 1 },
  heroHeader: {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    marginBottom: 14,
  },
  categoryBadge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 8,
  },
  categoryText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  diffBadge: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  diffDot: { width: 6, height: 6, borderRadius: 3 },
  diffText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  questTitle: { fontSize: 22, fontFamily: "Inter_700Bold", marginBottom: 8 },
  questDescription: { fontSize: 15, fontFamily: "Inter_400Regular", lineHeight: 22 },
  metaRow: {
    flexDirection: "row" as const,
    gap: 10,
    marginTop: 16,
  },
  metaCard: {
    flex: 1,
    alignItems: "center" as const,
    padding: 14,
    borderRadius: 12,
    gap: 4,
  },
  metaValue: { fontSize: 18, fontFamily: "Inter_700Bold" },
  metaLabel: { fontSize: 11, fontFamily: "Inter_400Regular" },
  section: { borderRadius: 18, padding: 20, borderWidth: 1 },
  sectionHeader: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
    marginBottom: 16,
  },
  sectionTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  instructionItem: {
    flexDirection: "row" as const,
    alignItems: "flex-start" as const,
    gap: 12,
    marginBottom: 12,
  },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    marginTop: 1,
  },
  stepNumberText: { fontSize: 13, fontFamily: "Inter_700Bold" },
  instructionText: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20 },
  bottomBar: {
    position: "absolute" as const,
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  recordButton: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 10,
    height: 56,
    borderRadius: 16,
  },
  recordButtonText: { color: "#fff", fontSize: 17, fontFamily: "Inter_600SemiBold" },
  errorText: { fontSize: 16, fontFamily: "Inter_500Medium" },
  link: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
});
