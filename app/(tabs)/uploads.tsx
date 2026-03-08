import React from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  useColorScheme,
  Platform,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRecordings } from "@/lib/recordings-context";
import { useAuth } from "@/lib/auth-context";
import Colors from "@/constants/colors";
import type { Recording, UploadStatus } from "@/lib/types";
import { getApiUrl } from "@/lib/query-client";
import { fetch } from "expo/fetch";

const statusConfig: Record<UploadStatus, { icon: string; label: string; color: string }> = {
  queued: { icon: "time-outline", label: "Queued", color: "#F59E0B" },
  uploading: { icon: "cloud-upload-outline", label: "Uploading...", color: "#0EA5E9" },
  uploaded: { icon: "checkmark-circle", label: "Uploaded", color: "#22C55E" },
  failed: { icon: "alert-circle-outline", label: "Failed", color: "#EF4444" },
  retrying: { icon: "refresh-outline", label: "Retrying...", color: "#F59E0B" },
};

function UploadItem({
  recording,
  isDark,
  onRetry,
  onRemove,
}: {
  recording: Recording;
  isDark: boolean;
  onRetry: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const c = isDark ? Colors.dark : Colors.light;
  const config = statusConfig[recording.uploadStatus];
  const date = new Date(recording.createdAt);
  const formattedDate = `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;

  return (
    <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
      <View style={styles.cardContent}>
        <View style={[styles.statusIcon, { backgroundColor: config.color + "15" }]}>
          <Ionicons name={config.icon as any} size={22} color={config.color} />
        </View>
        <View style={styles.info}>
          <Text style={[styles.questTitle, { color: c.text }]} numberOfLines={1}>
            {recording.questTitle}
          </Text>
          <Text style={[styles.meta, { color: c.textSecondary }]}>{formattedDate}</Text>
          <View style={styles.statusRow}>
            <View style={[styles.statusBadge, { backgroundColor: config.color + "15" }]}>
              <Text style={[styles.statusText, { color: config.color }]}>{config.label}</Text>
            </View>
            <Text style={[styles.fileSize, { color: c.textTertiary }]}>
              {(recording.fileSize / (1024 * 1024)).toFixed(1)} MB
            </Text>
          </View>
        </View>
      </View>

      {(recording.uploadStatus === "failed" || recording.uploadStatus === "queued") && (
        <View style={styles.actions}>
          <Pressable
            style={({ pressed }) => [styles.actionBtn, { opacity: pressed ? 0.7 : 1 }]}
            onPress={() => onRetry(recording.id)}
          >
            <Ionicons name="refresh" size={20} color={Colors.primary} />
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.actionBtn, { opacity: pressed ? 0.7 : 1 }]}
            onPress={() => onRemove(recording.id)}
          >
            <Ionicons name="trash-outline" size={20} color={c.error} />
          </Pressable>
        </View>
      )}
    </View>
  );
}

export default function UploadsScreen() {
  const { recordings, updateUploadStatus, removeRecording } = useRecordings();
  const { token } = useAuth();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const c = isDark ? Colors.dark : Colors.light;

  const pendingRecordings = recordings.filter(
    (r) => r.uploadStatus !== "uploaded",
  );

  const handleRetry = async (id: string) => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const recording = recordings.find((r) => r.id === id);
    if (!recording || !token) return;

    updateUploadStatus(id, "uploading");

    try {
      const baseUrl = getApiUrl();
      const res = await fetch(new URL("/api/submissions", baseUrl).toString(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ questId: recording.questId, recordingId: recording.id }),
      });

      if (!res.ok) throw new Error("Submission failed");
      const data = await res.json();

      await new Promise((resolve) => setTimeout(resolve, 2000));

      const confirmRes = await fetch(
        new URL(`/api/submissions/${data.submissionId}/confirm`, baseUrl).toString(),
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      if (!confirmRes.ok) throw new Error("Confirmation failed");
      updateUploadStatus(id, "uploaded", data.submissionId);
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      updateUploadStatus(id, "failed");
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  const handleRemove = (id: string) => {
    if (Platform.OS === "web") {
      removeRecording(id);
      return;
    }
    Alert.alert("Remove Upload", "Remove this recording from the queue?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => {
          removeRecording(id);
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        },
      },
    ]);
  };

  const handleRetryAll = async () => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const toRetry = pendingRecordings.filter(
      (r) => r.uploadStatus === "queued" || r.uploadStatus === "failed",
    );
    for (const r of toRetry) {
      await handleRetry(r.id);
    }
  };

  const webTopInset = Platform.OS === "web" ? 67 : 0;

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + webTopInset + 12 }]}>
        <Text style={[styles.headerTitle, { color: c.text }]}>Pending Uploads</Text>
        {pendingRecordings.length > 0 && (
          <Pressable
            style={({ pressed }) => [
              styles.retryAllBtn,
              { backgroundColor: Colors.primary + "15", opacity: pressed ? 0.8 : 1 },
            ]}
            onPress={handleRetryAll}
          >
            <Ionicons name="refresh" size={16} color={Colors.primary} />
            <Text style={[styles.retryAllText, { color: Colors.primary }]}>Retry All</Text>
          </Pressable>
        )}
      </View>

      <FlatList
        data={pendingRecordings}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <UploadItem
            recording={item}
            isDark={isDark}
            onRetry={handleRetry}
            onRemove={handleRemove}
          />
        )}
        contentContainerStyle={[
          styles.list,
          { paddingBottom: insets.bottom + 90 },
          pendingRecordings.length === 0 && styles.emptyList,
        ]}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <View style={[styles.emptyIcon, { backgroundColor: Colors.primary + "10" }]}>
              <Ionicons name="cloud-done-outline" size={40} color={Colors.primary} />
            </View>
            <Text style={[styles.emptyText, { color: c.text }]}>All caught up</Text>
            <Text style={[styles.emptySubtext, { color: c.textSecondary }]}>
              No pending uploads. Record a quest to get started.
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    alignItems: "center" as const,
  },
  headerTitle: { fontSize: 26, fontFamily: "Inter_700Bold" },
  retryAllBtn: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  retryAllText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  list: { paddingHorizontal: 20, gap: 10 },
  emptyList: { flex: 1 },
  card: {
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
  },
  cardContent: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 12,
  },
  statusIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  info: { flex: 1, gap: 2 },
  questTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  meta: { fontSize: 12, fontFamily: "Inter_400Regular" },
  statusRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  statusText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  fileSize: { fontSize: 11, fontFamily: "Inter_400Regular" },
  actions: {
    flexDirection: "row" as const,
    justifyContent: "flex-end" as const,
    gap: 8,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(128,128,128,0.2)",
  },
  actionBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 12,
    paddingHorizontal: 40,
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    marginBottom: 8,
  },
  emptyText: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  emptySubtext: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" as const, lineHeight: 20 },
});
