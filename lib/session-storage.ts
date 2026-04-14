import { Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";

function sessionDir(sessionId: string): string {
  return `${FileSystem.documentDirectory ?? ""}sessions/${sessionId}/`;
}

export function getSessionFolderPath(sessionId: string): string {
  return sessionDir(sessionId);
}

export async function createSessionFolder(sessionId: string): Promise<string> {
  const dir = sessionDir(sessionId);
  if (Platform.OS !== "web") {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
  console.log(`[SESSION] Folder created: ${dir}`);
  return dir;
}

export async function copyVideoToSession(sessionId: string, sourceUri: string): Promise<string> {
  const dir = sessionDir(sessionId);
  const destPath = `${dir}video.mp4`;
  if (Platform.OS !== "web") {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    await FileSystem.copyAsync({ from: sourceUri, to: destPath });
    console.log(`[SESSION] Video copied to session folder: ${destPath}`);
  }
  return destPath;
}

export async function writeMetadata(
  sessionId: string,
  metadata: Record<string, unknown>,
): Promise<string> {
  const path = `${sessionDir(sessionId)}metadata.json`;
  if (Platform.OS !== "web") {
    await FileSystem.writeAsStringAsync(path, JSON.stringify(metadata, null, 2), {
      encoding: FileSystem.EncodingType.UTF8,
    });
  }
  console.log(`[SESSION] metadata.json written: ${path}`);
  return path;
}

export async function writeQCReport(
  sessionId: string,
  report: Record<string, unknown>,
): Promise<string> {
  const path = `${sessionDir(sessionId)}qc_report.json`;
  if (Platform.OS !== "web") {
    await FileSystem.writeAsStringAsync(path, JSON.stringify(report, null, 2), {
      encoding: FileSystem.EncodingType.UTF8,
    });
  }
  console.log(`[SESSION] qc_report.json written: ${path}`);
  return path;
}

export async function getSessionFilePaths(sessionId: string): Promise<{
  imuPath: string;
  metadataPath: string;
  qcReportPath: string;
  videoTimestampPath: string;
  handLandmarksPath: string;
  facePresencePath: string;
  frameQcMetricsPath: string;
  manifestPath: string;
}> {
  const dir = sessionDir(sessionId);
  return {
    imuPath: `${dir}imu.jsonl`,
    metadataPath: `${dir}metadata.json`,
    qcReportPath: `${dir}qc_report.json`,
    videoTimestampPath: `${dir}video_timestamps.jsonl`,
    handLandmarksPath: `${dir}hand_landmarks.jsonl`,
    facePresencePath: `${dir}face_presence.jsonl`,
    frameQcMetricsPath: `${dir}frame_qc_metrics.jsonl`,
    manifestPath: `${dir}session_manifest.json`,
  };
}

interface ArtifactDescriptor {
  name: string;
  type: string;
  required: boolean;
}

const ALL_ARTIFACTS: ArtifactDescriptor[] = [
  { name: "video.mp4", type: "video", required: true },
  { name: "imu.jsonl", type: "imu_timeseries", required: true },
  { name: "metadata.json", type: "metadata", required: true },
  { name: "qc_report.json", type: "qc_summary", required: true },
  { name: "video_timestamps.jsonl", type: "video_timestamps", required: true },
  { name: "hand_landmarks.jsonl", type: "hand_landmarks", required: false },
  { name: "face_presence.jsonl", type: "face_presence", required: false },
  { name: "frame_qc_metrics.jsonl", type: "frame_qc_metrics", required: false },
  { name: "head_pose.jsonl", type: "head_pose", required: false },
  { name: "camera_calibration.json", type: "camera_calibration", required: false },
  { name: "camera_mount.json", type: "camera_mount", required: false },
];

export async function buildArtifactFilesList(sessionId: string): Promise<string[]> {
  if (Platform.OS === "web") {
    return ALL_ARTIFACTS.map((a) => a.name);
  }
  const dir = sessionDir(sessionId);
  const present: string[] = [];
  for (const artifact of ALL_ARTIFACTS) {
    try {
      const info = await FileSystem.getInfoAsync(`${dir}${artifact.name}`);
      if (info.exists) present.push(artifact.name);
    } catch {
      // skip
    }
  }
  return present;
}

export interface SessionManifest {
  sessionId: string;
  sessionFolderPath: string;
  createdAtEpochMs: number;
  complete: boolean;
  missingRequired: string[];
  artifacts: ArtifactDescriptor[];
}

export async function writeSessionManifest(
  sessionId: string,
  sessionFolderPath: string,
  createdAtEpochMs: number,
): Promise<{ path: string; manifest: SessionManifest }> {
  const dir = sessionDir(sessionId);
  const path = `${dir}session_manifest.json`;

  const presentFiles = await buildArtifactFilesList(sessionId);
  const presentSet = new Set(presentFiles);

  const artifacts = ALL_ARTIFACTS.filter((a) => presentSet.has(a.name));
  const missingRequired = ALL_ARTIFACTS.filter((a) => a.required && !presentSet.has(a.name)).map((a) => a.name);

  const manifest: SessionManifest = {
    sessionId,
    sessionFolderPath,
    createdAtEpochMs,
    complete: missingRequired.length === 0,
    missingRequired,
    artifacts,
  };

  if (Platform.OS !== "web") {
    await FileSystem.writeAsStringAsync(path, JSON.stringify(manifest, null, 2), {
      encoding: FileSystem.EncodingType.UTF8,
    });
  }
  console.log(`[SESSION] session_manifest.json written: ${path} (complete: ${manifest.complete})`);
  return { path, manifest };
}

const CORE_FILES = ["video.mp4", "imu.jsonl", "metadata.json", "qc_report.json", "video_timestamps.jsonl"];
const SEMANTIC_FILES = ["hand_landmarks.jsonl", "face_presence.jsonl", "frame_qc_metrics.jsonl"];

const MIN_IMU_HZ_THRESHOLD = 50;

export async function validateSessionPackage(
  sessionId: string,
  imuEstimatedHz?: number,
  frameTimestampCount?: number,
): Promise<{
  valid: boolean;
  errors: string[];
  warnings: string[];
}> {
  if (Platform.OS === "web") {
    return { valid: true, errors: [], warnings: [] };
  }

  const dir = sessionDir(sessionId);
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const file of CORE_FILES) {
    try {
      const info = await FileSystem.getInfoAsync(`${dir}${file}`);
      if (!info.exists) {
        errors.push(`Core file missing: ${file}`);
      }
    } catch {
      errors.push(`Cannot access core file: ${file}`);
    }
  }

  for (const file of SEMANTIC_FILES) {
    try {
      const info = await FileSystem.getInfoAsync(`${dir}${file}`);
      if (!info.exists) {
        warnings.push(`Semantic file missing: ${file}`);
      }
    } catch {
      warnings.push(`Cannot access semantic file: ${file}`);
    }
  }

  if (imuEstimatedHz !== undefined && imuEstimatedHz < MIN_IMU_HZ_THRESHOLD) {
    warnings.push(`IMU frequency below threshold: ${imuEstimatedHz.toFixed(1)}Hz (min: ${MIN_IMU_HZ_THRESHOLD}Hz)`);
  }

  if (frameTimestampCount !== undefined && frameTimestampCount === 0) {
    warnings.push("Frame timestamp count is zero");
  }

  return { valid: errors.length === 0, errors, warnings };
}

export async function validateSessionFiles(sessionId: string): Promise<{
  valid: boolean;
  missing: string[];
}> {
  if (Platform.OS === "web") {
    return { valid: true, missing: [] };
  }
  const paths = await getSessionFilePaths(sessionId);
  const missing: string[] = [];

  for (const [key, path] of Object.entries(paths)) {
    try {
      const info = await FileSystem.getInfoAsync(path);
      if (!info.exists) missing.push(key);
    } catch {
      missing.push(key);
    }
  }
  return { valid: missing.length === 0, missing };
}
