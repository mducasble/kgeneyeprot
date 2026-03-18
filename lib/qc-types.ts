export type QCResult = "passed" | "passed_with_warning" | "blocked";
export type RequiredOrientation = "portrait" | "landscape" | "any";

export interface CapturePrecheck {
  questId: string;
  requiredOrientation: RequiredOrientation;
  storageAvailable: boolean;
  permissionsOk: boolean;
  deviceReady: boolean;
  orientationOk: boolean;
  precheckPassed: boolean;
  failureReasons: string[];
}

export interface LocalQCFrameSample {
  timestampMs: number;
  handDetected: boolean;
  handCount: number;
  handConfidence: number;
  handBoundingBoxes: Array<{ x: number; y: number; width: number; height: number }>;
  faceDetected: boolean;
  faceConfidence: number;
  brightnessValue: number;
  blurValue: number;
  contrastValue: number;
  motionValue: number;
}

export interface LocalQCReport {
  recordingId: string;
  questId: string;
  durationMs: number;
  resolutionWidth: number;
  resolutionHeight: number;
  fps: number;
  orientation: "portrait" | "landscape";
  audioPresent: boolean;
  fileSizeBytes: number;
  fileIntegrityPassed: boolean;
  sampledFrameCount: number;
  handPresenceRate: number;
  dualHandRate: number;
  facePresenceRate: number;
  averageHandArea: number;
  handCenteringScore: number;
  handContinuityScore: number;
  blurScore: number;
  brightnessScore: number;
  contrastScore: number;
  stabilityScore: number;
  readinessScore: number;
  qcResult: QCResult;
  blockReasons: string[];
  warningReasons: string[];
  generatedAt: number;
}

export interface QCThresholds {
  minDurationMs: number;
  maxDurationMs: number;
  requiredOrientation: RequiredOrientation;
  minHandPresenceRate: number;
  maxFacePresenceRate: number;
  minReadinessScore: number;
  warnReadinessScore: number;
  minStabilityScore: number;
  minBrightnessScore: number;
  minBlurScore: number;
}

export const DEFAULT_QC_THRESHOLDS: QCThresholds = {
  minDurationMs: 5_000,
  maxDurationMs: 600_000,
  requiredOrientation: "landscape",
  minHandPresenceRate: 0.6,
  maxFacePresenceRate: 0.15,
  minReadinessScore: 65,
  warnReadinessScore: 85,
  minStabilityScore: 40,
  minBrightnessScore: 35,
  minBlurScore: 40,
};

export interface LiveGuidanceHint {
  type: "hand" | "face" | "lighting" | "stability" | "framing";
  message: string;
  severity: "warning" | "error";
}

export interface UploadSubmissionPayload {
  questId: string;
  recordingId: string;
  localQCReport: LocalQCReport;
  localQCVersion: string;
  appBuildVersion: string;
  deviceOS: string;
  frameAggregates: {
    handPresenceRate: number;
    facePresenceRate: number;
    avgBlur: number;
    avgBrightness: number;
    avgStability: number;
  };
}
