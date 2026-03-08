import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Platform,
  ActivityIndicator,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { CameraView, useCameraPermissions, useMicrophonePermissions } from "expo-camera";
import { useRecordings } from "@/lib/recordings-context";
import Colors from "@/constants/colors";

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

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const cleanupTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const handleStartRecording = async () => {
    if (!cameraRef.current) return;
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    setIsRecording(true);
    setRecordingTime(0);
    startTimeRef.current = Date.now();

    timerRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
      setRecordingTime(elapsed);
    }, 1000);

    try {
      const video = await cameraRef.current.recordAsync({ maxDuration: 600 });
      cleanupTimer();
      const duration = Math.max(1, Math.floor((Date.now() - startTimeRef.current) / 1000));

      if (video?.uri) {
        const id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
        const recording = {
          id,
          questId: questId || "",
          questTitle: questTitle || "Unknown Quest",
          uri: video.uri,
          duration,
          fileSize: Math.floor(Math.random() * 50 * 1024 * 1024) + 5 * 1024 * 1024,
          createdAt: Date.now(),
          uploadStatus: "queued" as const,
        };
        addRecording(recording);
        if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.back();
        router.back();
      }
    } catch (err) {
      console.error("Recording error:", err);
      cleanupTimer();
      setIsRecording(false);
    }
  };

  const handleStopRecording = () => {
    if (!cameraRef.current) return;
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    cleanupTimer();
    setIsRecording(false);
    cameraRef.current.stopRecording();
  };

  const handleSimulateRecording = () => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
    const recording = {
      id,
      questId: questId || "",
      questTitle: questTitle || "Unknown Quest",
      uri: `file://simulated_recording_${id}.mp4`,
      duration: Math.floor(Math.random() * 120) + 30,
      fileSize: Math.floor(Math.random() * 50 * 1024 * 1024) + 5 * 1024 * 1024,
      createdAt: Date.now(),
      uploadStatus: "queued" as const,
    };
    addRecording(recording);
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.back();
    router.back();
  };

  if (!cameraPermission || !micPermission) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  const needsPermission = !cameraPermission.granted || !micPermission.granted;

  if (needsPermission || Platform.OS === "web") {
    return (
      <View style={[styles.container, { backgroundColor: Colors.dark.background }]}>
        <View style={[styles.topBar, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 0) + 8 }]}>
          <Pressable
            style={({ pressed }) => [styles.topBtn, { opacity: pressed ? 0.7 : 1 }]}
            onPress={() => router.back()}
          >
            <Ionicons name="close" size={26} color="#fff" />
          </Pressable>
        </View>

        <View style={styles.permissionContent}>
          <View style={[styles.permissionIcon, { backgroundColor: Colors.primary + "20" }]}>
            <Ionicons name="videocam" size={48} color={Colors.primary} />
          </View>
          <Text style={styles.permissionTitle}>Camera Access Required</Text>
          <Text style={styles.permissionSubtitle}>
            {Platform.OS === "web"
              ? "Video recording is not available on web. You can simulate a recording for testing."
              : "Grant camera and microphone access to record quest videos."}
          </Text>

          {Platform.OS !== "web" && !cameraPermission.granted && (
            <Pressable
              style={({ pressed }) => [
                styles.permissionBtn,
                { backgroundColor: Colors.primary, opacity: pressed ? 0.9 : 1 },
              ]}
              onPress={requestCameraPermission}
            >
              <Text style={styles.permissionBtnText}>Allow Camera</Text>
            </Pressable>
          )}

          {Platform.OS !== "web" && cameraPermission.granted && !micPermission.granted && (
            <Pressable
              style={({ pressed }) => [
                styles.permissionBtn,
                { backgroundColor: Colors.primary, opacity: pressed ? 0.9 : 1 },
              ]}
              onPress={requestMicPermission}
            >
              <Text style={styles.permissionBtnText}>Allow Microphone</Text>
            </Pressable>
          )}

          <Pressable
            style={({ pressed }) => [
              styles.simulateBtn,
              { backgroundColor: Colors.accent + "20", opacity: pressed ? 0.9 : 1 },
            ]}
            onPress={handleSimulateRecording}
          >
            <Ionicons name="flask-outline" size={20} color={Colors.accent} />
            <Text style={[styles.simulateBtnText, { color: Colors.accent }]}>
              Simulate Recording
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: "#000" }]}>
      <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing={facing}
        mode="video"
      >
        <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
          <Pressable
            style={({ pressed }) => [styles.topBtn, { opacity: pressed ? 0.7 : 1 }]}
            onPress={() => {
              if (isRecording) handleStopRecording();
              router.back();
            }}
          >
            <Ionicons name="close" size={26} color="#fff" />
          </Pressable>

          {isRecording && (
            <View style={styles.timerBadge}>
              <View style={styles.recordDot} />
              <Text style={styles.timerText}>{formatTime(recordingTime)}</Text>
            </View>
          )}

          <Pressable
            style={({ pressed }) => [styles.topBtn, { opacity: pressed ? 0.7 : 1 }]}
            onPress={() => setFacing((f) => (f === "back" ? "front" : "back"))}
          >
            <Ionicons name="camera-reverse-outline" size={24} color="#fff" />
          </Pressable>
        </View>

        <View style={[styles.questLabel, { backgroundColor: "rgba(0,0,0,0.6)" }]}>
          <Text style={styles.questLabelText} numberOfLines={1}>
            {questTitle || "Recording"}
          </Text>
        </View>

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
        </View>
      </CameraView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: "center" as const, justifyContent: "center" as const, backgroundColor: "#000" },
  camera: { flex: 1 },
  topBar: {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    alignItems: "center" as const,
    paddingHorizontal: 16,
    paddingBottom: 8,
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
  recordDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#EF4444",
  },
  timerText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
  questLabel: {
    position: "absolute" as const,
    bottom: 140,
    left: 20,
    right: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: "center" as const,
  },
  questLabelText: { color: "#fff", fontSize: 14, fontFamily: "Inter_500Medium" },
  controls: {
    position: "absolute" as const,
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: "center" as const,
  },
  recordBtn: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 4,
    borderColor: "#fff",
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  recordBtnInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#EF4444",
  },
  stopButton: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 4,
    borderColor: "#fff",
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  stopSquare: {
    width: 30,
    height: 30,
    borderRadius: 4,
    backgroundColor: "#EF4444",
  },
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
  permissionTitle: {
    color: "#fff",
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    textAlign: "center" as const,
  },
  permissionSubtitle: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    textAlign: "center" as const,
    lineHeight: 22,
  },
  permissionBtn: {
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 14,
    marginTop: 8,
  },
  permissionBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
  simulateBtn: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 4,
  },
  simulateBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
});
