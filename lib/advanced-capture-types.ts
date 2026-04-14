export interface AdvancedCaptureCapabilities {
  supported: boolean;
  arkitAvailable: boolean;
  worldTrackingAvailable: boolean;
  sceneDepthAvailable: boolean;
  cameraCalibrationAvailable: boolean;
  nativeCameraAvailable?: boolean;
}

export interface AdvancedSessionOptions {
  sessionId: string;
  questId: string;
  enableHeadPose: boolean;
  enableCameraCalibration: boolean;
  enableSceneDepth?: boolean;
}

export interface AdvancedSessionResult {
  startedAtEpochMs: number;
  stoppedAtEpochMs: number;
  sessionFolderPath: string;
  generatedArtifacts: string[];
}

export interface HeadPoseSample {
  timestampEpochMs: number;
  relativeMs: number;
  frameIndex: number | null;
  positionMeters: { x: number; y: number; z: number };
  rotationQuaternion: { x: number; y: number; z: number; w: number };
  trackingState: "normal" | "limited" | "notAvailable";
}

export interface CameraCalibration {
  source: "arkit" | "avfoundation" | "estimated";
  capturedAtEpochMs: number;
  intrinsics: {
    fx: number;
    fy: number;
    cx: number;
    cy: number;
    matrix3x3: number[][];
  };
  distortion: {
    available: boolean;
    model: string | null;
    coefficients: number[] | null;
  };
  imageReference: {
    width: number;
    height: number;
  };
}

export interface CameraMountConfig {
  source: "manual_mount_config";
  mountType: string;
  capturedAtEpochMs: number;
  cameraExtrinsicsRelativeToHead: {
    translationMeters: { x: number; y: number; z: number };
    rotationEulerDeg: { pitch: number; yaw: number; roll: number };
  };
  notes?: string;
}

export interface AdvancedCaptureMetadata {
  enabled: boolean;
  headPoseAvailable: boolean;
  cameraCalibrationAvailable: boolean;
  cameraMountConfigAvailable: boolean;
  sceneDepthAvailable: boolean;
  headPoseSampleCount: number;
  headPoseTrackingQualityNote: string;
  cameraCalibrationSource: string;
  cameraExtrinsicsSource: string;
}

export interface AdvancedCaptureArtifacts {
  headPosePath: string;
  cameraCalibrationPath: string;
  cameraMountPath: string;
}
