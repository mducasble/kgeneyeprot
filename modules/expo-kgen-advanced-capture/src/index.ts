import { Platform } from "react-native";
import { requireNativeModule, requireNativeViewManager } from "expo-modules-core";
import type {
  AdvancedCaptureCapabilities,
  AdvancedSessionOptions,
  AdvancedSessionResult,
} from "@/lib/advanced-capture-types";

let NativeModule: any = null;
if (Platform.OS === "ios") {
  try {
    NativeModule = requireNativeModule("ExpoKgenAdvancedCapture");
    console.log("[ExpoKgenAdvancedCapture] ✅ Native module loaded successfully");
  } catch (e) {
    NativeModule = null;
    console.warn("[ExpoKgenAdvancedCapture] ❌ Native module NOT found — will use legacy path.", e);
  }
}

const MODULE_AVAILABLE = NativeModule != null;

// ─── Legacy ARKit-only session API ─────────────────────────────────────────

export async function getAdvancedCaptureCapabilities(): Promise<AdvancedCaptureCapabilities> {
  if (!MODULE_AVAILABLE) {
    return {
      supported: false,
      arkitAvailable: false,
      worldTrackingAvailable: false,
      sceneDepthAvailable: false,
      cameraCalibrationAvailable: false,
    };
  }
  try {
    return await NativeModule.getAdvancedCaptureCapabilities();
  } catch {
    return {
      supported: false,
      arkitAvailable: false,
      worldTrackingAvailable: false,
      sceneDepthAvailable: false,
      cameraCalibrationAvailable: false,
    };
  }
}

export async function startAdvancedSession(
  options: AdvancedSessionOptions,
): Promise<{ started: boolean }> {
  if (!MODULE_AVAILABLE) return { started: false };
  try {
    return await NativeModule.startAdvancedSession(options);
  } catch (err) {
    console.warn("[AdvancedCapture] Failed to start:", err);
    return { started: false };
  }
}

export async function stopAdvancedSession(): Promise<AdvancedSessionResult | null> {
  if (!MODULE_AVAILABLE) return null;
  try {
    return await NativeModule.stopAdvancedSession();
  } catch (err) {
    console.warn("[AdvancedCapture] Failed to stop:", err);
    return null;
  }
}

export function isAdvancedCaptureModuleAvailable(): boolean {
  return MODULE_AVAILABLE;
}

// ─── Native Camera API (unified: ARSession + CMMotionManager + AVAssetWriter) ──

export interface KGenNativeCaptureOptions {
  sessionId: string;
  sessionFolderPath: string;
}

export interface KGenNativeRecordingResult {
  sessionId: string;
  videoPath: string;
  imuPath: string;
  headPosePath: string;
  cameraCalibrationPath: string;
  sessionFolderPath: string;
  startedAtEpochMs: number;
  stoppedAtEpochMs: number;
  imuSampleCount: number;
  imuEstimatedHz: number;
  headPoseSampleCount: number;
  videoFrameCount: number;
  generatedArtifacts: string[];
}

export async function startNativeCapture(
  options: KGenNativeCaptureOptions,
): Promise<{ started: boolean; error?: string }> {
  if (!MODULE_AVAILABLE) return { started: false, error: "Native module not available" };
  try {
    return await NativeModule.startNativeCapture(options);
  } catch (err: any) {
    console.warn("[NativeCapture] startNativeCapture error:", err);
    return { started: false, error: String(err?.message ?? err) };
  }
}

export async function stopNativeCapture(): Promise<KGenNativeRecordingResult | null> {
  if (!MODULE_AVAILABLE) return null;
  try {
    return await NativeModule.stopNativeCapture();
  } catch (err) {
    console.warn("[NativeCapture] stopNativeCapture error:", err);
    return null;
  }
}

export function isNativeCameraAvailable(): boolean {
  return MODULE_AVAILABLE && Platform.OS === "ios";
}

// ─── Native Camera Preview View ─────────────────────────────────────────────

export const KGenCameraView: React.ComponentType<{
  style?: import("react-native").StyleProp<import("react-native").ViewStyle>;
}> = MODULE_AVAILABLE
  ? requireNativeViewManager("ExpoKgenAdvancedCapture")
  : (() => null) as any;
