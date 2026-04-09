import { Platform } from "react-native";
import * as FileSystem from "expo-file-system";

let Accelerometer: any = null;
let Gyroscope: any = null;
if (Platform.OS !== "web") {
  const sensors = require("expo-sensors");
  Accelerometer = sensors.Accelerometer;
  Gyroscope = sensors.Gyroscope;
}

export interface IMUSample {
  timestampEpochMs: number;
  relativeMs: number;
  accel: { x: number; y: number; z: number };
  gyro: { x: number; y: number; z: number };
}

const SENSOR_INTERVAL_MS = 20;
const MAX_SAMPLES = 300_000;

interface CaptureState {
  sessionId: string;
  startMs: number;
  filePath: string;
  samples: IMUSample[];
  accelSub: { remove: () => void } | null;
  gyroSub: { remove: () => void } | null;
  captureTimer: ReturnType<typeof setInterval> | null;
  lastAccel: { x: number; y: number; z: number };
  lastGyro: { x: number; y: number; z: number };
}

let captureState: CaptureState | null = null;

export async function startIMUCapture(sessionId: string): Promise<void> {
  if (captureState) {
    await stopIMUCapture();
  }

  const dir = `${FileSystem.documentDirectory ?? ""}sessions/${sessionId}/`;
  if (Platform.OS !== "web") {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
  const filePath = `${dir}imu.jsonl`;

  const startMs = Date.now();
  const lastAccel = { x: 0, y: 0, z: 0 };
  const lastGyro = { x: 0, y: 0, z: 0 };

  captureState = {
    sessionId,
    startMs,
    filePath,
    samples: [],
    accelSub: null,
    gyroSub: null,
    captureTimer: null,
    lastAccel,
    lastGyro,
  };

  if (Platform.OS === "web" || !Accelerometer || !Gyroscope) {
    console.log("[IMU] Web platform — sensor capture skipped, metadata-only mode");
    return;
  }

  Accelerometer.setUpdateInterval(SENSOR_INTERVAL_MS);
  Gyroscope.setUpdateInterval(SENSOR_INTERVAL_MS);

  captureState.accelSub = Accelerometer.addListener(
    (data: { x: number; y: number; z: number }) => {
      if (captureState) captureState.lastAccel = data;
    },
  );
  captureState.gyroSub = Gyroscope.addListener(
    (data: { x: number; y: number; z: number }) => {
      if (captureState) captureState.lastGyro = data;
    },
  );

  captureState.captureTimer = setInterval(() => {
    if (!captureState || captureState.samples.length >= MAX_SAMPLES) return;
    const now = Date.now();
    captureState.samples.push({
      timestampEpochMs: now,
      relativeMs: now - captureState.startMs,
      accel: { ...captureState.lastAccel },
      gyro: { ...captureState.lastGyro },
    });
  }, SENSOR_INTERVAL_MS);

  console.log(`[IMU] Started capture for session ${sessionId}`);
}

export async function stopIMUCapture(): Promise<void> {
  if (!captureState) return;

  const state = captureState;
  captureState = null;

  if (state.captureTimer) {
    clearInterval(state.captureTimer);
  }
  if (state.accelSub) {
    state.accelSub.remove();
  }
  if (state.gyroSub) {
    state.gyroSub.remove();
  }

  const sampleCount = state.samples.length;
  const durationMs = Date.now() - state.startMs;

  console.log(`[IMU] Stopped. Samples: ${sampleCount}, Duration: ${durationMs}ms, Hz: ${sampleCount > 0 ? ((sampleCount / durationMs) * 1000).toFixed(1) : 0}`);

  if (Platform.OS !== "web" && sampleCount > 0) {
    try {
      const jsonl = state.samples.map((s) => JSON.stringify(s)).join("\n") + "\n";
      await FileSystem.writeAsStringAsync(state.filePath, jsonl, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      console.log(`[IMU] Wrote ${sampleCount} samples to ${state.filePath}`);
    } catch (err) {
      console.warn("[IMU] Failed to write JSONL:", err);
    }
  }
}

export function getIMUStats(): { sampleCount: number; durationMs: number; estimatedHz: number } {
  if (!captureState) {
    return { sampleCount: 0, durationMs: 0, estimatedHz: 0 };
  }
  const durationMs = Date.now() - captureState.startMs;
  const sampleCount = captureState.samples.length;
  const estimatedHz = durationMs > 0 ? (sampleCount / durationMs) * 1000 : 0;
  return { sampleCount, durationMs, estimatedHz };
}

export function getIMUFilePath(sessionId: string): string {
  return `${FileSystem.documentDirectory ?? ""}sessions/${sessionId}/imu.jsonl`;
}
