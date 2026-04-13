import React, { useState, useRef, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Platform,
  Animated,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Video, ResizeMode, type AVPlaybackStatus } from "expo-av";
import { useRecordings } from "@/lib/recordings-context";
import { DEFAULT_QC_THRESHOLDS } from "@/lib/qc-types";
import type { LocalQCReport, QCResult } from "@/lib/qc-types";
import Colors from "@/constants/colors";

type CheckStatus = "good" | "warning" | "failed";

interface QCCheckRow {
  label: string;
  status: CheckStatus;
  detail: string;
  icon: string;
}

function qcCheckRows(report: LocalQCReport): QCCheckRow[] {
  const t = DEFAULT_QC_THRESHOLDS;
  return [
    {
      label: "Hands Visible",
      status:
        report.handPresenceRate >= t.minHandPresenceRate
          ? "good"
          : report.handPresenceRate >= t.minHandPresenceRate * 0.7
          ? "warning"
          : "failed",
      detail: `${Math.round(report.handPresenceRate * 100)}% of frames`,
      icon: "hand-left-outline",
    },
    {
      label: "Face Privacy",
      status:
        report.facePresenceRate <= t.maxFacePresenceRate
          ? "good"
          : report.facePresenceRate <= t.maxFacePresenceRate * 2
          ? "warning"
          : "failed",
      detail:
        report.facePresenceRate < 0.01
          ? "No face detected"
          : `${Math.round(report.facePresenceRate * 100)}% of frames`,
      icon: "shield-checkmark-outline",
    },
    {
      label: "Orientation",
      status:
        t.requiredOrientation === "any" || report.orientation === t.requiredOrientation
          ? "good"
          : "failed",
      detail: `${report.orientation.charAt(0).toUpperCase() + report.orientation.slice(1)}${
        t.requiredOrientation !== "any" ? ` (${t.requiredOrientation} required)` : ""
      }`,
      icon: "phone-portrait-outline",
    },
    {
      label: "Duration",
      status: report.durationMs >= t.minDurationMs ? "good" : "failed",
      detail: `${Math.round(report.durationMs / 1000)}s recorded`,
      icon: "time-outline",
    },
    {
      label: "Lighting",
      status:
        report.brightnessScore >= t.minBrightnessScore + 15
          ? "good"
          : report.brightnessScore >= t.minBrightnessScore
          ? "warning"
          : "failed",
      detail:
        report.brightnessScore >= 70 ? "Good" : report.brightnessScore >= 40 ? "Low" : "Very low",
      icon: "sunny-outline",
    },
    {
      label: "Stability",
      status:
        report.stabilityScore >= t.minStabilityScore + 20
          ? "good"
          : report.stabilityScore >= t.minStabilityScore
          ? "warning"
          : "failed",
      detail:
        report.stabilityScore >= 75
          ? "Steady"
          : report.stabilityScore >= 50
          ? "Moderate movement"
          : "Excessive movement",
      icon: "phone-landscape-outline",
    },
    {
      label: "Sharpness",
      status:
        report.blurScore >= t.minBlurScore + 15
          ? "good"
          : report.blurScore >= t.minBlurScore
          ? "warning"
          : "failed",
      detail: report.blurScore >= 70 ? "Clear" : report.blurScore >= 45 ? "Slightly blurry" : "Blurry",
      icon: "eye-outline",
    },
  ];
}

function ScoreMeter({ score, result }: { score: number; result: QCResult }) {
  const progressAnim = useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: score,
      duration: 900,
      useNativeDriver: false,
    }).start();
  }, [score]);

  const color =
    result === "passed"
      ? Colors.dark.success
      : result === "passed_with_warning"
      ? Colors.dark.warning
      : Colors.dark.error;

  return (
    <View style={scoreStyles.container}>
      <View style={scoreStyles.trackBg}>
        <Animated.View
          style={[
            scoreStyles.fill,
            {
              backgroundColor: color,
              width: progressAnim.interpolate({
                inputRange: [0, 100],
                outputRange: ["0%", "100%"],
              }),
            },
          ]}
        />
      </View>
      <Text style={[scoreStyles.value, { color }]}>{Math.round(score)}</Text>
    </View>
  );
}

