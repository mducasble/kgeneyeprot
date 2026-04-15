/**
 * Native camera service — wraps the KGenCameraRecorder Swift module.
 *
 * When available (iOS + native module compiled), this replaces:
 *   - expo-camera recordAsync()
 *   - lib/imu-service.ts startIMUCapture/stopIMUCapture
 *   - lib/advanced-capture-service.ts startAdvancedCapture/stopAdvancedCapture
 *
 * Everything runs in Swift: ARSession (camera + head pose + calibration),
 * CMMotionManager (100 Hz IMU), AVAssetWriter (H.264 video).
 */

import { Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import {
  startNativeCapture as _startNativeCapture,
  stopNativeCapture as _stopNativeCapture,
  isNativeCameraAvailable,
  getModuleLoadError,
} from "../modules/expo-kgen-advanced-capture/src/index";
import type { KGenNativeRecordingResult } from "../modules/expo-kgen-advanced-capture/src/index";

export { isNativeCameraAvailable, getModuleLoadError };
export type { KGenNativeRecordingResult };

export interface NativeCaptureSession {
  sessionId: string;
  sessionFolderPath: string;
  startedAtEpochMs: number;
}

let activeSession: NativeCaptureSession | null = null;

/**
 * Starts a unified native capture session (video + IMU + ARKit).
 * Must be called from JS before the user presses the stop button.
 * @returns true if started successfully.
 */
export async function startNativeCameraCapture(
  sessionId: string,
): Promise<{ started: boolean; session: NativeCaptureSession | null }> {
  if (Platform.OS !== "ios" || !isNativeCameraAvailable()) {
    return { started: false, session: null };
  }

  const sessionFolderPath = `${FileSystem.documentDirectory ?? ""}sessions/${sessionId}/`;

  const result = await _startNativeCapture({ sessionId, sessionFolderPath });

  if (!result.started) {
    console.warn("[NativeCamera] Failed to start:", result.error);
    return { started: false, session: null };
  }

  activeSession = {
    sessionId,
    sessionFolderPath,
    startedAtEpochMs: Date.now(),
  };

  console.log(`[NativeCamera] Started: session=${sessionId}`);
  return { started: true, session: activeSession };
}

/**
 * Stops the native capture session and returns all generated file paths + stats.
 */
export async function stopNativeCameraCapture(): Promise<KGenNativeRecordingResult | null> {
  if (!activeSession) return null;

  activeSession = null;

  const result = await _stopNativeCapture();
  if (!result) {
    console.warn("[NativeCamera] stopNativeCapture returned null");
    return null;
  }

  console.log(
    `[NativeCamera] Stopped. IMU: ${result.imuSampleCount} @ ${result.imuEstimatedHz.toFixed(1)}Hz, ` +
    `HeadPose: ${result.headPoseSampleCount}, Frames: ${result.videoFrameCount}, ` +
    `Artifacts: ${result.generatedArtifacts.join(", ")}`,
  );

  return result;
}

export function getActiveNativeSession(): NativeCaptureSession | null {
  return activeSession;
}
