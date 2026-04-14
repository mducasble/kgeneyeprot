import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  useColorScheme,
  Platform,
  Animated,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Video, ResizeMode, type AVPlaybackStatus } from "expo-av";
import { useRecordings } from "@/lib/recordings-context";
import { runQCEngine } from "@/lib/qc-engine";
import { analyzeVideo } from "@/lib/mediapipe-analyzer";
import { DEFAULT_QC_THRESHOLDS } from "@/lib/qc-types";
import type { LocalQCReport, QCResult } from "@/lib/qc-types";
import { writeQCReport, writeMetadata, getSessionFilePaths, getSessionFolderPath, validateSessionPackage, writeSessionManifest, buildArtifactFilesList } from "@/lib/session-storage";
import * as Device from "expo-device";
import { getIMUFilePath, getIMUStats, getIMUQualityMetrics } from "@/lib/imu-service";

const SYNC_TOLERANCE_MS_THRESHOLD = 5;
import { writeVideoTimestamps, writeAllSemanticArtifacts } from "@/lib/session-artifacts";
import {
  checkAdvancedCapabilities,
  writeCameraMountConfig,
  buildAdvancedCaptureMetadata,
  stopAdvancedCapture,
} from "@/lib/advanced-capture-service";
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
      status:
        report.durationMs >= t.minDurationMs
          ? "good"
          : "failed",
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

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: score,
      duration: 1000,
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
    if (isPlaying) {
      await videoRef.current.pauseAsync();
    } else {
      await videoRef.current.playAsync();
    }
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
          {isSimulated ? "Gravação simulada — sem prévia de vídeo" : "Não foi possível carregar o vídeo"}
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
  progressFill: {
    height: "100%",
    borderRadius: 2,
    backgroundColor: Colors.primary,
  },
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

function AnalysisLoader({ progress }: { progress: number }) {
  const steps = [
    "Loading AI models…",
    "Extracting video frames…",
    "Detecting hand gestures…",
    "Checking face visibility…",
    "Computing quality scores…",
    "Saving session files…",
    "Finalizing QC report…",
  ];
  const step = Math.min(Math.floor(progress / 15), steps.length - 1);

  return (
    <View style={loaderStyles.container}>
      <ActivityIndicator size="large" color={Colors.primary} />
      <Text style={loaderStyles.title}>Analyzing Recording</Text>
      <Text style={loaderStyles.step}>{steps[step]}</Text>
      <View style={loaderStyles.track}>
        <View style={[loaderStyles.fill, { width: `${progress}%` as any }]} />
      </View>
      <Text style={loaderStyles.pct}>{Math.round(progress)}%</Text>
    </View>
  );
}

const loaderStyles = StyleSheet.create({
  container: { flex: 1, alignItems: "center" as const, justifyContent: "center" as const, gap: 16, padding: 40 },
  title: { color: "#fff", fontSize: 20, fontFamily: "Inter_700Bold" },
  step: { color: "rgba(255,255,255,0.5)", fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" as const },
  track: {
    width: "100%",
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.1)",
    overflow: "hidden" as const,
  },
  fill: { height: "100%", borderRadius: 3, backgroundColor: Colors.primary },
  pct: { color: Colors.primary, fontSize: 14, fontFamily: "Inter_600SemiBold" },
});

