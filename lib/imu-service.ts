import { Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";

let DeviceMotion: any = null;
let Accelerometer: any = null;
let Gyroscope: any = null;
if (Platform.OS !== "web") {
  const sensors = require("expo-sensors");
  DeviceMotion = sensors.DeviceMotion?.default ?? sensors.DeviceMotion;
  Accelerometer = sensors.Accelerometer;
  Gyroscope = sensors.Gyroscope;
}

export interface IMUSample {
  timestampEpochMs: number;
  relativeMs: number;
  accel: { x: number; y: number; z: number };
  gyro: { x: number; y: number; z: number };
  _debug?: {
    accelTimestampEpochMs: number;
    gyroTimestampEpochMs: number;
    syncDeltaMs: number;
    source: "devicemotion" | "merged";
  };
}

export type IMUSource = "devicemotion" | "merged_streams" | "none";

export interface IMUQualityMetrics {
  imuSource: IMUSource;
  imuFirstValidSampleEpochMs: number;
  imuAverageSyncDeltaMs: number;
  imuMaxSyncDeltaMs: number;
  imuWarmupDroppedSamples: number;
  imuZeroGyroDroppedSamples: number;
}

const SENSOR_INTERVAL_MS = 10;
const TARGET_HZ = 100;
const MAX_SAMPLES = 600_000;
const FLUSH_BATCH_SIZE = 500;
const SYNC_TOLERANCE_MS = 5;
const WARMUP_MIN_SAMPLES = 5;
const IMU_DEBUG = __DEV__;

interface TimestampedXYZ {
  x: number;
  y: number;
  z: number;
  timestampMs: number;
}

const DM_FALLBACK_WINDOW_MS = 2000;
const DM_FALLBACK_MIN_SAMPLES = 5;

interface CaptureState {
  sessionId: string;
  startMs: number;
  filePath: string;
  dirPath: string;
  sampleCount: number;
  buffer: IMUSample[];
  motionSub: { remove: () => void } | null;
  accelSub: { remove: () => void } | null;
  gyroSub: { remove: () => void } | null;
  batchIndex: number;
  flushing: boolean;
  source: IMUSource;
  firstValidSampleEpochMs: number;
  warmupDone: boolean;
  warmupDropped: number;
  zeroGyroDropped: number;
  syncDeltaSum: number;
  syncDeltaMax: number;
  syncDeltaCount: number;
  accelBuffer: TimestampedXYZ[];
  gyroBuffer: TimestampedXYZ[];
  lastEmittedTimestamp: number;
  dmFallbackChecked: boolean;
  dmFallbackTimer: ReturnType<typeof setTimeout> | null;
  dmEventsReceived: number;
}

let captureState: CaptureState | null = null;

let lastFinalStats: {
  sampleCount: number;
  durationMs: number;
  estimatedHz: number;
  targetHz: number;
  droppedSampleEstimate: number;
} | null = null;

let lastQualityMetrics: IMUQualityMetrics | null = null;

function isZeroVector(v: { x: number; y: number; z: number }): boolean {
  return v.x === 0 && v.y === 0 && v.z === 0;
}

function emitSample(
  state: CaptureState,
  accel: { x: number; y: number; z: number },
  gyro: { x: number; y: number; z: number },
  accelTs: number,
  gyroTs: number,
  source: "devicemotion" | "merged",
): void {
  if (state.sampleCount >= MAX_SAMPLES) return;

  const syncDelta = Math.abs(accelTs - gyroTs);

  if (!state.warmupDone) {
    if (isZeroVector(gyro)) {
      state.warmupDropped++;
      state.zeroGyroDropped++;
      return;
    }
    state.warmupDone = true;
  }

  if (isZeroVector(gyro) && state.sampleCount < 20) {
    state.zeroGyroDropped++;
    return;
  }

  const timestampEpochMs = Math.round((accelTs + gyroTs) / 2);

  if (timestampEpochMs <= state.lastEmittedTimestamp) {
    return;
  }

  if (state.firstValidSampleEpochMs === 0) {
    state.firstValidSampleEpochMs = timestampEpochMs;
  }

  state.lastEmittedTimestamp = timestampEpochMs;
  state.syncDeltaSum += syncDelta;
  state.syncDeltaCount++;
  if (syncDelta > state.syncDeltaMax) state.syncDeltaMax = syncDelta;

  const sample: IMUSample = {
    timestampEpochMs,
    relativeMs: timestampEpochMs - state.startMs,
    accel: { x: accel.x, y: accel.y, z: accel.z },
    gyro: { x: gyro.x, y: gyro.y, z: gyro.z },
  };

  if (IMU_DEBUG) {
    sample._debug = {
      accelTimestampEpochMs: accelTs,
      gyroTimestampEpochMs: gyroTs,
      syncDeltaMs: syncDelta,
      source,
    };
  }

  state.buffer.push(sample);
  state.sampleCount++;

  if (state.buffer.length >= FLUSH_BATCH_SIZE) {
    flushBuffer(state);
  }
}

function processMergeBuffers(state: CaptureState): void {
  const { accelBuffer, gyroBuffer } = state;
  if (accelBuffer.length === 0 || gyroBuffer.length === 0) return;

  const now = Date.now();
  const STALE_MS = 200;

  while (accelBuffer.length > 0 && (now - accelBuffer[0].timestampMs) > STALE_MS) {
    accelBuffer.shift();
  }
  while (gyroBuffer.length > 0 && (now - gyroBuffer[0].timestampMs) > STALE_MS) {
    gyroBuffer.shift();
  }

  let ai = 0;
  let gi = 0;
  const matched: Array<{ ai: number; gi: number }> = [];

  while (ai < accelBuffer.length && gi < gyroBuffer.length) {
    const aTs = accelBuffer[ai].timestampMs;
    const gTs = gyroBuffer[gi].timestampMs;
    const delta = Math.abs(aTs - gTs);

    if (delta <= SYNC_TOLERANCE_MS) {
      matched.push({ ai, gi });
      ai++;
      gi++;
    } else if (aTs < gTs) {
      ai++;
    } else {
      gi++;
    }
  }

  if (matched.length === 0) return;

  const usedAccelIndices = new Set(matched.map(m => m.ai));
  const usedGyroIndices = new Set(matched.map(m => m.gi));

  for (const { ai: aIdx, gi: gIdx } of matched) {
    const a = accelBuffer[aIdx];
    const g = gyroBuffer[gIdx];

    if (!state.warmupDone) {
      if (matched.length < WARMUP_MIN_SAMPLES) return;
    }

    emitSample(state, a, g, a.timestampMs, g.timestampMs, "merged");
  }

  const newAccel: TimestampedXYZ[] = [];
  for (let i = 0; i < accelBuffer.length; i++) {
    if (!usedAccelIndices.has(i) && i >= (matched[matched.length - 1]?.ai ?? 0)) {
      newAccel.push(accelBuffer[i]);
    }
  }
  state.accelBuffer = newAccel;

  const newGyro: TimestampedXYZ[] = [];
  for (let i = 0; i < gyroBuffer.length; i++) {
    if (!usedGyroIndices.has(i) && i >= (matched[matched.length - 1]?.gi ?? 0)) {
      newGyro.push(gyroBuffer[i]);
    }
  }
  state.gyroBuffer = newGyro;
}

async function flushBuffer(state: CaptureState): Promise<void> {
  if (state.buffer.length === 0 || state.flushing) return;
  state.flushing = true;
  const batch = state.buffer.splice(0, state.buffer.length);

  const lines: string[] = [];
  for (const s of batch) {
    if (!IMU_DEBUG && s._debug) {
      const { _debug, ...clean } = s;
      lines.push(JSON.stringify(clean));
    } else {
      lines.push(JSON.stringify(s));
    }
  }
  const jsonl = lines.join("\n") + "\n";

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

let sensorToEpochOffset: number | null = null;

function calibrateSensorTimestamp(sensorTimestamp: number): void {
  if (sensorToEpochOffset !== null) return;
  const now = Date.now();
  if (sensorTimestamp > 1e12) {
    sensorToEpochOffset = 0;
  } else if (sensorTimestamp > 1e9) {
    sensorToEpochOffset = now - Math.round(sensorTimestamp * 1000);
  } else if (sensorTimestamp > 0) {
    sensorToEpochOffset = now - Math.round(sensorTimestamp * 1000);
  } else {
    sensorToEpochOffset = 0;
  }
}

function sensorTimestampToEpochMs(sensorTimestamp: number): number {
  if (sensorTimestamp == null || sensorTimestamp === 0) return Date.now();
  calibrateSensorTimestamp(sensorTimestamp);
  if (sensorTimestamp > 1e12) return Math.round(sensorTimestamp);
  if (sensorTimestamp > 0) return Math.round(sensorTimestamp * 1000) + (sensorToEpochOffset ?? 0);
  return Date.now();
}

function createCaptureState(sessionId: string, dir: string, filePath: string): CaptureState {
  return {
    sessionId,
    startMs: Date.now(),
    filePath,
    dirPath: dir,
    sampleCount: 0,
    buffer: [],
    motionSub: null,
    accelSub: null,
    gyroSub: null,
    batchIndex: 0,
    flushing: false,
    source: "none",
    firstValidSampleEpochMs: 0,
    warmupDone: false,
    warmupDropped: 0,
    zeroGyroDropped: 0,
    syncDeltaSum: 0,
    syncDeltaMax: 0,
    syncDeltaCount: 0,
    accelBuffer: [],
    gyroBuffer: [],
    lastEmittedTimestamp: 0,
    dmFallbackChecked: false,
    dmFallbackTimer: null,
    dmEventsReceived: 0,
  };
}

function tryFallbackToMergedStreams(state: CaptureState): void {
  if (state.dmFallbackChecked) return;
  state.dmFallbackChecked = true;

  if (state.sampleCount >= DM_FALLBACK_MIN_SAMPLES) return;

  console.warn(`[IMU] DeviceMotion produced only ${state.sampleCount} valid samples in ${DM_FALLBACK_WINDOW_MS}ms — falling back to merged streams`);

  if (state.motionSub) {
    state.motionSub.remove();
    state.motionSub = null;
  }

  sensorToEpochOffset = null;
  startMergedStreamCapture(state);
}

async function startDeviceMotionCapture(state: CaptureState): Promise<boolean> {
  if (!DeviceMotion) return false;

  try {
    const available = await DeviceMotion.isAvailableAsync();
    if (!available) {
      console.log("[IMU] DeviceMotion not available on this device");
      return false;
    }
  } catch {
    console.log("[IMU] DeviceMotion availability check failed");
    return false;
  }

  DeviceMotion.setUpdateInterval(SENSOR_INTERVAL_MS);
  state.source = "devicemotion";

  state.motionSub = DeviceMotion.addListener((data: any) => {
    if (!captureState || captureState !== state) return;
    if (state.sampleCount >= MAX_SAMPLES) return;

    state.dmEventsReceived++;

    const accel = data.acceleration;
    const rotRate = data.rotationRate;
    if (!accel || !rotRate) {
      state.warmupDropped++;
      return;
    }

    const accelTs = accel.timestamp != null
      ? sensorTimestampToEpochMs(accel.timestamp)
      : Date.now();
    const gyroTs = rotRate.timestamp != null
      ? sensorTimestampToEpochMs(rotRate.timestamp)
      : accelTs;

    emitSample(
      state,
      { x: accel.x, y: accel.y, z: accel.z },
      { x: rotRate.alpha, y: rotRate.beta, z: rotRate.gamma },
      accelTs,
      gyroTs,
      "devicemotion",
    );
  });

  state.dmFallbackTimer = setTimeout(() => {
    if (captureState === state && !state.dmFallbackChecked) {
      tryFallbackToMergedStreams(state);
    }
  }, DM_FALLBACK_WINDOW_MS);

  console.log(`[IMU] DeviceMotion capture started (target ${TARGET_HZ}Hz, fallback check in ${DM_FALLBACK_WINDOW_MS}ms)`);
  return true;
}

function startMergedStreamCapture(state: CaptureState): void {
  if (!Accelerometer || !Gyroscope) return;

  state.source = "merged_streams";
  Accelerometer.setUpdateInterval(SENSOR_INTERVAL_MS);
  Gyroscope.setUpdateInterval(SENSOR_INTERVAL_MS);

  state.gyroSub = Gyroscope.addListener(
    (data: { x: number; y: number; z: number; timestamp?: number }) => {
      if (!captureState || captureState !== state) return;
      const ts = data.timestamp != null
        ? sensorTimestampToEpochMs(data.timestamp)
        : Date.now();
      state.gyroBuffer.push({ x: data.x, y: data.y, z: data.z, timestampMs: ts });

      if (state.gyroBuffer.length > 200) {
        state.gyroBuffer = state.gyroBuffer.slice(-100);
      }

      processMergeBuffers(state);
    },
  );

  state.accelSub = Accelerometer.addListener(
    (data: { x: number; y: number; z: number; timestamp?: number }) => {
      if (!captureState || captureState !== state) return;
      const ts = data.timestamp != null
        ? sensorTimestampToEpochMs(data.timestamp)
        : Date.now();
      state.accelBuffer.push({ x: data.x, y: data.y, z: data.z, timestampMs: ts });

      if (state.accelBuffer.length > 200) {
        state.accelBuffer = state.accelBuffer.slice(-100);
      }

      processMergeBuffers(state);
    },
  );

  console.log(`[IMU] Merged stream capture started (target ${TARGET_HZ}Hz, sync tolerance ${SYNC_TOLERANCE_MS}ms)`);
}

export async function startIMUCapture(sessionId: string): Promise<void> {
  if (captureState) {
    await stopIMUCapture();
  }
  lastFinalStats = null;
  lastQualityMetrics = null;
  sensorToEpochOffset = null;

  const dir = `${FileSystem.documentDirectory ?? ""}sessions/${sessionId}/`;
  if (Platform.OS !== "web") {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
  const filePath = `${dir}imu.jsonl`;

  const state = createCaptureState(sessionId, dir, filePath);
  captureState = state;

  if (Platform.OS === "web") {
    console.log("[IMU] Web platform — sensor capture skipped, metadata-only mode");
    state.source = "none";
    return;
  }

  const dmStarted = await startDeviceMotionCapture(state);
  if (!dmStarted) {
    startMergedStreamCapture(state);
  }

  if (state.source === "none") {
    console.log("[IMU] No sensor source available");
  }
}

export async function stopIMUCapture(): Promise<void> {
  if (!captureState) return;

  const state = captureState;
  captureState = null;

  if (state.dmFallbackTimer) clearTimeout(state.dmFallbackTimer);
  if (state.motionSub) state.motionSub.remove();
  if (state.accelSub) state.accelSub.remove();
  if (state.gyroSub) state.gyroSub.remove();

  const sampleCount = state.sampleCount;
  const durationMs = Date.now() - state.startMs;
  const estimatedHz = durationMs > 0 ? (sampleCount / durationMs) * 1000 : 0;
  const expectedSamples = durationMs > 0 ? Math.round((durationMs / 1000) * TARGET_HZ) : 0;
  const droppedSampleEstimate = Math.max(0, expectedSamples - sampleCount);

  lastFinalStats = { sampleCount, durationMs, estimatedHz, targetHz: TARGET_HZ, droppedSampleEstimate };

  const avgSyncDelta = state.syncDeltaCount > 0 ? state.syncDeltaSum / state.syncDeltaCount : 0;
  lastQualityMetrics = {
    imuSource: state.source,
    imuFirstValidSampleEpochMs: state.firstValidSampleEpochMs,
    imuAverageSyncDeltaMs: Math.round(avgSyncDelta * 100) / 100,
    imuMaxSyncDeltaMs: Math.round(state.syncDeltaMax * 100) / 100,
    imuWarmupDroppedSamples: state.warmupDropped,
    imuZeroGyroDroppedSamples: state.zeroGyroDropped,
  };

  const warnings: string[] = [];
  if (sampleCount === 0) {
    warnings.push("IMU produced zero samples");
  }
  if (avgSyncDelta > SYNC_TOLERANCE_MS) {
    warnings.push(`IMU average sync delta ${avgSyncDelta.toFixed(1)}ms exceeds ${SYNC_TOLERANCE_MS}ms tolerance`);
  }
  if (state.zeroGyroDropped > 10) {
    warnings.push(`IMU dropped ${state.zeroGyroDropped} zero-gyro samples at startup`);
  }

  console.log(
    `[IMU] Stopped. Source: ${state.source}, Samples: ${sampleCount}, Duration: ${durationMs}ms, ` +
    `Hz: ${estimatedHz.toFixed(1)}, Dropped (est): ${droppedSampleEstimate}, ` +
    `AvgSync: ${avgSyncDelta.toFixed(2)}ms, MaxSync: ${state.syncDeltaMax.toFixed(2)}ms, ` +
    `WarmupDropped: ${state.warmupDropped}, ZeroGyro: ${state.zeroGyroDropped}`
  );
  if (warnings.length > 0) {
    console.warn("[IMU] Warnings:", warnings.join("; "));
  }

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

export function getIMUQualityMetrics(): IMUQualityMetrics {
  if (lastQualityMetrics) return lastQualityMetrics;
  if (captureState) {
    const avgSync = captureState.syncDeltaCount > 0
      ? captureState.syncDeltaSum / captureState.syncDeltaCount
      : 0;
    return {
      imuSource: captureState.source,
      imuFirstValidSampleEpochMs: captureState.firstValidSampleEpochMs,
      imuAverageSyncDeltaMs: Math.round(avgSync * 100) / 100,
      imuMaxSyncDeltaMs: Math.round(captureState.syncDeltaMax * 100) / 100,
      imuWarmupDroppedSamples: captureState.warmupDropped,
      imuZeroGyroDroppedSamples: captureState.zeroGyroDropped,
    };
  }
  return {
    imuSource: "none",
    imuFirstValidSampleEpochMs: 0,
    imuAverageSyncDeltaMs: 0,
    imuMaxSyncDeltaMs: 0,
    imuWarmupDroppedSamples: 0,
    imuZeroGyroDroppedSamples: 0,
  };
}

export function resetIMUStats(): void {
  lastFinalStats = null;
  lastQualityMetrics = null;
}

export function getIMUFilePath(sessionId: string): string {
  return `${FileSystem.documentDirectory ?? ""}sessions/${sessionId}/imu.jsonl`;
}
