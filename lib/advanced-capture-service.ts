import { Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import type {
  AdvancedCaptureCapabilities,
  AdvancedSessionOptions,
  AdvancedSessionResult,
  AdvancedCaptureMetadata,
  AdvancedCaptureArtifacts,
  CameraMountConfig,
} from "./advanced-capture-types";
import {
  getAdvancedCaptureCapabilities as nativeGetCapabilities,
  startAdvancedSession as nativeStart,
  stopAdvancedSession as nativeStop,
  isAdvancedCaptureModuleAvailable,
} from "../modules/expo-kgen-advanced-capture/src/index";

let cachedCapabilities: AdvancedCaptureCapabilities | null = null;
let activeSessionId: string | null = null;
let lastResult: AdvancedSessionResult | null = null;

export async function checkAdvancedCapabilities(): Promise<AdvancedCaptureCapabilities> {
  if (Platform.OS !== "ios" || !isAdvancedCaptureModuleAvailable()) {
    return {
      supported: false,
      arkitAvailable: false,
      worldTrackingAvailable: false,
      sceneDepthAvailable: false,
      cameraCalibrationAvailable: false,
    };
  }

  if (cachedCapabilities) return cachedCapabilities;

  cachedCapabilities = await nativeGetCapabilities();
  console.log("[AdvancedCapture] Capabilities:", JSON.stringify(cachedCapabilities));
  return cachedCapabilities;
}

export async function startAdvancedCapture(
  sessionId: string,
  questId: string,
): Promise<boolean> {
  const caps = await checkAdvancedCapabilities();
  if (!caps.supported) {
    console.log("[AdvancedCapture] Not supported on this device — skipping");
    return false;
  }

  const options: AdvancedSessionOptions = {
    sessionId,
    questId,
    enableHeadPose: caps.worldTrackingAvailable,
    enableCameraCalibration: caps.cameraCalibrationAvailable,
    enableSceneDepth: caps.sceneDepthAvailable,
  };

  const result = await nativeStart(options);
  if (result.started) {
    activeSessionId = sessionId;
    lastResult = null;
    console.log(`[AdvancedCapture] Started for session ${sessionId}`);
  }
  return result.started;
}

export async function stopAdvancedCapture(): Promise<AdvancedSessionResult | null> {
  if (!activeSessionId) return lastResult;

  const result = await nativeStop();
  activeSessionId = null;
  lastResult = result;

  if (result) {
    console.log(
      `[AdvancedCapture] Stopped. Artifacts: ${result.generatedArtifacts.join(", ")}`,
    );
  }
  return result;
}

export async function writeCameraMountConfig(sessionId: string): Promise<string> {
  const dir = `${FileSystem.documentDirectory ?? ""}sessions/${sessionId}/`;
  const mountPath = `${dir}camera_mount.json`;

  const mountConfig = await loadMountConfig();

  const config: CameraMountConfig = {
    source: "manual_mount_config",
    mountType: mountConfig.mountType,
    capturedAtEpochMs: Date.now(),
    cameraExtrinsicsRelativeToHead: {
      translationMeters: mountConfig.translationMeters,
      rotationEulerDeg: mountConfig.rotationEulerDeg,
    },
    notes: mountConfig.notes || "Manual mount calibration — adjust after physical testing",
  };

  if (Platform.OS !== "web") {
    await FileSystem.writeAsStringAsync(mountPath, JSON.stringify(config, null, 2), {
      encoding: FileSystem.EncodingType.UTF8,
    });
  }
  console.log(`[AdvancedCapture] camera_mount.json written: ${mountPath}`);
  return mountPath;
}

async function loadMountConfig(): Promise<{
  mountType: string;
  translationMeters: { x: number; y: number; z: number };
  rotationEulerDeg: { pitch: number; yaw: number; roll: number };
  notes?: string;
}> {
  return {
    mountType: "forehead_headband",
    translationMeters: { x: 0.03, y: 0.02, z: 0.06 },
    rotationEulerDeg: { pitch: -18, yaw: 0, roll: 0 },
    notes: "Default forehead headband mount. Adjust after physical testing.",
  };
}

export function buildAdvancedCaptureMetadata(
  advancedResult: AdvancedSessionResult | null,
  caps: AdvancedCaptureCapabilities,
  cameraMountWritten: boolean,
): AdvancedCaptureMetadata {
  const artifacts = advancedResult?.generatedArtifacts ?? [];

  return {
    enabled: advancedResult != null,
    headPoseAvailable: artifacts.includes("head_pose.jsonl"),
    cameraCalibrationAvailable: artifacts.includes("camera_calibration.json"),
    cameraMountConfigAvailable: cameraMountWritten,
    sceneDepthAvailable: caps.sceneDepthAvailable && artifacts.includes("scene_depth.jsonl"),
    headPoseSampleCount: 0,
    headPoseTrackingQualityNote: artifacts.includes("head_pose.jsonl")
      ? "ARKit world tracking — device pose from visual-inertial odometry"
      : "not available",
    cameraCalibrationSource: artifacts.includes("camera_calibration.json")
      ? "arkit"
      : "not available",
    cameraExtrinsicsSource: cameraMountWritten
      ? "manual_mount_config"
      : "not available",
  };
}

export function isAdvancedCaptureActive(): boolean {
  return activeSessionId != null;
}
