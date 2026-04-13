import { Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";

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

const SENSOR_INTERVAL_MS = 10;
const TARGET_HZ = 100;
const MAX_SAMPLES = 600_000;
const FLUSH_BATCH_SIZE = 500;

interface CaptureState {
  sessionId: string;
  startMs: number;
  filePath: string;
  dirPath: string;
  sampleCount: number;
  buffer: IMUSample[];
  accelSub: { remove: () => void } | null;
  gyroSub: { remove: () => void } | null;
  captureTimer: ReturnType<typeof setInterval> | null;
  lastAccel: { x: number; y: number; z: number };
  lastGyro: { x: number; y: number; z: number };
  batchIndex: number;
  flushing: boolean;
}

let captureState: CaptureState | null = null;
let lastFinalStats: {
  sampleCount: number;
  durationMs: number;
  estimatedHz: number;
  targetHz: number;
  droppedSampleEstimate: number;
} | null = null;

async function flushBuffer(state: CaptureState): Promise<void> {
  if (state.buffer.length === 0 || state.flushing) return;
  state.flushing = true;
  const batch = state.buffer.splice(0, state.buffer.length);
  const jsonl = batch.map((s) => JSON.stringify(s)).join("\n") + "\n";
  try {
    const batchFile = `${state.dirPath}imu_batch_${state.batchIndex}.jsonl`;
    await FileSystem.writeAsStringAsync(batchFile, jsonl, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    state.batchIndex++;
  } catch (err) {
    console.warn("[IMU] Flush failed:", err);
  }
  state.flushing = false;
}

async function mergeBatchFiles(state: CaptureState): Promise<void> {
  if (state.batchIndex === 0) return;
  try {
    const parts: string[] = [];
    for (let i = 0; i < state.batchIndex; i++) {
      const batchFile = `${state.dirPath}imu_batch_${i}.jsonl`;
      try {
        const content = await FileSystem.readAsStringAsync(batchFile, {
          encoding: FileSystem.EncodingType.UTF8,
        });
        parts.push(content);
      } catch {}
    }
    await FileSystem.writeAsStringAsync(state.filePath, parts.join(""), {
      encoding: FileSystem.EncodingType.UTF8,
    });
    for (let i = 0; i < state.batchIndex; i++) {
      const batchFile = `${state.dirPath}imu_batch_${i}.jsonl`;
      await FileSystem.deleteAsync(batchFile, { idempotent: true }).catch(() => {});
    }
    console.log(`[IMU] Merged ${state.batchIndex} batch files into ${state.filePath}`);
  } catch (err) {
    console.warn("[IMU] Merge batch files failed:", err);
  }
}

export async function startIMUCapture(sessionId: string): Promise<void> {
  if (captureState) {
    await stopIMUCapture();
  }
  lastFinalStats = null;

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
    dirPath: dir,
    sampleCount: 0,
    buffer: [],
    accelSub: null,
    gyroSub: null,
    captureTimer: null,
    lastAccel,
    lastGyro,
    batchIndex: 0,
    flushing: false,
  };

  if (Platform.OS === "web" || !Accelerometer || !Gyroscope) {
    console.log("[IMU] Web platform — sensor capture skipped, metadata-only mode");
    return;
  }

  Accelerometer.setUpdateInterval(SENSOR_INTERVAL_MS);
  Gyroscope.setUpdateInterval(SENSOR_INTERVAL_MS);

  captureState.gyroSub = Gyroscope.addListener(
    (data: { x: number; y: number; z: number }) => {
      if (captureState) captureState.lastGyro = data;
    },
  );

  captureState.accelSub = Accelerometer.addListener(
    (data: { x: number; y: number; z: number }) => {
      if (!captureState || captureState.sampleCount >= MAX_SAMPLES) return;
      captureState.lastAccel = data;
      const now = Date.now();
      captureState.buffer.push({
        timestampEpochMs: now,
        relativeMs: now - captureState.startMs,
        accel: { ...data },
        gyro: { ...captureState.lastGyro },
      });
      captureState.sampleCount++;

      if (captureState.buffer.length >= FLUSH_BATCH_SIZE) {
        flushBuffer(captureState);
      }
    },
  );

  console.log(`[IMU] Started capture for session ${sessionId} (target ${TARGET_HZ}Hz, interval ${SENSOR_INTERVAL_MS}ms)`);
}

export async function stopIMUCapture(): Promise<void> {
  if (!captureState) return;

  const state = captureState;
  captureState = null;

  if (state.accelSub) {
    state.accelSub.remove();
  }
  if (state.gyroSub) {
    state.gyroSub.remove();
  }

  const sampleCount = state.sampleCount;
  const durationMs = Date.now() - state.startMs;
  const estimatedHz = durationMs > 0 ? (sampleCount / durationMs) * 1000 : 0;
  const expectedSamples = durationMs > 0 ? Math.round((durationMs / 1000) * TARGET_HZ) : 0;
  const droppedSampleEstimate = Math.max(0, expectedSamples - sampleCount);

  lastFinalStats = { sampleCount, durationMs, estimatedHz, targetHz: TARGET_HZ, droppedSampleEstimate };

  console.log(`[IMU] Stopped. Samples: ${sampleCount}, Duration: ${durationMs}ms, Hz: ${estimatedHz.toFixed(1)}, Dropped (est): ${droppedSampleEstimate}`);

  if (Platform.OS !== "web") {
    if (state.buffer.length > 0) {
      await flushBuffer(state);
    }
    await mergeBatchFiles(state);
  }
}

export function getIMUStats(): {
  sampleCount: number;
  durationMs: number;
  estimatedHz: number;
  targetHz: number;
  droppedSampleEstimate: number;
} {
  if (!captureState) {
    return lastFinalStats ?? { sampleCount: 0, durationMs: 0, estimatedHz: 0, targetHz: TARGET_HZ, droppedSampleEstimate: 0 };
  }
  const durationMs = Date.now() - captureState.startMs;
  const sampleCount = captureState.sampleCount;
  const estimatedHz = durationMs > 0 ? (sampleCount / durationMs) * 1000 : 0;
  const expectedSamples = durationMs > 0 ? Math.round((durationMs / 1000) * TARGET_HZ) : 0;
  const droppedSampleEstimate = Math.max(0, expectedSamples - sampleCount);
  return { sampleCount, durationMs, estimatedHz, targetHz: TARGET_HZ, droppedSampleEstimate };
}

export function resetIMUStats(): void {
  lastFinalStats = null;
}

export function getIMUFilePath(sessionId: string): string {
  return `${FileSystem.documentDirectory ?? ""}sessions/${sessionId}/imu.jsonl`;
}
