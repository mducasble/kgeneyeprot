import { Platform, NativeModules } from "react-native";
import type {
  AdvancedCaptureCapabilities,
  AdvancedSessionOptions,
  AdvancedSessionResult,
} from "@/lib/advanced-capture-types";

const NativeModule = Platform.OS === "ios"
  ? NativeModules.ExpoKgenAdvancedCapture ?? null
  : null;

const MODULE_AVAILABLE = NativeModule != null;

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
  if (!MODULE_AVAILABLE) {
    return { started: false };
  }

  try {
    return await NativeModule.startAdvancedSession(options);
  } catch (err) {
    console.warn("[AdvancedCapture] Failed to start:", err);
    return { started: false };
  }
}

export async function stopAdvancedSession(): Promise<AdvancedSessionResult | null> {
  if (!MODULE_AVAILABLE) {
    return null;
  }

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
