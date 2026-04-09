import React from "react";
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
import Colors from "@/constants/colors";
import type { Recording, UploadStatus } from "@/lib/types";
import type { QCResult } from "@/lib/qc-types";

const statusConfig: Record<UploadStatus, { icon: string; label: string; color: string }> = {
  queued: { icon: "time-outline", label: "Queued", color: Colors.dark.warning },
  uploading: { icon: "cloud-upload-outline", label: "Uploading", color: Colors.dark.info },
  uploaded: { icon: "checkmark-circle", label: "Uploaded", color: Colors.dark.success },
  failed: { icon: "alert-circle-outline", label: "Failed", color: Colors.dark.error },
  retrying: { icon: "refresh-outline", label: "Retrying", color: Colors.dark.warning },
};

const qcResultConfig: Record<QCResult, { label: string; color: string; icon: string }> = {
  passed: { label: "QC", color: Colors.dark.success, icon: "checkmark-circle" },
  passed_with_warning: { label: "QC", color: Colors.dark.warning, icon: "alert-circle" },
  blocked: { label: "QC", color: Colors.dark.error, icon: "close-circle" },
};

function QCBadge({ result, score }: { result: QCResult; score: number }) {
  const cfg = qcResultConfig[result];
  return (
    <View style={[qcStyles.badge, { backgroundColor: cfg.color + "15", borderColor: cfg.color + "30" }]}>
      <Ionicons name={cfg.icon as any} size={11} color={cfg.color} />
      <Text style={[qcStyles.text, { color: cfg.color }]}>{Math.round(score)}</Text>
    </View>
  );
}

const qcStyles = StyleSheet.create({
  badge: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  text: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
});

