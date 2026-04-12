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
import { GlassBackground } from "@/components/GlassBackground";
import type { Recording, UploadStatus } from "@/lib/types";
import { getApiUrl } from "@/lib/query-client";
import { uploadVideoChunked, validateBeforeUpload, type UploadProgress } from "@/lib/upload-service";

const statusConfig: Record<UploadStatus, { icon: string; label: string; color: string }> = {
  queued: { icon: "time-outline", label: "Queued", color: "#FBBF24" },
  uploading: { icon: "cloud-upload-outline", label: "Uploading...", color: "#60A5FA" },
  uploaded: { icon: "checkmark-circle", label: "Uploaded", color: "#34D399" },
  failed: { icon: "alert-circle-outline", label: "Failed", color: "#F87171" },
  retrying: { icon: "refresh-outline", label: "Retrying...", color: "#FBBF24" },
};

function UploadItem({
  recording, onRetry, onRemove, progress,
}: {
  recording: Recording;
  onRetry: (id: string) => void;
  onRemove: (id: string) => void;
  progress?: UploadProgress;
}) {
  const config = statusConfig[recording.uploadStatus];
  const date = new Date(recording.createdAt);
  const timeStr = `${date.toLocaleDateString()} · ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  const isUploading = recording.uploadStatus === "uploading";
  const uploadPct = progress && progress.totalBytes > 0
    ? Math.round((progress.bytesUploaded / progress.totalBytes) * 100) : 0;

  const qcReport = recording.qcReport;
  const qcColor = !qcReport ? undefined
    : qcReport.qcResult === "passed" ? "#34D399"
    : qcReport.qcResult === "passed_with_warning" ? "#FBBF24" : "#F87171";

  return (
    <View style={styles.card}>
      <LinearGradient
        colors={[config.color + "0D", "transparent"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={StyleSheet.absoluteFillObject}
        pointerEvents="none"
      />
      <View style={[styles.cardAccent, { backgroundColor: config.color }]} />

      <View style={styles.cardInner}>
        <View style={[styles.statusIcon, { backgroundColor: config.color + "18", borderColor: config.color + "35" }]}>
          <Ionicons name={config.icon as any} size={20} color={config.color} />
        </View>

        <View style={styles.info}>
          <Text style={styles.questTitle} numberOfLines={1}>{recording.questTitle}</Text>
          <Text style={styles.meta}>{timeStr}</Text>
          <View style={styles.tags}>
            <View style={[styles.statusBadge, { backgroundColor: config.color + "18", borderColor: config.color + "35" }]}>
              <Text style={[styles.statusText, { color: config.color }]}>
                {isUploading && progress
                  ? `${uploadPct}% · ${progress.chunkIndex}/${progress.totalChunks} chunks`
                  : config.label}
              </Text>
            </View>
            <Text style={styles.fileSize}>{(recording.fileSize / (1024 * 1024)).toFixed(1)} MB</Text>
            {qcColor && qcReport && (
              <View style={[styles.qcBadge, { backgroundColor: qcColor + "18", borderColor: qcColor + "35" }]}>
                <Ionicons name="shield-checkmark-outline" size={10} color={qcColor} />
                <Text style={[styles.qcText, { color: qcColor }]}>{Math.round(qcReport.readinessScore)}</Text>
              </View>
            )}
          </View>
          {isUploading && (
            <View style={styles.progressTrack}>
              <LinearGradient
                colors={["#60A5FA", Colors.primary]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[styles.progressFill, { width: `${uploadPct}%` as any }]}
              />
            </View>
          )}
        </View>

        {(recording.uploadStatus === "failed" || recording.uploadStatus === "queued") && (
          <View style={styles.actions}>
            <Pressable
              style={({ pressed }) => [styles.actionBtn, { backgroundColor: Colors.primary + "18", opacity: pressed ? 0.6 : 1 }]}
              onPress={() => onRetry(recording.id)}
            >
              <Ionicons name="refresh" size={16} color={Colors.primary} />
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.actionBtn, { backgroundColor: "#F8717118", opacity: pressed ? 0.6 : 1 }]}
              onPress={() => onRemove(recording.id)}
            >
              <Ionicons name="trash-outline" size={16} color="#F87171" />
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

export default function UploadsScreen() {
  const { recordings, updateUploadStatus, removeRecording } = useRecordings();
  const { token } = useAuth();
  const insets = useSafeAreaInsets();
  const [progressMap, setProgressMap] = useState<Record<string, UploadProgress>>({});
  const pending = recordings.filter((r) => r.uploadStatus !== "uploaded");

  const handleRetry = useCallback(async (id: string) => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const recording = recordings.find((r) => r.id === id);
    if (!recording || !token) return;
    const sessionFiles = recording.sessionId ? {
      sessionId: recording.sessionId,
      imuPath: recording.imuPath,
      metadataPath: recording.metadataPath,
      qcReportPath: recording.qcReportPath,
      imuSampleCount: recording.imuSampleCount,
    } : undefined;

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
        s3Url = await uploadVideoChunked(recording.uri, recording.questId, recording.id, token,
          (p) => { setProgressMap((prev) => ({ ...prev, [id]: p })); }, sessionFiles);
      }
      const confirmRes = await fetch(new URL(`/api/submissions/${subData.submissionId}/confirm`, baseUrl).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ s3Url }),
      });
      if (!confirmRes.ok) throw new Error("Confirmation failed");
      setProgressMap((prev) => { const n = { ...prev }; delete n[id]; return n; });
      updateUploadStatus(id, "uploaded", subData.submissionId);
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      setProgressMap((prev) => { const n = { ...prev }; delete n[id]; return n; });
      updateUploadStatus(id, "failed");
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }, [recordings, token, updateUploadStatus]);

  const handleRemove = (id: string) => {
    if (Platform.OS === "web") { removeRecording(id); return; }
    Alert.alert("Remove Upload", "Remove from queue?", [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => { removeRecording(id); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } },
    ]);
  };

  const webTopInset = Platform.OS === "web" ? 67 : 0;

  return (
    <View style={styles.container}>
      <GlassBackground variant="uploads" />

      <View style={[styles.header, { paddingTop: insets.top + webTopInset + 16 }]}>
        <View>
          <Text style={styles.label}>Queue</Text>
          <Text style={styles.pageTitle}>Uploads</Text>
        </View>
        {pending.length > 0 && (
          <Pressable
            style={({ pressed }) => [styles.retryAllBtn, { opacity: pressed ? 0.8 : 1 }]}
            onPress={async () => {
              if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              for (const r of pending.filter(r => r.uploadStatus === "queued" || r.uploadStatus === "failed")) {
                await handleRetry(r.id);
              }
            }}
          >
            <LinearGradient
              colors={[Colors.primary + "28", Colors.primary + "10"]}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
            <Ionicons name="refresh" size={14} color={Colors.primary} />
            <Text style={styles.retryAllText}>Retry All</Text>
          </Pressable>
        )}
      </View>

      <FlatList
        data={pending}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <UploadItem recording={item} onRetry={handleRetry} onRemove={handleRemove} progress={progressMap[item.id]} />
        )}
        contentContainerStyle={[
          styles.list,
          { paddingBottom: insets.bottom + 110 + (Platform.OS === "web" ? 34 : 0) },
          pending.length === 0 && styles.emptyList,
        ]}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <View style={styles.emptyIcon}>
              <LinearGradient colors={[Colors.primary + "25", "#3B82F620"]} style={StyleSheet.absoluteFill} pointerEvents="none" />
              <Ionicons name="cloud-done-outline" size={34} color={Colors.primary} />
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
  container: { flex: 1, backgroundColor: "#060410" },
  header: {
    paddingHorizontal: 22,
    paddingBottom: 20,
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    alignItems: "flex-end" as const,
  },
  label: { color: Colors.dark.textTertiary, fontSize: 11, fontFamily: "Inter_500Medium", letterSpacing: 1.2, textTransform: "uppercase" as const, marginBottom: 3 },
  pageTitle: { color: "#FFFFFF", fontSize: 34, fontFamily: "Inter_700Bold", letterSpacing: -1 },
  retryAllBtn: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.primary + "35",
    overflow: "hidden" as const,
    marginBottom: 4,
  },
  retryAllText: { color: Colors.primary, fontSize: 13, fontFamily: "Inter_600SemiBold" },
  list: { paddingHorizontal: 18, paddingTop: 4, gap: 10 },
  emptyList: { flex: 1 },
  card: {
    backgroundColor: "rgba(255,255,255,0.055)",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.11)",
    overflow: "hidden" as const,
    flexDirection: "row" as const,
  },
  cardAccent: { width: 3 },
  cardInner: { flex: 1, flexDirection: "row" as const, alignItems: "center" as const, gap: 12, padding: 14 },
  statusIcon: {
    width: 44,
    height: 44,
    borderRadius: 13,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    borderWidth: 1,
    flexShrink: 0,
  },
  info: { flex: 1, gap: 3 },
  questTitle: { color: "#F1F5F9", fontSize: 15, fontFamily: "Inter_600SemiBold" },
  meta: { color: Colors.dark.textTertiary, fontSize: 11, fontFamily: "Inter_400Regular" },
  tags: { flexDirection: "row" as const, alignItems: "center" as const, gap: 7, marginTop: 2, flexWrap: "wrap" as const },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 7, borderWidth: 1 },
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
  progressTrack: { height: 3, borderRadius: 2, marginTop: 8, overflow: "hidden" as const, backgroundColor: "rgba(255,255,255,0.08)" },
  progressFill: { height: 3, borderRadius: 2 },
  actions: { gap: 8 },
  actionBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  emptyWrap: { flex: 1, alignItems: "center" as const, justifyContent: "center" as const, gap: 14, paddingHorizontal: 40 },
  emptyIcon: {
    width: 80, height: 80, borderRadius: 40,
    alignItems: "center" as const, justifyContent: "center" as const,
    borderWidth: 1, borderColor: Colors.primary + "30",
    overflow: "hidden" as const, marginBottom: 4,
  },
  emptyTitle: { color: "#F1F5F9", fontSize: 18, fontFamily: "Inter_600SemiBold" },
  emptySubtext: { color: Colors.dark.textTertiary, fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" as const, lineHeight: 20 },
});
