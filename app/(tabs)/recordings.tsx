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
import Colors from "@/constants/colors";
import type { Recording, UploadStatus } from "@/lib/types";
import type { QCResult } from "@/lib/qc-types";

const statusConfig: Record<UploadStatus, { icon: string; label: string; color: string }> = {
  queued: { icon: "time-outline", label: "Queued", color: "#F59E0B" },
  uploading: { icon: "cloud-upload-outline", label: "Uploading", color: "#0EA5E9" },
  uploaded: { icon: "checkmark-circle", label: "Uploaded", color: "#22C55E" },
  failed: { icon: "alert-circle-outline", label: "Failed", color: "#EF4444" },
  retrying: { icon: "refresh-outline", label: "Retrying", color: "#F59E0B" },
};

const qcResultConfig: Record<QCResult, { label: string; color: string; icon: string }> = {
  passed: { label: "QC Passed", color: Colors.dark.success, icon: "checkmark-circle" },
  passed_with_warning: { label: "QC Warning", color: Colors.dark.warning, icon: "alert-circle" },
  blocked: { label: "QC Blocked", color: Colors.dark.error, icon: "close-circle" },
};

function QCBadge({ result, score }: { result: QCResult; score: number }) {
  const cfg = qcResultConfig[result];
  return (
    <View style={[qcStyles.badge, { backgroundColor: cfg.color + "15" }]}>
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
  },
  text: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
});

function RecordingItem({
  recording,
  isDark,
  onDelete,
}: {
  recording: Recording;
  isDark: boolean;
  onDelete: (id: string) => void;
}) {
  const c = isDark ? Colors.dark : Colors.light;
  const config = statusConfig[recording.uploadStatus];
  const date = new Date(recording.createdAt);
  const formattedDate = `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
      <View style={styles.cardRow}>
        <View style={[styles.thumbnail, { backgroundColor: c.surfaceElevated }]}>
          <Ionicons name="videocam" size={24} color={Colors.primary} />
        </View>
        <View style={styles.info}>
          <Text style={[styles.title, { color: c.text }]} numberOfLines={1}>
            {recording.questTitle}
          </Text>
          <Text style={[styles.meta, { color: c.textSecondary }]}>{formattedDate}</Text>
          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Ionicons name="time-outline" size={12} color={c.textTertiary} />
              <Text style={[styles.statText, { color: c.textTertiary }]}>
                {formatDuration(recording.duration)}
              </Text>
            </View>
            <View style={styles.stat}>
              <Ionicons name="document-outline" size={12} color={c.textTertiary} />
              <Text style={[styles.statText, { color: c.textTertiary }]}>
                {(recording.fileSize / (1024 * 1024)).toFixed(1)} MB
              </Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: config.color + "15" }]}>
              <Ionicons name={config.icon as any} size={12} color={config.color} />
              <Text style={[styles.statusText, { color: config.color }]}>{config.label}</Text>
            </View>
            {recording.qcReport && (
              <QCBadge
                result={recording.qcReport.qcResult}
                score={recording.qcReport.readinessScore}
              />
            )}
          </View>
        </View>
      </View>
      <Pressable
        style={({ pressed }) => [styles.deleteBtn, { opacity: pressed ? 0.6 : 1 }]}
        onPress={() => onDelete(recording.id)}
      >
        <Ionicons name="trash-outline" size={18} color={c.error} />
      </Pressable>
    </View>
  );
}

export default function RecordingsScreen() {
  const { recordings, removeRecording } = useRecordings();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const c = isDark ? Colors.dark : Colors.light;

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
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + webTopInset + 12 }]}>
        <Text style={[styles.headerTitle, { color: c.text }]}>Recordings</Text>
        {recordings.length > 0 && (
          <View style={styles.headerMeta}>
            <Text style={[styles.headerSubtitle, { color: c.textSecondary }]}>
              {uploadedCount}/{recordings.length} uploaded
            </Text>
            {hasQC && (
              <View style={[styles.qcSummary, { backgroundColor: Colors.primary + "12" }]}>
                <Ionicons name="shield-checkmark-outline" size={12} color={Colors.primary} />
                <Text style={[styles.qcSummaryText, { color: Colors.primary }]}>
                  {passedQC} QC passed
                </Text>
              </View>
            )}
          </View>
        )}
      </View>

      <FlatList
        data={recordings}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <RecordingItem recording={item} isDark={isDark} onDelete={handleDelete} />
        )}
        contentContainerStyle={[
          styles.list,
          { paddingBottom: insets.bottom + 90 },
          recordings.length === 0 && styles.emptyList,
        ]}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <View style={[styles.emptyIcon, { backgroundColor: Colors.primary + "10" }]}>
              <Ionicons name="film-outline" size={40} color={Colors.primary} />
            </View>
            <Text style={[styles.emptyText, { color: c.text }]}>No recordings yet</Text>
            <Text style={[styles.emptySubtext, { color: c.textSecondary }]}>
              Complete a quest to create your first recording
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
    alignItems: "flex-end" as const,
  },
  headerTitle: { fontSize: 26, fontFamily: "Inter_700Bold" },
  headerMeta: { alignItems: "flex-end" as const, gap: 4 },
  headerSubtitle: { fontSize: 13, fontFamily: "Inter_500Medium" },
  qcSummary: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  qcSummaryText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  list: { paddingHorizontal: 20, gap: 10 },
  emptyList: { flex: 1 },
  card: {
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    flexDirection: "row" as const,
    alignItems: "center" as const,
  },
  cardRow: {
    flex: 1,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 12,
  },
  thumbnail: {
    width: 52,
    height: 52,
    borderRadius: 12,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  info: { flex: 1, gap: 2 },
  title: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  meta: { fontSize: 12, fontFamily: "Inter_400Regular" },
  statsRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    marginTop: 3,
    flexWrap: "wrap" as const,
  },
  stat: { flexDirection: "row" as const, alignItems: "center" as const, gap: 3 },
  statText: { fontSize: 11, fontFamily: "Inter_400Regular" },
  statusBadge: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  statusText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  deleteBtn: {
    width: 36,
    height: 36,
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
