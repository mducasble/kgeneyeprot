import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  Platform,
  Alert,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRecordings } from "@/lib/recordings-context";
import { useAuth } from "@/lib/auth-context";
import Colors from "@/constants/colors";
import type { Recording, UploadStatus } from "@/lib/types";
import { getApiUrl } from "@/lib/query-client";
import { uploadVideoChunked, validateBeforeUpload, type UploadProgress } from "@/lib/upload-service";

const statusConfig: Record<UploadStatus, { icon: string; label: string; color: string }> = {
  queued: { icon: "time-outline", label: "Queued", color: Colors.dark.warning },
  uploading: { icon: "cloud-upload-outline", label: "Uploading...", color: Colors.dark.info },
  uploaded: { icon: "checkmark-circle", label: "Uploaded", color: Colors.dark.success },
  failed: { icon: "alert-circle-outline", label: "Failed", color: Colors.dark.error },
  retrying: { icon: "refresh-outline", label: "Retrying...", color: Colors.dark.warning },
};

function UploadItem({
  recording,
  onRetry,
  onRemove,
  progress,
}: {
  recording: Recording;
  onRetry: (id: string) => void;
  onRemove: (id: string) => void;
  progress?: UploadProgress;
}) {
  const config = statusConfig[recording.uploadStatus];
  const date = new Date(recording.createdAt);
  const formattedDate = `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;

  const qcReport = recording.qcReport;
  const qcColor = !qcReport
    ? Colors.dark.textTertiary
    : qcReport.qcResult === "passed"
    ? Colors.dark.success
    : qcReport.qcResult === "passed_with_warning"
    ? Colors.dark.warning
    : Colors.dark.error;

  const isUploading = recording.uploadStatus === "uploading";
  const uploadPct =
    progress && progress.totalBytes > 0
      ? Math.round((progress.bytesUploaded / progress.totalBytes) * 100)
      : 0;

  return (
    <View style={styles.card}>
      <View style={styles.cardTopLine} />
      <View style={styles.cardContent}>
        <View style={[styles.statusIcon, { backgroundColor: config.color + "18", borderColor: config.color + "30" }]}>
          <Ionicons name={config.icon as any} size={22} color={config.color} />
        </View>
        <View style={styles.info}>
          <Text style={styles.questTitle} numberOfLines={1}>{recording.questTitle}</Text>
          <Text style={styles.meta}>{formattedDate}</Text>
          <View style={styles.statusRow}>
            <View style={[styles.statusBadge, { backgroundColor: config.color + "15", borderColor: config.color + "30" }]}>
              <Text style={[styles.statusText, { color: config.color }]}>
                {isUploading && progress
                  ? `${uploadPct}%  (${progress.chunkIndex}/${progress.totalChunks})`
                  : config.label}
              </Text>
            </View>
            <Text style={styles.fileSize}>
              {(recording.fileSize / (1024 * 1024)).toFixed(1)} MB
            </Text>
            {qcReport && (
              <View style={[styles.qcBadge, { backgroundColor: qcColor + "15", borderColor: qcColor + "30" }]}>
                <Ionicons name="shield-checkmark-outline" size={11} color={qcColor} />
                <Text style={[styles.qcText, { color: qcColor }]}>{Math.round(qcReport.readinessScore)}</Text>
              </View>
            )}
          </View>
          {isUploading && (
            <View style={styles.progressTrack}>
              <LinearGradient
                colors={[Colors.dark.info, Colors.primary]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[styles.progressFill, { width: `${uploadPct}%` as any }]}
              />
            </View>
          )}
        </View>
      </View>

      {(recording.uploadStatus === "failed" || recording.uploadStatus === "queued") && (
        <View style={styles.actions}>
          <Pressable
            style={({ pressed }) => [styles.actionBtn, { backgroundColor: Colors.primary + "15", opacity: pressed ? 0.7 : 1 }]}
            onPress={() => onRetry(recording.id)}
          >
            <Ionicons name="refresh" size={18} color={Colors.primary} />
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.actionBtn, { backgroundColor: Colors.dark.error + "15", opacity: pressed ? 0.7 : 1 }]}
            onPress={() => onRemove(recording.id)}
          >
            <Ionicons name="trash-outline" size={18} color={Colors.dark.error} />
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

  const [progressMap, setProgressMap] = useState<Record<string, UploadProgress>>({});

  const pendingRecordings = recordings.filter((r) => r.uploadStatus !== "uploaded");

  const handleRetry = useCallback(async (id: string) => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const recording = recordings.find((r) => r.id === id);
    if (!recording || !token) return;

    const sessionFiles = recording.sessionId
      ? {
          sessionId: recording.sessionId,
          imuPath: recording.imuPath,
          metadataPath: recording.metadataPath,
          qcReportPath: recording.qcReportPath,
          imuSampleCount: recording.imuSampleCount,
        }
      : undefined;

    const validation = await validateBeforeUpload(recording.uri, sessionFiles);
    if (!validation.valid) {
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Upload Blocked", `Cannot upload: ${validation.errors.join(", ")}`, [{ text: "OK" }]);
      return;
    }

    updateUploadStatus(id, "uploading");

    try {
      const baseUrl = getApiUrl();

      const subRes = await fetch(new URL("/api/submissions", baseUrl).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ questId: recording.questId, recordingId: recording.id }),
      });
      if (!subRes.ok) throw new Error("Submission creation failed");
      const subData = await subRes.json();

      let s3Url: string | undefined;

      if (recording.uri && !recording.uri.startsWith("simulated://")) {
        s3Url = await uploadVideoChunked(
          recording.uri,
          recording.questId,
          recording.id,
          token,
          (p) => { setProgressMap((prev) => ({ ...prev, [id]: p })); },
          sessionFiles,
        );
      }

      const confirmRes = await fetch(
        new URL(`/api/submissions/${subData.submissionId}/confirm`, baseUrl).toString(),
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ s3Url }),
        },
      );
      if (!confirmRes.ok) throw new Error("Confirmation failed");

      setProgressMap((prev) => { const next = { ...prev }; delete next[id]; return next; });
      updateUploadStatus(id, "uploaded", subData.submissionId);
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      setProgressMap((prev) => { const next = { ...prev }; delete next[id]; return next; });
      updateUploadStatus(id, "failed");
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }, [recordings, token, updateUploadStatus]);

  const handleRemove = (id: string) => {
    if (Platform.OS === "web") { removeRecording(id); return; }
    Alert.alert("Remove Upload", "Remove this recording from the queue?", [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => { removeRecording(id); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } },
    ]);
  };

  const handleRetryAll = async () => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const toRetry = pendingRecordings.filter((r) => r.uploadStatus === "queued" || r.uploadStatus === "failed");
    for (const r of toRetry) await handleRetry(r.id);
  };

  const webTopInset = Platform.OS === "web" ? 67 : 0;

  return (
    <View style={styles.container}>
      <LinearGradient colors={["#060812", "#090F1E", "#060812"]} style={StyleSheet.absoluteFill} />
      <View style={styles.orb} />

      <View style={[styles.header, { paddingTop: insets.top + webTopInset + 16 }]}>
        <View>
          <Text style={styles.headerLabel}>Queue</Text>
          <Text style={styles.headerTitle}>Uploads</Text>
        </View>
        {pendingRecordings.length > 0 && (
          <Pressable
            style={({ pressed }) => [styles.retryAllBtn, { opacity: pressed ? 0.8 : 1 }]}
            onPress={handleRetryAll}
          >
            <LinearGradient
              colors={[Colors.primary + "25", Colors.primary + "10"]}
              style={StyleSheet.absoluteFill}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            />
            <Ionicons name="refresh" size={15} color={Colors.primary} />
            <Text style={styles.retryAllText}>Retry All</Text>
          </Pressable>
        )}
      </View>

      <FlatList
        data={pendingRecordings}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <UploadItem
            recording={item}
            onRetry={handleRetry}
            onRemove={handleRemove}
            progress={progressMap[item.id]}
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
            <View style={styles.emptyIconWrap}>
              <LinearGradient
                colors={[Colors.primary + "20", Colors.accent + "10"]}
                style={StyleSheet.absoluteFill}
              />
              <Ionicons name="cloud-done-outline" size={36} color={Colors.primary} />
            </View>
            <Text style={styles.emptyTitle}>All caught up</Text>
            <Text style={styles.emptySubtext}>No pending uploads. Record a quest to get started.</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#060812" },
  orb: {
    position: "absolute" as const,
    top: 40,
    left: -100,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: Colors.dark.info,
    opacity: 0.05,
  },
  header: {
    paddingHorizontal: 22,
    paddingBottom: 16,
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    alignItems: "flex-end" as const,
  },
  headerLabel: {
    color: Colors.dark.textTertiary,
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    letterSpacing: 1,
    textTransform: "uppercase" as const,
    marginBottom: 3,
  },
  headerTitle: { color: Colors.dark.text, fontSize: 30, fontFamily: "Inter_700Bold", letterSpacing: -0.5 },
  retryAllBtn: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.primary + "30",
    overflow: "hidden" as const,
    marginBottom: 4,
  },
  retryAllText: { color: Colors.primary, fontSize: 13, fontFamily: "Inter_600SemiBold" },
  list: { paddingHorizontal: 18, paddingTop: 4, gap: 10 },
  emptyList: { flex: 1 },
  card: {
    backgroundColor: Colors.glass.card,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    overflow: "hidden" as const,
  },
  cardTopLine: {
    position: "absolute" as const,
    top: 0,
    left: 20,
    right: 20,
    height: 1,
    backgroundColor: Colors.glass.borderStrong,
    opacity: 0.5,
  },
  cardContent: {
    flexDirection: "row" as const,
    alignItems: "flex-start" as const,
    gap: 12,
  },
  statusIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    borderWidth: 1,
  },
  info: { flex: 1, gap: 3 },
  questTitle: { color: Colors.dark.text, fontSize: 15, fontFamily: "Inter_600SemiBold" },
  meta: { color: Colors.dark.textTertiary, fontSize: 11, fontFamily: "Inter_400Regular" },
  statusRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 7,
    marginTop: 2,
    flexWrap: "wrap" as const,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 7,
    borderWidth: 1,
  },
  statusText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  fileSize: { color: Colors.dark.textTertiary, fontSize: 11, fontFamily: "Inter_400Regular" },
  qcBadge: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  qcText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    marginTop: 10,
    overflow: "hidden" as const,
    backgroundColor: Colors.glass.border,
  },
  progressFill: {
    height: 4,
    borderRadius: 2,
  },
  actions: {
    flexDirection: "row" as const,
    justifyContent: "flex-end" as const,
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.glass.border,
  },
  actionBtn: {
    width: 40,
    height: 40,
    borderRadius: 11,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 14,
    paddingHorizontal: 40,
  },
  emptyIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    borderWidth: 1,
    borderColor: Colors.primary + "30",
    overflow: "hidden" as const,
    marginBottom: 4,
  },
  emptyTitle: { color: Colors.dark.text, fontSize: 18, fontFamily: "Inter_600SemiBold" },
  emptySubtext: {
    color: Colors.dark.textTertiary,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center" as const,
    lineHeight: 20,
  },
});