export default function ReviewScreen() {
  const params = useLocalSearchParams<{
    recordingId: string;
    durationMs: string;
    fileSize: string;
    orientation: string;
    questId: string;
    questTitle: string;
    videoUri: string;
    sessionId: string;
    imuSampleCount: string;
    imuEstimatedHz: string;
    sessionStartMs: string;
    imuStartMs: string;
    videoStartMs: string;
    recordingStopMs: string;
  }>();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const { updateUploadStatus, setQCReport, setSessionData, recordings } = useRecordings();

  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [qcReport, setQcReport] = useState<LocalQCReport | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const recordingId = params.recordingId || "";
  const durationMs = Number(params.durationMs || 30000);
  const fileSize = Number(params.fileSize || 10 * 1024 * 1024);
  const orientation = (params.orientation || "portrait") as "portrait" | "landscape";
  const questId = params.questId || "";
  const questTitle = params.questTitle || "Unknown Quest";
  const sessionId = params.sessionId || recordingId;
  const imuSampleCount = Number(params.imuSampleCount || 0);
  const imuEstimatedHz = Number(params.imuEstimatedHz || 0);
  const sessionStartMs = Number(params.sessionStartMs || 0);
  const imuStartMs = Number(params.imuStartMs || 0);
  const videoStartMs = Number(params.videoStartMs || 0);
  const recordingStopMs = Number(params.recordingStopMs || 0);

  const webTopInset = Platform.OS === "web" ? 67 : 0;

  useEffect(() => {
    let mounted = true;

    const runAnalysis = async () => {
      const videoUri = params.videoUri || "";

      const recording = recordings.find((r) => r.id === recordingId);
      const stabilityReadings: number[] =
        (recording as any)?._pendingQC?.stabilityReadings || [];

      let frames;
      try {
        frames = await analyzeVideo(
          videoUri,
          durationMs,
          stabilityReadings,
          (p) => { if (mounted) setAnalysisProgress(Math.min(p, 88)); },
        );
      } catch {
        frames = [];
      }

      if (!mounted) return;

      const report = runQCEngine(
        {
          recordingId,
          questId,
          durationMs,
          fileSizeBytes: fileSize,
          orientation,
          frames,
          stabilityReadings,
        },
        DEFAULT_QC_THRESHOLDS,
      );

      setAnalysisProgress(92);

      if (mounted) {
        setQCReport(recordingId, report);

        const sessionPaths = await getSessionFilePaths(sessionId).catch(() => ({
          imuPath: getIMUFilePath(sessionId),
          metadataPath: "",
          qcReportPath: "",
          videoTimestampPath: "",
          handLandmarksPath: "",
          facePresencePath: "",
          frameQcMetricsPath: "",
        }));

        const sessionFolderPath = getSessionFolderPath(sessionId);
        const imuFinalStats = getIMUStats();
        const imuTargetHz = imuFinalStats.targetHz;
        const imuDurationMs = imuFinalStats.durationMs;
        const imuDroppedSampleEstimate = imuFinalStats.droppedSampleEstimate;
        const imuQuality = getIMUQualityMetrics();
        const estimatedFps = report.fps > 0 ? report.fps : 30;

        const qcReportData = {
          score: report.readinessScore,
          recommendation: report.qcResult,
          warnings: report.warningReasons,
          blockReasons: report.blockReasons,
          metrics: {
            handPresenceRate: report.handPresenceRate,
            facePresenceRate: report.facePresenceRate,
            brightnessScore: report.brightnessScore,
            blurScore: report.blurScore,
            stabilityScore: report.stabilityScore,
            sampledFrameCount: report.sampledFrameCount,
          },
          qcVersion: report.qcVersion,
          analyzedFrames: report.sampledFrameCount,
          timestamp: Date.now(),
        };

        let videoTimestampPath = "";
        let frameTimestampCount = 0;
        let videoFrameTimestampMode: "native" | "estimated" = "estimated";
        let handLandmarksPath = "";
        let facePresencePath = "";
        let frameQcMetricsPath = "";
        let semanticArtifactsAvailable = false;

        try {
          const tsResult = await writeVideoTimestamps(sessionId, videoStartMs, durationMs, estimatedFps);
          videoTimestampPath = tsResult.path;
          frameTimestampCount = tsResult.count;
          videoFrameTimestampMode = tsResult.mode;
          console.log(`[SESSION] video_timestamps.jsonl written: ${frameTimestampCount} frames`);
        } catch (err) {
          console.warn("[SESSION] Failed to write video timestamps:", err);
        }

        if (frames.length > 0) {
          try {
            const semanticPaths = await writeAllSemanticArtifacts(sessionId, frames, videoStartMs, durationMs);
            handLandmarksPath = semanticPaths.handLandmarksPath;
            facePresencePath = semanticPaths.facePresencePath;
            frameQcMetricsPath = semanticPaths.frameQcMetricsPath;
            semanticArtifactsAvailable = true;
            console.log("[SESSION] Semantic artifacts written (hand_landmarks, face_presence, frame_qc_metrics)");
          } catch (err) {
            console.warn("[SESSION] Failed to write semantic artifacts:", err);
          }
        }

        let advancedResult = null;
        let cameraMountWritten = false;
        let headPosePath = "";
        let cameraCalibrationPath = "";
        let cameraMountPath = "";

        if (Platform.OS === "ios") {
          try {
            advancedResult = await stopAdvancedCapture();
            if (advancedResult) {
              const artifacts = advancedResult.generatedArtifacts;
              if (artifacts.includes("head_pose.jsonl")) {
                headPosePath = `${sessionFolderPath}head_pose.jsonl`;
              }
              if (artifacts.includes("camera_calibration.json")) {
                cameraCalibrationPath = `${sessionFolderPath}camera_calibration.json`;
              }
              console.log(`[AdvancedCapture] Artifacts: ${artifacts.join(", ")}`);
            }
          } catch (err) {
            console.warn("[AdvancedCapture] Stop/collect error:", err);
          }

          try {
            cameraMountPath = await writeCameraMountConfig(sessionId);
            cameraMountWritten = true;
          } catch (err) {
            console.warn("[AdvancedCapture] Mount config write error:", err);
          }
        }

        const advancedCaps = await checkAdvancedCapabilities();
        const advancedMeta = buildAdvancedCaptureMetadata(advancedResult, advancedCaps, cameraMountWritten);

        const validationWarnings = [...report.warningReasons];
        if (imuQuality.imuSource === "none" && imuSampleCount === 0) {
          validationWarnings.push("IMU produced zero samples — no sensor source available");
        }
        if (imuQuality.imuAverageSyncDeltaMs > SYNC_TOLERANCE_MS_THRESHOLD) {
          validationWarnings.push(`IMU average sync delta ${imuQuality.imuAverageSyncDeltaMs.toFixed(1)}ms exceeds tolerance`);
        }
        if (imuQuality.imuZeroGyroDroppedSamples > 10) {
          validationWarnings.push(`IMU dropped ${imuQuality.imuZeroGyroDroppedSamples} zero-gyro startup samples`);
        }
        if (imuQuality.imuWarmupDroppedSamples > 50) {
          validationWarnings.push(`IMU warmup dropped ${imuQuality.imuWarmupDroppedSamples} samples`);
        }
        const validation = await validateSessionPackage(sessionId, imuEstimatedHz, frameTimestampCount).catch(() => ({
          valid: true,
          errors: [] as string[],
          warnings: [] as string[],
        }));
        validationWarnings.push(...validation.warnings);

        const deviceModel = Device.modelName || Device.deviceName || "unknown";
        const manufacturer = Device.manufacturer || "unknown";
        const deviceType = Device.deviceType != null
          ? (Device.deviceType === Device.DeviceType.PHONE ? "phone"
            : Device.deviceType === Device.DeviceType.TABLET ? "tablet"
            : Device.deviceType === Device.DeviceType.DESKTOP ? "desktop"
            : Device.deviceType === Device.DeviceType.TV ? "tv"
            : "unknown")
          : "unknown";

        const frameTimestampQualityNote = videoFrameTimestampMode === "native"
          ? "native timestamps from capture pipeline"
          : "estimated from videoStartEpochMs, durationMs, and assumed FPS";

        let qcReportPath = "";
        let metadataPath = "";

        try {
          qcReportPath = await writeQCReport(sessionId, qcReportData as any);
        } catch (err) {
          console.warn("[SESSION] Failed to write QC report:", err);
        }

        const artifactFiles = await buildArtifactFilesList(sessionId);

        const metadata = {
          sessionId,
          questId,
          userId: "local",
          sessionStartEpochMs: sessionStartMs,
          imuStartEpochMs: imuStartMs,
          videoStartEpochMs: videoStartMs,
          recordingStopEpochMs: recordingStopMs,
          durationMs,
          imuTargetHz,
          imuEstimatedHz,
          imuSampleCount,
          imuDurationMs,
          imuDroppedSampleEstimate,
          imuSource: imuQuality.imuSource,
          imuFirstValidSampleEpochMs: imuQuality.imuFirstValidSampleEpochMs,
          imuAverageSyncDeltaMs: imuQuality.imuAverageSyncDeltaMs,
          imuMaxSyncDeltaMs: imuQuality.imuMaxSyncDeltaMs,
          imuWarmupDroppedSamples: imuQuality.imuWarmupDroppedSamples,
          imuZeroGyroDroppedSamples: imuQuality.imuZeroGyroDroppedSamples,
          videoFrameTimestampMode,
          frameTimestampQualityNote,
          estimatedFps,
          frameTimestampCount,
          deviceModel,
          manufacturer,
          deviceType,
          osName: Platform.OS,
          osVersion: String(Platform.Version),
          qcSummary: {
            result: report.qcResult,
            readinessScore: report.readinessScore,
          },
          semanticArtifacts: {
            hasHandLandmarks: !!handLandmarksPath,
            hasFacePresence: !!facePresencePath,
            hasFrameQcMetrics: !!frameQcMetricsPath,
          },
          advancedCapture: advancedMeta,
          sessionFolderPath,
          artifactFiles,
          warnings: validationWarnings,
        };

        try {
          metadataPath = await writeMetadata(sessionId, metadata as any);
        } catch (err) {
          console.warn("[SESSION] Failed to write metadata:", err);
        }

        let manifestPath = "";
        try {
          const { path: mPath, manifest } = await writeSessionManifest(sessionId, sessionFolderPath, sessionStartMs);
          manifestPath = mPath;
          if (!manifest.complete) {
            validationWarnings.push(`Session incomplete — missing required files: ${manifest.missingRequired.join(", ")}`);
          }
          const updatedArtifactFiles = await buildArtifactFilesList(sessionId);
          if (updatedArtifactFiles.length !== artifactFiles.length) {
            metadata.artifactFiles = updatedArtifactFiles;
            await writeMetadata(sessionId, metadata as any).catch(() => {});
          }
        } catch (err) {
          console.warn("[SESSION] Failed to write session manifest:", err);
        }

        if (mounted) {
          setSessionData(recordingId, {
            sessionId,
            imuPath: sessionPaths.imuPath,
            metadataPath,
            qcReportPath,
            imuSampleCount,
            imuEstimatedHz,
            sessionStartEpochMs: sessionStartMs,
            imuStartEpochMs: imuStartMs,
            videoStartEpochMs: videoStartMs,
            recordingStopEpochMs: recordingStopMs,
            sessionFolderPath,
            videoTimestampPath,
            handLandmarksPath,
            facePresencePath,
            frameQcMetricsPath,
            manifestPath,
            frameTimestampCount,
            semanticArtifactsAvailable,
            headPosePath: headPosePath || undefined,
            cameraCalibrationPath: cameraCalibrationPath || undefined,
            cameraMountPath: cameraMountPath || undefined,
            advancedCaptureEnabled: advancedMeta.enabled,
          });

          console.log(`[SESSION] All artifacts saved. QC: ${qcReportPath}, Meta: ${metadataPath}, Manifest: ${manifestPath}, IMU: ${imuSampleCount}@${imuEstimatedHz.toFixed(1)}Hz, Timestamps: ${frameTimestampCount}, Semantic: ${semanticArtifactsAvailable}`);
        }
      }

      setAnalysisProgress(100);
      setTimeout(() => {
        if (!mounted) return;
        setQcReport(report);
        if (Platform.OS !== "web") {
          if (report.qcResult === "blocked") {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          } else if (report.qcResult === "passed") {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          } else {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          }
        }
      }, 400);
    };

    runAnalysis();

    return () => { mounted = false; };
  }, []);

  const handleConfirmUpload = () => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.replace("/(tabs)");
  };

  const handleRetake = () => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    updateUploadStatus(recordingId, "failed");
    router.back();
  };

  if (!qcReport) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
        <View style={styles.topBar}>
          <Pressable
            style={({ pressed }) => [styles.closeBtn, { opacity: pressed ? 0.7 : 1 }]}
            onPress={() => router.back()}
          >
            <Ionicons name="close" size={22} color="rgba(255,255,255,0.5)" />
          </Pressable>
          <Text style={styles.topBarTitle}>Quality Check</Text>
          <View style={{ width: 36 }} />
        </View>
        <AnalysisLoader progress={analysisProgress} />
      </View>
    );
  }

  const resultConfig = {
    passed: {
      color: Colors.dark.success,
      icon: "checkmark-circle",
      title: "Upload Ready",
      subtitle: "Great recording! Your video passed all quality checks.",
      bg: Colors.dark.success + "10",
    },
    passed_with_warning: {
      color: Colors.dark.warning,
      icon: "alert-circle",
      title: "Upload Ready",
      subtitle: "Your recording can be uploaded, but some quality issues were noted.",
      bg: Colors.dark.warning + "10",
    },
    blocked: {
      color: Colors.dark.error,
      icon: "close-circle",
      title: "Re-record Required",
      subtitle: "Your recording doesn't meet the minimum quality requirements.",
      bg: Colors.dark.error + "10",
    },
  }[qcReport.qcResult];

  const checks = qcCheckRows(qcReport);

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
      <View style={styles.topBar}>
        <Pressable
          style={({ pressed }) => [styles.closeBtn, { opacity: pressed ? 0.7 : 1 }]}
          onPress={() => router.back()}
        >
          <Ionicons name="close" size={22} color="rgba(255,255,255,0.5)" />
        </Pressable>
        <Text style={styles.topBarTitle}>QC Report</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 120 }]}
      >
        <VideoPreview uri={params.videoUri || ""} />

        <View style={[styles.resultCard, { backgroundColor: resultConfig.bg, borderColor: resultConfig.color + "30" }]}>
          <View style={styles.resultHeader}>
            <Ionicons name={resultConfig.icon as any} size={36} color={resultConfig.color} />
            <View style={styles.resultTitles}>
              <Text style={[styles.resultTitle, { color: resultConfig.color }]}>{resultConfig.title}</Text>
              <Text style={styles.resultSubtitle}>{resultConfig.subtitle}</Text>
            </View>
          </View>

          <View style={styles.scoreSection}>
            <Text style={styles.scoreLabel}>Upload Readiness Score</Text>
            <ScoreMeter score={qcReport.readinessScore} result={qcReport.qcResult} />
            <View style={styles.scoreLegend}>
              <Text style={styles.legendItem}>
                <Text style={{ color: Colors.dark.error }}>■</Text> Block &lt;65
              </Text>
              <Text style={styles.legendItem}>
                <Text style={{ color: Colors.dark.warning }}>■</Text> Warning 65–84
              </Text>
              <Text style={styles.legendItem}>
                <Text style={{ color: Colors.dark.success }}>■</Text> Pass 85+
              </Text>
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
          {checks.map((check, i) => (
            <CheckRow key={i} check={check} />
          ))}
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
            {imuSampleCount > 0 && (
              <StatChip icon="pulse-outline" label="IMU Samples" value={`${imuSampleCount}`} />
            )}
            {imuEstimatedHz > 0 && (
              <StatChip icon="radio-outline" label="IMU Rate" value={`${imuEstimatedHz.toFixed(0)}Hz`} />
            )}
          </View>
        </View>
      </ScrollView>

      <View style={[styles.bottomActions, { paddingBottom: insets.bottom + 16 }]}>
        <Pressable
          style={({ pressed }) => [styles.retakeBtn, { opacity: pressed ? 0.85 : 1 }]}
          onPress={handleRetake}
        >
          <Ionicons name="refresh" size={20} color={Colors.dark.textSecondary} />
          <Text style={styles.retakeBtnText}>Retake</Text>
        </Pressable>

        {qcReport.qcResult !== "blocked" && (
          <Pressable
            style={({ pressed }) => [
              styles.uploadBtn,
              {
                backgroundColor: qcReport.qcResult === "passed" ? Colors.primary : Colors.dark.warning,
                opacity: pressed ? 0.9 : 1,
                transform: [{ scale: pressed ? 0.98 : 1 }],
              },
            ]}
            onPress={handleConfirmUpload}
            disabled={isUploading}
          >
            <Ionicons name="cloud-upload-outline" size={20} color="#fff" />
            <Text style={styles.uploadBtnText}>
              {qcReport.qcResult === "passed" ? "Confirm Upload" : "Upload Anyway"}
            </Text>
          </Pressable>
        )}

        {qcReport.qcResult === "blocked" && (
          <Pressable
            style={({ pressed }) => [
              styles.uploadBtn,
              { backgroundColor: Colors.dark.error, opacity: pressed ? 0.9 : 1 },
            ]}
            onPress={handleRetake}
          >
            <Ionicons name="videocam-outline" size={20} color="#fff" />
            <Text style={styles.uploadBtnText}>Re-record</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

function StatChip({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={chipStyles.chip}>
      <Ionicons name={icon as any} size={16} color={Colors.primary} />
      <Text style={chipStyles.value}>{value}</Text>
      <Text style={chipStyles.label}>{label}</Text>
    </View>
  );
}

const chipStyles = StyleSheet.create({
  chip: {
    flex: 1,
    minWidth: "45%" as any,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 12,
    padding: 12,
    alignItems: "center" as const,
    gap: 4,
  },
  value: { color: "#fff", fontSize: 18, fontFamily: "Inter_700Bold" },
  label: { color: "rgba(255,255,255,0.4)", fontSize: 11, fontFamily: "Inter_400Regular" },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0A0E1A" },
  topBar: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  topBarTitle: { color: "#fff", fontSize: 17, fontFamily: "Inter_600SemiBold" },
  scroll: { paddingHorizontal: 16, paddingTop: 16, gap: 12 },
  resultCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 18,
    gap: 16,
  },
  resultHeader: {
    flexDirection: "row" as const,
    alignItems: "flex-start" as const,
    gap: 12,
  },
  resultTitles: { flex: 1, gap: 4 },
  resultTitle: { fontSize: 20, fontFamily: "Inter_700Bold" },
  resultSubtitle: { color: "rgba(255,255,255,0.6)", fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
  scoreSection: { gap: 8 },
  scoreLabel: { color: "rgba(255,255,255,0.5)", fontSize: 12, fontFamily: "Inter_500Medium" },
  scoreLegend: {
    flexDirection: "row" as const,
    gap: 12,
    justifyContent: "center" as const,
    marginTop: 2,
  },
  legendItem: { color: "rgba(255,255,255,0.35)", fontSize: 11, fontFamily: "Inter_400Regular" },
  section: {
    backgroundColor: "rgba(255,255,255,0.03)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    padding: 16,
  },
  sectionHeader: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  reasonRow: {
    flexDirection: "row" as const,
    alignItems: "flex-start" as const,
    gap: 10,
    paddingVertical: 5,
  },
  reasonDot: { width: 6, height: 6, borderRadius: 3, marginTop: 6 },
  reasonText: { flex: 1, color: "rgba(255,255,255,0.7)", fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 20 },
  statsGrid: { flexDirection: "row" as const, flexWrap: "wrap" as const, gap: 8 },
  bottomActions: {
    position: "absolute" as const,
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row" as const,
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 16,
    backgroundColor: "rgba(10,14,26,0.95)",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.08)",
  },
  retakeBtn: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  retakeBtnText: { color: "rgba(255,255,255,0.6)", fontSize: 15, fontFamily: "Inter_600SemiBold" },
  uploadBtn: {
    flex: 1,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
  },
  uploadBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },
});