const scoreStyles = StyleSheet.create({
  container: { flexDirection: "row" as const, alignItems: "center" as const, gap: 12 },
  trackBg: {
    flex: 1,
    height: 10,
    borderRadius: 5,
    backgroundColor: "rgba(255,255,255,0.08)",
    overflow: "hidden" as const,
  },
  fill: { height: "100%", borderRadius: 5 },
  value: { fontSize: 22, fontFamily: "Inter_700Bold", minWidth: 40, textAlign: "right" as const },
});

function CheckRow({ check }: { check: QCCheckRow }) {
  const statusColor =
    check.status === "good"
      ? Colors.dark.success
      : check.status === "warning"
      ? Colors.dark.warning
      : Colors.dark.error;

  const statusLabel =
    check.status === "good" ? "Good" : check.status === "warning" ? "Warning" : "Failed";

  const statusIcon =
    check.status === "good"
      ? "checkmark-circle"
      : check.status === "warning"
      ? "alert-circle"
      : "close-circle";

  return (
    <View style={checkStyles.row}>
      <View style={[checkStyles.icon, { backgroundColor: statusColor + "15" }]}>
        <Ionicons name={check.icon as any} size={18} color={statusColor} />
      </View>
      <View style={checkStyles.info}>
        <Text style={checkStyles.label}>{check.label}</Text>
        <Text style={checkStyles.detail}>{check.detail}</Text>
      </View>
      <View style={[checkStyles.statusBadge, { backgroundColor: statusColor + "15" }]}>
        <Ionicons name={statusIcon as any} size={14} color={statusColor} />
        <Text style={[checkStyles.statusText, { color: statusColor }]}>{statusLabel}</Text>
      </View>
    </View>
  );
}

const checkStyles = StyleSheet.create({
  row: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  info: { flex: 1, gap: 1 },
  label: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" },
  detail: { color: "rgba(255,255,255,0.45)", fontSize: 12, fontFamily: "Inter_400Regular" },
  statusBadge: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
});

function StatChip({
  icon,
  label,
  value,
}: {
  icon: string;
  label: string;
  value: string;
}) {
  return (
    <View style={statStyles.chip}>
      <Ionicons name={icon as any} size={14} color={Colors.primary} />
      <View style={statStyles.chipText}>
        <Text style={statStyles.chipLabel}>{label}</Text>
        <Text style={statStyles.chipValue}>{value}</Text>
      </View>
    </View>
  );
}

const statStyles = StyleSheet.create({
  chip: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flex: 1,
    minWidth: "45%" as any,
  },
  chipText: { flex: 1 },
  chipLabel: { color: "rgba(255,255,255,0.4)", fontSize: 11, fontFamily: "Inter_400Regular" },
  chipValue: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold", marginTop: 1 },
});

function VideoPreview({ uri }: { uri: string }) {
  const videoRef = useRef<Video>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);

  const isSimulated = !uri || uri.startsWith("simulated://") || uri.startsWith("file://simulated");

  const onPlaybackStatusUpdate = useCallback((status: AVPlaybackStatus) => {
    if (!status.isLoaded) return;
    setIsPlaying(status.isPlaying);
    setPosition(status.positionMillis ?? 0);
    setDuration(status.durationMillis ?? 0);
    if (status.didJustFinish) {
      setIsPlaying(false);
      videoRef.current?.setPositionAsync(0);
    }
  }, []);

  const handleTogglePlay = async () => {
    if (!videoRef.current || !isLoaded) return;
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    isPlaying ? await videoRef.current.pauseAsync() : await videoRef.current.playAsync();
  };

  const handleToggleMute = async () => {
    if (!videoRef.current) return;
    const next = !isMuted;
    setIsMuted(next);
    await videoRef.current.setIsMutedAsync(next);
  };

  const formatMs = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    return `${m}:${(s % 60).toString().padStart(2, "0")}`;
  };

  const progress = duration > 0 ? position / duration : 0;

  if (isSimulated || hasError) {
    return (
      <View style={vpStyles.placeholder}>
        <Ionicons name="videocam-off-outline" size={32} color="rgba(255,255,255,0.2)" />
        <Text style={vpStyles.placeholderText}>
          {isSimulated ? "Simulated recording — no video preview" : "Could not load video"}
        </Text>
      </View>
    );
  }

  return (
    <View style={vpStyles.container}>
      <Pressable style={vpStyles.videoWrapper} onPress={handleTogglePlay}>
        <Video
          ref={videoRef}
          source={{ uri }}
          style={vpStyles.video}
          resizeMode={ResizeMode.CONTAIN}
          isLooping={false}
          isMuted={isMuted}
          onPlaybackStatusUpdate={onPlaybackStatusUpdate}
          onLoad={() => setIsLoaded(true)}
          onError={() => setHasError(true)}
          useNativeControls={false}
        />
        {!isLoaded && (
          <View style={vpStyles.loadingOverlay}>
            <ActivityIndicator size="small" color={Colors.primary} />
          </View>
        )}
        {isLoaded && !isPlaying && (
          <View style={vpStyles.playOverlay}>
            <View style={vpStyles.playButton}>
              <Ionicons name="play" size={28} color="#fff" />
            </View>
          </View>
        )}
      </Pressable>
      <View style={vpStyles.controls}>
        <Text style={vpStyles.timeText}>
          {formatMs(position)} / {formatMs(duration)}
        </Text>
        <View style={vpStyles.progressTrack}>
          <View style={[vpStyles.progressFill, { width: `${progress * 100}%` as any }]} />
        </View>
        <Pressable
          style={({ pressed }) => [vpStyles.muteBtn, { opacity: pressed ? 0.7 : 1 }]}
          onPress={handleToggleMute}
        >
          <Ionicons
            name={isMuted ? "volume-mute-outline" : "volume-high-outline"}
            size={18}
            color="rgba(255,255,255,0.6)"
          />
        </Pressable>
      </View>
    </View>
  );
}

