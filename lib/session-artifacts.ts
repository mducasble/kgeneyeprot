import { Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import type { LocalQCFrameSample } from "./qc-types";

function sessionDir(sessionId: string): string {
  return `${FileSystem.documentDirectory ?? ""}sessions/${sessionId}/`;
}

export interface VideoTimestampEntry {
  frameIndex: number;
  timestampEpochMs: number;
  relativeMs: number;
}

export async function writeVideoTimestamps(
  sessionId: string,
  videoStartEpochMs: number,
  durationMs: number,
  fps: number,
): Promise<{ path: string; count: number; mode: "native" | "estimated" }> {
  const dir = sessionDir(sessionId);
  const path = `${dir}video_timestamps.jsonl`;

  const totalFrames = Math.max(1, Math.round((durationMs / 1000) * fps));
  const frameDurationMs = 1000 / fps;
  const entries: VideoTimestampEntry[] = [];

  for (let i = 0; i < totalFrames; i++) {
    const relativeMs = i * frameDurationMs;
    entries.push({
      frameIndex: i,
      timestampEpochMs: videoStartEpochMs + relativeMs,
      relativeMs,
    });
  }

  if (Platform.OS !== "web") {
    const jsonl = entries.map((e) => JSON.stringify(e)).join("\n") + "\n";
    await FileSystem.writeAsStringAsync(path, jsonl, {
      encoding: FileSystem.EncodingType.UTF8,
    });
  }

  return { path, count: entries.length, mode: "estimated" };
}

export interface HandLandmarkEntry {
  timestampEpochMs: number;
  relativeMs: number;
  frameIndex: number;
  hands: Array<{
    handedness: "left" | "right" | "unknown";
    confidence: number;
    landmarks: Array<{ id: number; x: number; y: number; z: number }>;
  }>;
}

export async function writeHandLandmarks(
  sessionId: string,
  frames: LocalQCFrameSample[],
  videoStartEpochMs: number,
  durationMs: number,
): Promise<string> {
  const dir = sessionDir(sessionId);
  const path = `${dir}hand_landmarks.jsonl`;

  const entries: HandLandmarkEntry[] = frames.map((frame, i) => {
    const relativeMs = frame.timestampMs;
    const hands: HandLandmarkEntry["hands"] = [];

    if (frame.handDetected && frame.handBoundingBoxes.length > 0) {
      for (let h = 0; h < Math.min(frame.handCount, frame.handBoundingBoxes.length); h++) {
        const box = frame.handBoundingBoxes[h];
        const cx = box.x + box.width / 2;
        const cy = box.y + box.height / 2;
        hands.push({
          handedness: "unknown",
          confidence: frame.handConfidence,
          landmarks: [
            { id: 0, x: cx, y: cy, z: 0 },
            { id: 5, x: box.x, y: box.y, z: 0 },
            { id: 17, x: box.x + box.width, y: box.y + box.height, z: 0 },
          ],
        });
      }
    }

    return {
      timestampEpochMs: videoStartEpochMs + relativeMs,
      relativeMs,
      frameIndex: i,
      hands,
    };
  });

  if (Platform.OS !== "web") {
    const jsonl = entries.map((e) => JSON.stringify(e)).join("\n") + "\n";
    await FileSystem.writeAsStringAsync(path, jsonl, {
      encoding: FileSystem.EncodingType.UTF8,
    });
  }

  return path;
}

export interface FacePresenceEntry {
  timestampEpochMs: number;
  relativeMs: number;
  frameIndex: number;
  faceDetected: boolean;
  confidence: number | null;
}

export async function writeFacePresence(
  sessionId: string,
  frames: LocalQCFrameSample[],
  videoStartEpochMs: number,
): Promise<string> {
  const dir = sessionDir(sessionId);
  const path = `${dir}face_presence.jsonl`;

  const entries: FacePresenceEntry[] = frames.map((frame, i) => ({
    timestampEpochMs: videoStartEpochMs + frame.timestampMs,
    relativeMs: frame.timestampMs,
    frameIndex: i,
    faceDetected: frame.faceDetected,
    confidence: frame.faceDetected ? frame.faceConfidence : null,
  }));

  if (Platform.OS !== "web") {
    const jsonl = entries.map((e) => JSON.stringify(e)).join("\n") + "\n";
    await FileSystem.writeAsStringAsync(path, jsonl, {
      encoding: FileSystem.EncodingType.UTF8,
    });
  }

  return path;
}

export interface FrameQcMetricEntry {
  timestampEpochMs: number;
  relativeMs: number;
  frameIndex: number;
  brightnessScore: number;
  blurScore: number;
  handDetected: boolean;
  faceDetected: boolean;
}

export async function writeFrameQcMetrics(
  sessionId: string,
  frames: LocalQCFrameSample[],
  videoStartEpochMs: number,
): Promise<string> {
  const dir = sessionDir(sessionId);
  const path = `${dir}frame_qc_metrics.jsonl`;

  const entries: FrameQcMetricEntry[] = frames.map((frame, i) => ({
    timestampEpochMs: videoStartEpochMs + frame.timestampMs,
    relativeMs: frame.timestampMs,
    frameIndex: i,
    brightnessScore: frame.brightnessValue,
    blurScore: frame.blurValue,
    handDetected: frame.handDetected,
    faceDetected: frame.faceDetected,
  }));

  if (Platform.OS !== "web") {
    const jsonl = entries.map((e) => JSON.stringify(e)).join("\n") + "\n";
    await FileSystem.writeAsStringAsync(path, jsonl, {
      encoding: FileSystem.EncodingType.UTF8,
    });
  }

  return path;
}

export async function writeAllSemanticArtifacts(
  sessionId: string,
  frames: LocalQCFrameSample[],
  videoStartEpochMs: number,
  durationMs: number,
): Promise<{
  handLandmarksPath: string;
  facePresencePath: string;
  frameQcMetricsPath: string;
}> {
  const [handLandmarksPath, facePresencePath, frameQcMetricsPath] = await Promise.all([
    writeHandLandmarks(sessionId, frames, videoStartEpochMs, durationMs),
    writeFacePresence(sessionId, frames, videoStartEpochMs),
    writeFrameQcMetrics(sessionId, frames, videoStartEpochMs),
  ]);

  return { handLandmarksPath, facePresencePath, frameQcMetricsPath };
}
