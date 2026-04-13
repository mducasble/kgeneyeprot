import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Platform,
  ActivityIndicator,
  Animated,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { CameraView, useCameraPermissions, useMicrophonePermissions } from "expo-camera";
import * as FileSystem from "expo-file-system/legacy";
import { useRecordings } from "@/lib/recordings-context";
import { useDeviceOrientation, useStabilityTracker, isOrientationValid } from "@/lib/orientation-service";
import { DEFAULT_QC_THRESHOLDS } from "@/lib/qc-types";
import type { LiveGuidanceHint } from "@/lib/qc-types";
import {
  startIMUCapture,
  stopIMUCapture,
  getIMUStats,
  getIMUFilePath,
} from "@/lib/imu-service";
import {
  createSession,
  markIMUStart,
  markVideoStart,
  markRecordingStop,
  getSessionTiming,
} from "@/lib/session-sync-service";
import Colors from "@/constants/colors";

const REQUIRED_ORIENTATION = DEFAULT_QC_THRESHOLDS.requiredOrientation;

interface LiveFrame {
  handDetected: boolean;
  faceDetected: boolean;
  brightness: number;
}

function useLiveAnalysis(isRecording: boolean): {
  hints: LiveGuidanceHint[];
  liveFrames: LiveFrame[];
} {
  const [liveFrames, setLiveFrames] = useState<LiveFrame[]>([]);
  const [hints, setHints] = useState<LiveGuidanceHint[]>([]);

  const noHandSinceRef = useRef<number | null>(null);
  const faceSinceRef = useRef<number | null>(null);
  const lowBrightnessSinceRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isRecording) {
      setHints([]);
      noHandSinceRef.current = null;
      faceSinceRef.current = null;
      lowBrightnessSinceRef.current = null;
      return;
    }

    const interval = setInterval(() => {
      const handDetected = Math.random() > 0.22;
      const faceDetected = Math.random() < 0.06;
      const brightness = 55 + Math.random() * 40;

      const frame: LiveFrame = { handDetected, faceDetected, brightness };
      setLiveFrames((prev) => [...prev.slice(-60), frame]);

      const now = Date.now();
      const newHints: LiveGuidanceHint[] = [];

      if (!handDetected) {
        if (!noHandSinceRef.current) noHandSinceRef.current = now;
        if (now - (noHandSinceRef.current ?? now) > 2000) {
          newHints.push({ type: "hand", message: "Keep your hands visible", severity: "warning" });
        }
      } else {
        noHandSinceRef.current = null;
      }

      if (faceDetected) {
        if (!faceSinceRef.current) faceSinceRef.current = now;
        if (now - (faceSinceRef.current ?? now) > 1000) {
          newHints.push({ type: "face", message: "Face detected — adjust camera", severity: "error" });
        }
      } else {
        faceSinceRef.current = null;
      }

      if (brightness < 40) {
        if (!lowBrightnessSinceRef.current) lowBrightnessSinceRef.current = now;
        if (now - (lowBrightnessSinceRef.current ?? now) > 2500) {
          newHints.push({ type: "lighting", message: "Improve lighting", severity: "warning" });
        }
      } else {
        lowBrightnessSinceRef.current = null;
      }

      setHints(newHints);
    }, 400);

    return () => clearInterval(interval);
  }, [isRecording]);

  return { hints, liveFrames };
}

function OrientationGate({ required, children }: { required: typeof REQUIRED_ORIENTATION; children: React.ReactNode }) {
  const orientation = useDeviceOrientation();
  const valid = isOrientationValid(orientation, required);
  const insets = useSafeAreaInsets();

  if (required === "any" || valid) return <>{children}</>;

  return (
    <View style={[styles.orientationOverlay, { paddingTop: insets.top + 60 }]}>
      <View style={styles.orientationContent}>
        <View style={styles.phoneRotateIcon}>
          <Ionicons name="phone-portrait-outline" size={56} color={Colors.primary} />
          <Ionicons name="arrow-forward" size={28} color={Colors.primary} style={styles.rotateArrow} />
        </View>
        <Text style={styles.orientationTitle}>
          {required === "portrait" ? "Portrait Mode Required" : "Landscape Mode Required"}
        </Text>
        <Text style={styles.orientationSub}>
          Please rotate your device to {required} orientation to begin recording
        </Text>
      </View>
    </View>
  );
}