const vpStyles = StyleSheet.create({
  container: {
    borderRadius: 16,
    overflow: "hidden" as const,
    backgroundColor: "#000",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  videoWrapper: {
    aspectRatio: 16 / 9,
    backgroundColor: "#000",
    position: "relative" as const,
  },
  video: { width: "100%", height: "100%" },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    backgroundColor: "rgba(0,0,0,0.3)",
  },
  playButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.4)",
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  controls: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  timeText: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    minWidth: 80,
  },
  progressTrack: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.1)",
    overflow: "hidden" as const,
  },
  progressFill: { height: "100%", borderRadius: 2, backgroundColor: Colors.primary },
  muteBtn: {
    width: 32,
    height: 32,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  placeholder: {
    aspectRatio: 16 / 9,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 10,
    padding: 20,
  },
  placeholderText: {
    color: "rgba(255,255,255,0.25)",
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "center" as const,
  },
});

export default function RecordingDetailScreen() {
  const { recordingId } = useLocalSearchParams<{ recordingId: string }>();
  const insets = useSafeAreaInsets();
  const { recordings } = useRecordings();

  const recording = recordings.find((r) => r.id === recordingId);
  const qcReport = recording?.qcReport ?? null;

  const webTopInset = Platform.OS === "web" ? 67 : 0;

  const handleBack = () => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  };

  if (!recording) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
        <View style={styles.topBar}>
          <Pressable style={({ pressed }) => [styles.closeBtn, { opacity: pressed ? 0.7 : 1 }]} onPress={handleBack}>
            <Ionicons name="chevron-back" size={22} color="rgba(255,255,255,0.7)" />
          </Pressable>
          <Text style={styles.topBarTitle}>Recording</Text>
          <View style={{ width: 36 }} />
        </View>
        <View style={styles.notFound}>
          <Ionicons name="film-outline" size={40} color="rgba(255,255,255,0.2)" />
          <Text style={styles.notFoundText}>Recording not found</Text>
        </View>
      </View>
    );
  }

  const date = new Date(recording.createdAt);
  const timeStr = `${date.toLocaleDateString()} · ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  const durationSec = recording.duration;
  const durationStr = `${Math.floor(durationSec / 60)}:${String(durationSec % 60).padStart(2, "0")}`;

  const resultConfig = qcReport
    ? {
        passed: {
          color: Colors.dark.success,
          icon: "checkmark-circle",
          title: "Upload Ready",
          subtitle: "Recording passed all quality checks.",
          bg: Colors.dark.success + "10",
        },
        passed_with_warning: {
          color: Colors.dark.warning,
          icon: "alert-circle",
          title: "Upload Ready",
          subtitle: "Recording can be uploaded, but some quality issues were noted.",
          bg: Colors.dark.warning + "10",
        },
        blocked: {
          color: Colors.dark.error,
          icon: "close-circle",
          title: "Re-record Required",
          subtitle: "Recording doesn't meet the minimum quality requirements.",
          bg: Colors.dark.error + "10",
        },
      }[qcReport.qcResult]
    : null;

  const checks = qcReport ? qcCheckRows(qcReport) : [];

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
      <View style={styles.topBar}>
        <Pressable
          style={({ pressed }) => [styles.closeBtn, { opacity: pressed ? 0.7 : 1 }]}
          onPress={handleBack}
        >
          <Ionicons name="chevron-back" size={22} color="rgba(255,255,255,0.7)" />
        </Pressable>
        <Text style={styles.topBarTitle} numberOfLines={1}>{recording.questTitle}</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 40 }]}
      >
        <VideoPreview uri={recording.uri} />

        <View style={styles.metaRow}>
          <Ionicons name="calendar-outline" size={13} color="rgba(255,255,255,0.35)" />
          <Text style={styles.metaText}>{timeStr}</Text>
          <Text style={styles.metaDot}>·</Text>
          <Ionicons name="time-outline" size={13} color="rgba(255,255,255,0.35)" />
          <Text style={styles.metaText}>{durationStr}</Text>
          <Text style={styles.metaDot}>·</Text>
          <Text style={styles.metaText}>{(recording.fileSize / (1024 * 1024)).toFixed(1)} MB</Text>
        </View>

        {qcReport && resultConfig ? (
          <>
            <View style={[styles.resultCard, { backgroundColor: resultConfig.bg, borderColor: resultConfig.color + "30" }]}>
              <View style={styles.resultHeader}>
                <Ionicons name={resultConfig.icon as any} size={34} color={resultConfig.color} />
                <View style={styles.resultTitles}>
                  <Text style={[styles.resultTitle, { color: resultConfig.color }]}>{resultConfig.title}</Text>
                  <Text style={styles.resultSubtitle}>{resultConfig.subtitle}</Text>
                </View>
              </View>
              <View style={styles.scoreSection}>
                <Text style={styles.scoreLabel}>Upload Readiness Score</Text>
                <ScoreMeter score={qcReport.readinessScore} result={qcReport.qcResult} />
                <View style={styles.scoreLegend}>
                  <Text style={styles.legendItem}><Text style={{ color: Colors.dark.error }}>■</Text> Block &lt;65</Text>
                  <Text style={styles.legendItem}><Text style={{ color: Colors.dark.warning }}>■</Text> Warning 65–84</Text>
                  <Text style={styles.legendItem}><Text style={{ color: Colors.dark.success }}>■</Text> Pass 85+</Text>
                </View>
              </View>
            </View>

            {qcReport.blockReasons.length > 0 && (
              <View style={[styles.section, { borderColor: Colors.dark.error + "30" }]}>
                <View style={styles.sectionHeader}>
                  <Ionicons name="ban-outline" size={18} color={Colors.dark.error} />
                  <Text style={[styles.sectionTitle, { color: Colors.dark.error }]}>Blocking Issues</Text>
                </View>
                {qcReport.blockReasons.map((reason, i) => (
                  <View key={i} style={styles.reasonRow}>
                    <View style={[styles.reasonDot, { backgroundColor: Colors.dark.error }]} />
                    <Text style={styles.reasonText}>{reason}</Text>
                  </View>
                ))}
              </View>
            )}

            {qcReport.warningReasons.length > 0 && (
              <View style={[styles.section, { borderColor: Colors.dark.warning + "30" }]}>
                <View style={styles.sectionHeader}>
                  <Ionicons name="warning-outline" size={18} color={Colors.dark.warning} />
                  <Text style={[styles.sectionTitle, { color: Colors.dark.warning }]}>Warnings</Text>
                </View>
                {qcReport.warningReasons.map((reason, i) => (
                  <View key={i} style={styles.reasonRow}>
                    <View style={[styles.reasonDot, { backgroundColor: Colors.dark.warning }]} />
                    <Text style={styles.reasonText}>{reason}</Text>
                  </View>
                ))}
              </View>
            )}

            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Ionicons name="clipboard-outline" size={18} color={Colors.primary} />
                <Text style={[styles.sectionTitle, { color: "#fff" }]}>Quality Checks</Text>
              </View>
              {checks.map((check, i) => <CheckRow key={i} check={check} />)}
            </View>

            <View style={[styles.section, { gap: 8 }]}>
              <View style={styles.sectionHeader}>
                <Ionicons name="stats-chart-outline" size={18} color={Colors.accent} />
                <Text style={[styles.sectionTitle, { color: "#fff" }]}>Recording Stats</Text>
              </View>
              <View style={styles.statsGrid}>
                <StatChip icon="time-outline" label="Duration" value={`${Math.round(qcReport.durationMs / 1000)}s`} />
                <StatChip icon="hand-left-outline" label="Hand Visibility" value={`${Math.round(qcReport.handPresenceRate * 100)}%`} />
                <StatChip icon="film-outline" label="Frames Analyzed" value={String(qcReport.sampledFrameCount)} />
                <StatChip icon="speedometer-outline" label="Stability" value={`${Math.round(qcReport.stabilityScore)}/100`} />
                {(recording.imuSampleCount ?? 0) > 0 && (
                  <StatChip icon="pulse-outline" label="IMU Samples" value={String(recording.imuSampleCount)} />
                )}
                {(recording.imuEstimatedHz ?? 0) > 0 && (
                  <StatChip icon="radio-outline" label="IMU Rate" value={`${(recording.imuEstimatedHz ?? 0).toFixed(0)}Hz`} />
                )}
              </View>
            </View>
          </>
        ) : (
          <View style={styles.noQcWrap}>
            <Ionicons name="analytics-outline" size={32} color="rgba(255,255,255,0.2)" />
            <Text style={styles.noQcTitle}>No QC Report</Text>
            <Text style={styles.noQcText}>Quality analysis data isn't available for this recording.</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#060410" },
  topBar: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.07)",
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  topBarTitle: {
    color: "#fff",
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    flex: 1,
    textAlign: "center" as const,
    paddingHorizontal: 8,
  },
  scroll: { padding: 18, gap: 16 },
  metaRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 5,
    flexWrap: "wrap" as const,
  },
  metaText: { color: "rgba(255,255,255,0.4)", fontSize: 12, fontFamily: "Inter_400Regular" },
  metaDot: { color: "rgba(255,255,255,0.2)", fontSize: 12 },
  resultCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 18,
    gap: 16,
  },
  resultHeader: { flexDirection: "row" as const, alignItems: "flex-start" as const, gap: 14 },
  resultTitles: { flex: 1, gap: 4 },
  resultTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  resultSubtitle: { color: "rgba(255,255,255,0.5)", fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
  scoreSection: { gap: 10 },
  scoreLabel: { color: "rgba(255,255,255,0.5)", fontSize: 12, fontFamily: "Inter_500Medium" },
  scoreLegend: {
    flexDirection: "row" as const,
    gap: 14,
    flexWrap: "wrap" as const,
  },
  legendItem: { color: "rgba(255,255,255,0.35)", fontSize: 11, fontFamily: "Inter_400Regular" },
  section: {
    backgroundColor: "rgba(255,255,255,0.03)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    padding: 16,
    gap: 4,
  },
  sectionHeader: { flexDirection: "row" as const, alignItems: "center" as const, gap: 8, marginBottom: 8 },
  sectionTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  reasonRow: { flexDirection: "row" as const, alignItems: "flex-start" as const, gap: 10, paddingVertical: 4 },
  reasonDot: { width: 6, height: 6, borderRadius: 3, marginTop: 5 },
  reasonText: { color: "rgba(255,255,255,0.6)", fontSize: 13, fontFamily: "Inter_400Regular", flex: 1, lineHeight: 18 },
  statsGrid: { flexDirection: "row" as const, flexWrap: "wrap" as const, gap: 8 },
  noQcWrap: {
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 12,
    paddingVertical: 40,
    paddingHorizontal: 24,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
  },
  noQcTitle: { color: "rgba(255,255,255,0.4)", fontSize: 16, fontFamily: "Inter_600SemiBold" },
  noQcText: { color: "rgba(255,255,255,0.25)", fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" as const, lineHeight: 18 },
  notFound: { flex: 1, alignItems: "center" as const, justifyContent: "center" as const, gap: 12 },
  notFoundText: { color: "rgba(255,255,255,0.3)", fontSize: 15, fontFamily: "Inter_400Regular" },
});