function RecordingItem({
  recording,
  onDelete,
}: {
  recording: Recording;
  onDelete: (id: string) => void;
}) {
  const config = statusConfig[recording.uploadStatus];
  const date = new Date(recording.createdAt);
  const formattedDate = `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <View style={styles.card}>
      <View style={styles.cardTopLine} />
      <View style={styles.cardRow}>
        <View style={styles.thumbnail}>
          <LinearGradient
            colors={[Colors.primary + "30", Colors.accent + "20"]}
            style={StyleSheet.absoluteFill}
          />
          <Ionicons name="videocam" size={22} color={Colors.primary} />
        </View>
        <View style={styles.info}>
          <Text style={styles.title} numberOfLines={1}>{recording.questTitle}</Text>
          <Text style={styles.meta}>{formattedDate}</Text>
          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Ionicons name="time-outline" size={11} color={Colors.dark.textTertiary} />
              <Text style={styles.statText}>{formatDuration(recording.duration)}</Text>
            </View>
            <View style={styles.stat}>
              <Ionicons name="document-outline" size={11} color={Colors.dark.textTertiary} />
              <Text style={styles.statText}>{(recording.fileSize / (1024 * 1024)).toFixed(1)} MB</Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: config.color + "15", borderColor: config.color + "30" }]}>
              <Ionicons name={config.icon as any} size={11} color={config.color} />
              <Text style={[styles.statusText, { color: config.color }]}>{config.label}</Text>
            </View>
            {recording.qcReport && (
              <QCBadge result={recording.qcReport.qcResult} score={recording.qcReport.readinessScore} />
            )}
          </View>
        </View>
      </View>
      <Pressable
        style={({ pressed }) => [styles.deleteBtn, { opacity: pressed ? 0.5 : 1 }]}
        onPress={() => onDelete(recording.id)}
      >
        <Ionicons name="trash-outline" size={17} color={Colors.dark.error} />
      </Pressable>
    </View>
  );
}

export default function RecordingsScreen() {
  const { recordings, removeRecording } = useRecordings();
  const insets = useSafeAreaInsets();

  const handleDelete = (id: string) => {
    if (Platform.OS === "web") {
      removeRecording(id);
      return;
    }
    Alert.alert("Delete Recording", "This will permanently delete the recording.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          removeRecording(id);
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        },
      },
    ]);
  };

  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const uploadedCount = recordings.filter((r) => r.uploadStatus === "uploaded").length;
  const passedQC = recordings.filter((r) => r.qcReport?.qcResult === "passed").length;
  const hasQC = recordings.some((r) => r.qcReport);

  return (
    <View style={styles.container}>
      <LinearGradient colors={["#060812", "#090F1E", "#060812"]} style={StyleSheet.absoluteFill} />
      <View style={styles.orb} />

      <View style={[styles.header, { paddingTop: insets.top + webTopInset + 16 }]}>
        <View>
          <Text style={styles.headerLabel}>Library</Text>
          <Text style={styles.headerTitle}>Recordings</Text>
        </View>
        {recordings.length > 0 && (
          <View style={styles.headerStats}>
            <View style={styles.statPill}>
              <Ionicons name="cloud-done-outline" size={13} color={Colors.dark.success} />
              <Text style={[styles.statPillText, { color: Colors.dark.success }]}>
                {uploadedCount}/{recordings.length}
              </Text>
            </View>
            {hasQC && (
              <View style={styles.statPill}>
                <Ionicons name="shield-checkmark-outline" size={13} color={Colors.primary} />
                <Text style={[styles.statPillText, { color: Colors.primary }]}>{passedQC} passed</Text>
              </View>
            )}
          </View>
        )}
      </View>

      <FlatList
        data={recordings}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <RecordingItem recording={item} onDelete={handleDelete} />
        )}
        contentContainerStyle={[
          styles.list,
          { paddingBottom: insets.bottom + 90 },
          recordings.length === 0 && styles.emptyList,
        ]}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconWrap}>
              <LinearGradient
                colors={[Colors.primary + "20", Colors.accent + "10"]}
                style={StyleSheet.absoluteFill}
              />
              <Ionicons name="film-outline" size={36} color={Colors.primary} />
            </View>
            <Text style={styles.emptyTitle}>No recordings yet</Text>
            <Text style={styles.emptySubtext}>Complete a quest to create your first recording</Text>
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
    top: 60,
    right: -120,
    width: 280,
    height: 280,
    borderRadius: 140,
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
  headerLabel: {
    color: Colors.dark.textTertiary,
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    letterSpacing: 1,
    textTransform: "uppercase" as const,
    marginBottom: 3,
  },
  headerTitle: {
    color: Colors.dark.text,
    fontSize: 30,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
  },
  headerStats: { alignItems: "flex-end" as const, gap: 6, marginBottom: 4 },
  statPill: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 5,
    backgroundColor: Colors.glass.card,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  statPillText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  list: { paddingHorizontal: 18, paddingTop: 4, gap: 10 },
  emptyList: { flex: 1 },
  card: {
    backgroundColor: Colors.glass.card,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    flexDirection: "row" as const,
    alignItems: "center" as const,
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
  cardRow: {
    flex: 1,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 12,
  },
  thumbnail: {
    width: 50,
    height: 50,
    borderRadius: 14,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    overflow: "hidden" as const,
    borderWidth: 1,
    borderColor: Colors.primary + "30",
  },
  info: { flex: 1, gap: 2 },
  title: { color: Colors.dark.text, fontSize: 15, fontFamily: "Inter_600SemiBold" },
  meta: { color: Colors.dark.textTertiary, fontSize: 11, fontFamily: "Inter_400Regular" },
  statsRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    marginTop: 4,
    flexWrap: "wrap" as const,
  },
  stat: { flexDirection: "row" as const, alignItems: "center" as const, gap: 3 },
  statText: { color: Colors.dark.textTertiary, fontSize: 11, fontFamily: "Inter_400Regular" },
  statusBadge: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  statusText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  deleteBtn: {
    width: 36,
    height: 36,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    borderRadius: 10,
    backgroundColor: Colors.dark.error + "10",
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
