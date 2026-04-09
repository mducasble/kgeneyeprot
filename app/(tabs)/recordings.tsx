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
import { GlassBackground } from "@/components/GlassBackground";
import type { Recording, UploadStatus } from "@/lib/types";
import type { QCResult } from "@/lib/qc-types";

const statusConfig: Record<UploadStatus, { icon: string; label: string; color: string }> = {
  queued: { icon: "time-outline", label: "Queued", color: "#FBBF24" },
  uploading: { icon: "cloud-upload-outline", label: "Uploading", color: "#60A5FA" },
  uploaded: { icon: "checkmark-circle", label: "Uploaded", color: "#34D399" },
  failed: { icon: "alert-circle-outline", label: "Failed", color: "#F87171" },
  retrying: { icon: "refresh-outline", label: "Retrying", color: "#FBBF24" },
};

const qcColors: Record<QCResult, string> = {
  passed: "#34D399",
  passed_with_warning: "#FBBF24",
  blocked: "#F87171",
};

function RecordingItem({ recording, onDelete }: { recording: Recording; onDelete: (id: string) => void }) {
  const config = statusConfig[recording.uploadStatus];
  const date = new Date(recording.createdAt);
  const timeStr = `${date.toLocaleDateString()} · ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  const duration = `${Math.floor(recording.duration / 60)}:${String(Math.floor(recording.duration % 60)).padStart(2, "0")}`;
  const qcColor = recording.qcReport ? qcColors[recording.qcReport.qcResult] : undefined;

  return (
    <View style={styles.card}>
      <LinearGradient
        colors={[config.color + "10", "transparent"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.cardGradient}
      />
      <View style={[styles.cardAccent, { backgroundColor: config.color }]} />

      <View style={styles.cardInner}>
        <View style={styles.thumbWrap}>
          <LinearGradient
            colors={[Colors.primary + "30", "#7C3AED30"]}
            style={StyleSheet.absoluteFill}
          />
          <Ionicons name="videocam" size={20} color={Colors.primary} />
        </View>

        <View style={styles.info}>
          <Text style={styles.title} numberOfLines={1}>{recording.questTitle}</Text>
          <Text style={styles.time}>{timeStr}</Text>
          <View style={styles.tags}>
            <View style={styles.tag}>
              <Ionicons name="time-outline" size={10} color={Colors.dark.textTertiary} />
              <Text style={styles.tagText}>{duration}</Text>
            </View>
            <View style={styles.tag}>
              <Ionicons name="document-outline" size={10} color={Colors.dark.textTertiary} />
              <Text style={styles.tagText}>{(recording.fileSize / (1024 * 1024)).toFixed(1)} MB</Text>
            </View>
            <View style={[styles.statusTag, { backgroundColor: config.color + "18", borderColor: config.color + "35" }]}>
              <Ionicons name={config.icon as any} size={10} color={config.color} />
              <Text style={[styles.statusText, { color: config.color }]}>{config.label}</Text>
            </View>
            {qcColor && recording.qcReport && (
              <View style={[styles.statusTag, { backgroundColor: qcColor + "18", borderColor: qcColor + "35" }]}>
                <Ionicons name="shield-checkmark-outline" size={10} color={qcColor} />
                <Text style={[styles.statusText, { color: qcColor }]}>{Math.round(recording.qcReport.readinessScore)}</Text>
              </View>
            )}
          </View>
        </View>

        <Pressable
          style={({ pressed }) => [styles.deleteBtn, { opacity: pressed ? 0.5 : 1 }]}
          onPress={() => onDelete(recording.id)}
        >
          <Ionicons name="trash-outline" size={16} color="#F87171" />
        </Pressable>
      </View>
    </View>
  );
}

export default function RecordingsScreen() {
  const { recordings, removeRecording } = useRecordings();
  const insets = useSafeAreaInsets();

  const handleDelete = (id: string) => {
    if (Platform.OS === "web") { removeRecording(id); return; }
    Alert.alert("Delete Recording", "Permanently delete this recording?", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => { removeRecording(id); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } },
    ]);
  };

  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const uploaded = recordings.filter((r) => r.uploadStatus === "uploaded").length;
  const passedQC = recordings.filter((r) => r.qcReport?.qcResult === "passed").length;

  return (
    <View style={styles.container}>
      <GlassBackground variant="recordings" />

      <View style={[styles.header, { paddingTop: insets.top + webTopInset + 16 }]}>
        <View>
          <Text style={styles.label}>Library</Text>
          <Text style={styles.title2}>Recordings</Text>
        </View>
        {recordings.length > 0 && (
          <View style={styles.headerStats}>
            <View style={styles.statChip}>
              <Ionicons name="cloud-done-outline" size={12} color="#34D399" />
              <Text style={[styles.statChipText, { color: "#34D399" }]}>{uploaded}/{recordings.length}</Text>
            </View>
            {recordings.some(r => r.qcReport) && (
              <View style={styles.statChip}>
                <Ionicons name="shield-checkmark-outline" size={12} color={Colors.primary} />
                <Text style={[styles.statChipText, { color: Colors.primary }]}>{passedQC} QC</Text>
              </View>
            )}
          </View>
        )}
      </View>

      <FlatList
        data={recordings}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <RecordingItem recording={item} onDelete={handleDelete} />}
        contentContainerStyle={[
          styles.list,
          { paddingBottom: insets.bottom + 110 + (Platform.OS === "web" ? 34 : 0) },
          recordings.length === 0 && styles.emptyList,
        ]}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <View style={styles.emptyIcon}>
              <LinearGradient colors={[Colors.primary + "25", "#7C3AED20"]} style={StyleSheet.absoluteFill} />
              <Ionicons name="film-outline" size={34} color={Colors.primary} />
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
  container: { flex: 1, backgroundColor: "#060410" },
  header: {
    paddingHorizontal: 22,
    paddingBottom: 20,
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    alignItems: "flex-end" as const,
  },
  label: { color: Colors.dark.textTertiary, fontSize: 11, fontFamily: "Inter_500Medium", letterSpacing: 1.2, textTransform: "uppercase" as const, marginBottom: 3 },
  title2: { color: "#FFFFFF", fontSize: 34, fontFamily: "Inter_700Bold", letterSpacing: -1 },
  headerStats: { gap: 6, alignItems: "flex-end" as const, marginBottom: 4 },
  statChip: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 5,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  statChipText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
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
  cardGradient: { ...StyleSheet.absoluteFillObject },
  cardAccent: { width: 3 },
  cardInner: {
    flex: 1,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 12,
    padding: 14,
  },
  thumbWrap: {
    width: 48,
    height: 48,
    borderRadius: 13,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    overflow: "hidden" as const,
    borderWidth: 1,
    borderColor: Colors.primary + "30",
  },
  info: { flex: 1, gap: 2 },
  title: { color: "#F1F5F9", fontSize: 15, fontFamily: "Inter_600SemiBold" },
  time: { color: Colors.dark.textTertiary, fontSize: 11, fontFamily: "Inter_400Regular" },
  tags: { flexDirection: "row" as const, flexWrap: "wrap" as const, gap: 5, marginTop: 4 },
  tag: { flexDirection: "row" as const, alignItems: "center" as const, gap: 3 },
  tagText: { color: Colors.dark.textTertiary, fontSize: 11, fontFamily: "Inter_400Regular" },
  statusTag: {
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
    width: 34,
    height: 34,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    backgroundColor: "#F8717115",
    borderRadius: 10,
  },
  emptyWrap: { flex: 1, alignItems: "center" as const, justifyContent: "center" as const, gap: 14, paddingHorizontal: 40 },
  emptyIcon: {
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
  emptyTitle: { color: "#F1F5F9", fontSize: 18, fontFamily: "Inter_600SemiBold" },
  emptySubtext: { color: Colors.dark.textTertiary, fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" as const, lineHeight: 20 },
});
