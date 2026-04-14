import type { LocalQCReport } from "./qc-types";

export interface User {
  id: string;
  username: string;
}

export interface Quest {
  id: string;
  title: string;
  description: string;
  instructions: string[];
  category: string;
  estimatedDuration: string;
  reward: number;
  status: "available" | "completed" | "expired";
  difficulty: "easy" | "medium" | "hard";
}

export type UploadStatus = "queued" | "uploading" | "uploaded" | "failed" | "retrying" | "file_lost";

export interface SessionData {
  sessionId: string;
  imuPath?: string;
  metadataPath?: string;
  qcReportPath?: string;
  imuSampleCount?: number;
  imuEstimatedHz?: number;
  sessionStartEpochMs?: number;
  imuStartEpochMs?: number;
  videoStartEpochMs?: number;
  recordingStopEpochMs?: number;
  sessionFolderPath?: string;
  videoTimestampPath?: string;
  handLandmarksPath?: string;
  facePresencePath?: string;
  frameQcMetricsPath?: string;
  manifestPath?: string;
  frameTimestampCount?: number;
  semanticArtifactsAvailable?: boolean;
  headPosePath?: string;
  cameraCalibrationPath?: string;
  cameraMountPath?: string;
  advancedCaptureEnabled?: boolean;
}

export interface Recording {
  id: string;
  questId: string;
  questTitle: string;
  uri: string;
  duration: number;
  fileSize: number;
  createdAt: number;
  uploadStatus: UploadStatus;
  submissionId?: string;
  thumbnailUri?: string;
  qcReport?: LocalQCReport;
  deviceOrientation?: "portrait" | "landscape";
  sessionId?: string;
  imuPath?: string;
  metadataPath?: string;
  qcReportPath?: string;
  imuSampleCount?: number;
  imuEstimatedHz?: number;
  sessionStartEpochMs?: number;
  videoStartEpochMs?: number;
  recordingStopEpochMs?: number;
  sessionFolderPath?: string;
  videoTimestampPath?: string;
  handLandmarksPath?: string;
  facePresencePath?: string;
  frameQcMetricsPath?: string;
  manifestPath?: string;
  frameTimestampCount?: number;
  semanticArtifactsAvailable?: boolean;
  headPosePath?: string;
  cameraCalibrationPath?: string;
  cameraMountPath?: string;
  advancedCaptureEnabled?: boolean;
}