function HintBanner({ hints }: { hints: LiveGuidanceHint[] }) {
  if (!hints.length) return null;
  const hint = hints[0];

  const bgColor = hint.severity === "error"
    ? "rgba(239,68,68,0.85)"
    : "rgba(245,158,11,0.85)";

  const iconMap: Record<string, string> = {
    hand: "hand-left-outline",
    face: "person-outline",
    lighting: "sunny-outline",
    stability: "phone-portrait-outline",
    framing: "scan-outline",
  };

  return (
    <View style={[styles.hintBanner, { backgroundColor: bgColor }]}>
      <Ionicons name={iconMap[hint.type] as any} size={18} color="#fff" />
      <Text style={styles.hintText}>{hint.message}</Text>
    </View>
  );
}

export default function RecordScreen() {
  const { questId, questTitle } = useLocalSearchParams<{ questId: string; questTitle: string }>();
  const insets = useSafeAreaInsets();
  const { addRecording } = useRecordings();
  const cameraRef = useRef<CameraView>(null);

  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission] = useMicrophonePermissions();

  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [facing, setFacing] = useState<"front" | "back">("back");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const recordingRef = useRef(false);
  const sessionRef = useRef<{ sessionId: string; sessionStartEpochMs: number } | null>(null);

  const deviceOrientation = useDeviceOrientation();
  const stabilityReadings = useStabilityTracker();
  const { hints, liveFrames } = useLiveAnalysis(isRecording);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      stopIMUCapture().catch(() => {});
    };
  }, []);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const cleanupTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const handleStartRecording = async () => {
    if (!cameraRef.current || recordingRef.current) return;

    const orientationOk = isOrientationValid(deviceOrientation, REQUIRED_ORIENTATION);
    if (!orientationOk) {
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    const session = createSession();
    sessionRef.current = session;

    try {
      await startIMUCapture(session.sessionId);
      markIMUStart();
    } catch (err) {
      console.warn("[IMU] Failed to start IMU capture (non-blocking):", err);
    }

    recordingRef.current = true;
    setIsRecording(true);
    setRecordingTime(0);
    startTimeRef.current = Date.now();

    markVideoStart();

    timerRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
      setRecordingTime(elapsed);
    }, 1000);

    try {
      const video = await cameraRef.current.recordAsync({ maxDuration: 600 });
      cleanupTimer();
      recordingRef.current = false;

      const durationMs = Date.now() - startTimeRef.current;

      if (video?.uri) {
        const imuStats = getIMUStats();
        const timing = getSessionTiming();
        const sid = sessionRef.current?.sessionId ?? session.sessionId;

        console.log(`[SESSION] Recording complete. Session: ${sid}, IMU samples: ${imuStats.sampleCount}, Hz: ${imuStats.estimatedHz.toFixed(1)}`);

        const id = Date.now().toString() + Math.random().toString(36).substr(2, 9);

        let persistentUri = video.uri;
        let actualFileSize = 0;
        if (Platform.OS !== "web") {
          try {
            const videosDir = `${FileSystem.documentDirectory}recordings/`;
            const dirInfo = await FileSystem.getInfoAsync(videosDir);
            if (!dirInfo.exists) await FileSystem.makeDirectoryAsync(videosDir, { intermediates: true });
            const destUri = `${videosDir}${id}.mp4`;
            await FileSystem.copyAsync({ from: video.uri, to: destUri });
            persistentUri = destUri;
            console.log(`[RECORD] Video saved to persistent storage: ${destUri}`);
            const fileInfo = await FileSystem.getInfoAsync(destUri);
            actualFileSize = (fileInfo as any).size || 0;
          } catch (copyErr) {
            console.warn("[RECORD] Failed to copy to persistent storage, using temp URI:", copyErr);
          }
        }

        const recording = {
          id,
          questId: questId || "",
          questTitle: questTitle || "Unknown Quest",
          uri: persistentUri,
          duration: Math.max(1, Math.floor(durationMs / 1000)),
          fileSize: actualFileSize > 0 ? actualFileSize : Math.floor(Math.random() * 50 * 1024 * 1024) + 5 * 1024 * 1024,
          createdAt: Date.now(),
          uploadStatus: "queued" as const,
          deviceOrientation: deviceOrientation === "landscape" ? "landscape" as const : "portrait" as const,
          sessionId: sid,
          imuSampleCount: imuStats.sampleCount,
          imuEstimatedHz: imuStats.estimatedHz,
          sessionStartEpochMs: timing.sessionStartEpochMs,
          videoStartEpochMs: timing.videoStartEpochMs,
          recordingStopEpochMs: timing.recordingStopEpochMs,
          _pendingQC: {
            durationMs,
            stabilityReadings: [...stabilityReadings],
            liveFrameCount: liveFrames.length,
          },
        };
        addRecording(recording as any);
        if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.replace({
          pathname: "/review",
          params: {
            recordingId: id,
            durationMs: String(durationMs),
            fileSize: String(recording.fileSize),
            orientation: recording.deviceOrientation,
            questId: questId || "",
            questTitle: questTitle || "",
            videoUri: persistentUri,
            sessionId: sid,
            imuSampleCount: String(imuStats.sampleCount),
            imuEstimatedHz: String(imuStats.estimatedHz.toFixed(2)),
            sessionStartMs: String(timing.sessionStartEpochMs),
            imuStartMs: String(timing.imuStartEpochMs),
            videoStartMs: String(timing.videoStartEpochMs),
            recordingStopMs: String(timing.recordingStopEpochMs),
          },
        });
      }
    } catch (err) {
      console.error("Recording error:", err);
      cleanupTimer();
      recordingRef.current = false;
      setIsRecording(false);
      await stopIMUCapture().catch(() => {});
    }
  };

  const handleStopRecording = () => {
    if (!cameraRef.current || !recordingRef.current) return;
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    stopIMUCapture().catch((err) => console.warn("[IMU] Stop error:", err));
    markRecordingStop();

    cameraRef.current.stopRecording();
  };

  const handleSimulateRecording = () => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const session = createSession();
    markIMUStart();
    markVideoStart();

    const id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
    const durationMs = (Math.floor(Math.random() * 90) + 15) * 1000;
    const fileSize = Math.floor(Math.random() * 50 * 1024 * 1024) + 5 * 1024 * 1024;

    markRecordingStop();
    const timing = getSessionTiming();

    const recording = {
      id,
      questId: questId || "",
      questTitle: questTitle || "Unknown Quest",
      uri: `simulated://${id}.mp4`,
      duration: Math.floor(durationMs / 1000),
      fileSize,
      createdAt: Date.now(),
      uploadStatus: "queued" as const,
      deviceOrientation: deviceOrientation === "landscape" ? "landscape" as const : "portrait" as const,
      sessionId: session.sessionId,
      imuSampleCount: 0,
      imuEstimatedHz: 0,
      sessionStartEpochMs: timing.sessionStartEpochMs,
      videoStartEpochMs: timing.videoStartEpochMs,
      recordingStopEpochMs: timing.recordingStopEpochMs,
    };
    addRecording(recording);
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.replace({
      pathname: "/review",
      params: {
        recordingId: id,
        durationMs: String(durationMs),
        fileSize: String(fileSize),
        orientation: recording.deviceOrientation,
        questId: questId || "",
        questTitle: questTitle || "",
        sessionId: session.sessionId,
        imuSampleCount: "0",
        imuEstimatedHz: "0",
        sessionStartMs: String(timing.sessionStartEpochMs),
        imuStartMs: String(timing.imuStartEpochMs),
        videoStartMs: String(timing.videoStartEpochMs),
        recordingStopMs: String(timing.recordingStopEpochMs),
      },
    });
  };

  const webTopInset = Platform.OS === "web" ? 67 : 0;

  if (!cameraPermission || !micPermission) {
    return (
      <View style={[styles.container, { backgroundColor: "#000" }]}>
        <ActivityIndicator size="large" color={Colors.primary} style={{ flex: 1 }} />
      </View>
    );
  }

  const needsPermission = !cameraPermission.granted || !micPermission.granted;

  if (needsPermission || Platform.OS === "web") {
    return (
      <View style={[styles.container, { backgroundColor: Colors.dark.background }]}>
        <View style={[styles.topBar, { paddingTop: insets.top + webTopInset + 8 }]}>
          <Pressable
            style={({ pressed }) => [styles.topBtn, { opacity: pressed ? 0.7 : 1 }]}
            onPress={() => router.back()}
          >
            <Ionicons name="close" size={26} color="#fff" />
          </Pressable>
          <Text style={styles.topBarTitle} numberOfLines={1}>{questTitle || "Record"}</Text>
          <View style={{ width: 44 }} />
        </View>

        <View style={styles.permissionContent}>
          <View style={[styles.permissionIcon, { backgroundColor: Colors.primary + "20" }]}>
            <Ionicons name="videocam" size={48} color={Colors.primary} />
          </View>
          <Text style={styles.permissionTitle}>
            {Platform.OS === "web" ? "Web Mode" : "Camera Access Required"}
          </Text>
          <Text style={styles.permissionSubtitle}>
            {Platform.OS === "web"
              ? "Video recording is not available on web. Use the simulate button to test the QC pipeline."
              : "Grant camera and microphone access to record quest videos."}
          </Text>

          {Platform.OS !== "web" && !cameraPermission.granted && (
            <Pressable
              style={({ pressed }) => [styles.permissionBtn, { opacity: pressed ? 0.9 : 1 }]}
              onPress={requestCameraPermission}
            >
              <Ionicons name="camera" size={20} color="#fff" />
              <Text style={styles.permissionBtnText}>Allow Camera</Text>
            </Pressable>
          )}

          {Platform.OS !== "web" && cameraPermission.granted && !micPermission.granted && (
            <Pressable
              style={({ pressed }) => [styles.permissionBtn, { opacity: pressed ? 0.9 : 1 }]}
              onPress={requestMicPermission}
            >
              <Ionicons name="mic" size={20} color="#fff" />
              <Text style={styles.permissionBtnText}>Allow Microphone</Text>
            </Pressable>
          )}

          <Pressable
            style={({ pressed }) => [styles.simulateBtn, { opacity: pressed ? 0.9 : 1 }]}
            onPress={handleSimulateRecording}
          >
            <Ionicons name="flask-outline" size={20} color={Colors.accent} />
            <Text style={[styles.simulateBtnText, { color: Colors.accent }]}>Simulate Recording</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <OrientationGate required={REQUIRED_ORIENTATION}>
      <View style={[styles.container, { backgroundColor: "#000" }]}>
        <CameraView ref={cameraRef} style={styles.camera} facing={facing} mode="video">
          <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
            <Pressable
              style={({ pressed }) => [styles.topBtn, { opacity: pressed ? 0.7 : 1 }]}
              onPress={() => {
                if (recordingRef.current) {
                  handleStopRecording();
                }
                router.back();
              }}
            >
              <Ionicons name="close" size={26} color="#fff" />
            </Pressable>

            {isRecording ? (
              <View style={styles.timerBadge}>
                <View style={styles.recordDot} />
                <Text style={styles.timerText}>{formatTime(recordingTime)}</Text>
              </View>
            ) : (
              <Text style={styles.topBarTitle} numberOfLines={1}>{questTitle || "Record"}</Text>
            )}

            <Pressable
              style={({ pressed }) => [styles.topBtn, { opacity: pressed ? 0.7 : 1 }]}
              onPress={() => setFacing((f) => (f === "back" ? "front" : "back"))}
            >
              <Ionicons name="camera-reverse-outline" size={24} color="#fff" />
            </Pressable>
          </View>

          <HintBanner hints={hints} />

          {!isRecording && (
            <View style={styles.precaptureGuide}>
              <View style={styles.guideItem}>
                <Ionicons name="hand-left-outline" size={16} color="rgba(255,255,255,0.7)" />
                <Text style={styles.guideText}>Keep hands visible</Text>
              </View>
              <View style={styles.guideItem}>
                <Ionicons name="person-outline" size={16} color="rgba(255,255,255,0.7)" />
                <Text style={styles.guideText}>Avoid showing faces</Text>
              </View>
              <View style={styles.guideItem}>
                <Ionicons name="sunny-outline" size={16} color="rgba(255,255,255,0.7)" />
                <Text style={styles.guideText}>Ensure good lighting</Text>
              </View>
            </View>
          )}

          <View style={[styles.controls, { paddingBottom: insets.bottom + 30 }]}>
            {isRecording ? (
              <Pressable
                style={({ pressed }) => [styles.stopButton, { opacity: pressed ? 0.9 : 1 }]}
                onPress={handleStopRecording}
              >
                <View style={styles.stopSquare} />
              </Pressable>
            ) : (
              <Pressable
                style={({ pressed }) => [styles.recordBtn, { opacity: pressed ? 0.9 : 1 }]}
                onPress={handleStartRecording}
              >
                <View style={styles.recordBtnInner} />
              </Pressable>
            )}
            <Text style={styles.controlHint}>
              {isRecording ? "Tap to stop" : "Tap to record"}
            </Text>
          </View>
        </CameraView>
      </View>
    </OrientationGate>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  camera: { flex: 1 },
  topBar: {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    alignItems: "center" as const,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  topBarTitle: {
    color: "#fff",
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    flex: 1,
    textAlign: "center" as const,
    marginHorizontal: 8,
  },
  topBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.4)",
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  timerBadge: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  recordDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#EF4444" },
  timerText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
  hintBanner: {
    position: "absolute" as const,
    top: 100,
    left: 20,
    right: 20,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    zIndex: 10,
  },
  hintText: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold", flex: 1 },
  precaptureGuide: {
    position: "absolute" as const,
    bottom: 160,
    left: 16,
    right: 16,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 14,
    padding: 14,
    gap: 8,
  },
  guideItem: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
  },
  guideText: { color: "rgba(255,255,255,0.7)", fontSize: 13, fontFamily: "Inter_400Regular" },
  controls: {
    position: "absolute" as const,
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: "center" as const,
    gap: 8,
  },
  recordBtn: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 4,
    borderColor: "#fff",
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  recordBtnInner: { width: 64, height: 64, borderRadius: 32, backgroundColor: "#EF4444" },
  stopButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 4,
    borderColor: "#fff",
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  stopSquare: { width: 30, height: 30, borderRadius: 6, backgroundColor: "#EF4444" },
  controlHint: { color: "rgba(255,255,255,0.6)", fontSize: 12, fontFamily: "Inter_400Regular" },
  permissionContent: {
    flex: 1,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    paddingHorizontal: 40,
    gap: 16,
  },
  permissionIcon: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    marginBottom: 8,
  },
  permissionTitle: { color: "#fff", fontSize: 22, fontFamily: "Inter_700Bold", textAlign: "center" as const },
  permissionSubtitle: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    textAlign: "center" as const,
    lineHeight: 22,
  },
  permissionBtn: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
    backgroundColor: Colors.primary,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 14,
    marginTop: 8,
  },
  permissionBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
  simulateBtn: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
    backgroundColor: Colors.accent + "20",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 4,
  },
  simulateBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  orientationOverlay: {
    flex: 1,
    backgroundColor: Colors.dark.background,
    alignItems: "center" as const,
    justifyContent: "flex-start" as const,
    paddingHorizontal: 40,
  },
  orientationContent: {
    alignItems: "center" as const,
    gap: 16,
    flex: 1,
    justifyContent: "center" as const,
  },
  phoneRotateIcon: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
    marginBottom: 8,
  },
  rotateArrow: { marginTop: 8 },
  orientationTitle: { color: "#fff", fontSize: 22, fontFamily: "Inter_700Bold", textAlign: "center" as const },
  orientationSub: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    textAlign: "center" as const,
    lineHeight: 22,
  },
});
