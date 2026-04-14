import { Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import { getApiUrl } from "@/lib/query-client";

const CHUNK_SIZE = 120 * 1024 * 1024;
const MIN_IMU_SAMPLES_FOR_UPLOAD = 10;

export interface UploadProgress {
  chunkIndex: number;
  totalChunks: number;
  bytesUploaded: number;
  totalBytes: number;
  phase: "video" | "imu" | "metadata" | "qc" | "artifacts";
}

export interface SessionFileOptions {
  sessionId: string;
  imuPath?: string;
  metadataPath?: string;
  qcReportPath?: string;
  imuSampleCount?: number;
  videoTimestampPath?: string;
  handLandmarksPath?: string;
  facePresencePath?: string;
  frameQcMetricsPath?: string;
  manifestPath?: string;
  headPosePath?: string;
  cameraCalibrationPath?: string;
  cameraMountPath?: string;
}

export interface SessionUploadValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
  videoFileMissing?: boolean;
}

export async function validateBeforeUpload(
  videoUri: string,
  session?: SessionFileOptions,
): Promise<SessionUploadValidation> {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!videoUri || videoUri.startsWith("simulated://")) {
    return { valid: true, errors: [], warnings: ["Simulated recording — skipping file validation"] };
  }

  if (Platform.OS !== "web") {
    try {
      const videoInfo = await FileSystem.getInfoAsync(videoUri);
      if (!videoInfo.exists) {
        errors.push("Video file no longer exists on device");
        return { valid: false, errors, warnings, videoFileMissing: true };
      }
    } catch {
      warnings.push("Video file could not be verified locally");
    }

    if (session?.imuPath) {
      try {
        const imuInfo = await FileSystem.getInfoAsync(session.imuPath);
        if (!imuInfo.exists) warnings.push("IMU data file not found");
      } catch {
        warnings.push("Cannot access IMU file");
      }
    }

    if (session?.metadataPath) {
      try {
        const metaInfo = await FileSystem.getInfoAsync(session.metadataPath);
        if (!metaInfo.exists) warnings.push("Metadata file not found");
      } catch {
        warnings.push("Cannot access metadata file");
      }
    }

    if (session?.qcReportPath) {
      try {
        const qcInfo = await FileSystem.getInfoAsync(session.qcReportPath);
        if (!qcInfo.exists) warnings.push("QC report file not found");
      } catch {
        warnings.push("Cannot access QC report file");
      }
    }

    if (session?.videoTimestampPath) {
      try {
        const tsInfo = await FileSystem.getInfoAsync(session.videoTimestampPath);
        if (!tsInfo.exists) warnings.push("Video timestamps file not found");
      } catch {
        warnings.push("Cannot access video timestamps file");
      }
    }

    const semanticFiles = [
      { path: session?.handLandmarksPath, name: "hand_landmarks.jsonl" },
      { path: session?.facePresencePath, name: "face_presence.jsonl" },
      { path: session?.frameQcMetricsPath, name: "frame_qc_metrics.jsonl" },
    ];
    for (const sf of semanticFiles) {
      if (sf.path) {
        try {
          const info = await FileSystem.getInfoAsync(sf.path);
          if (!info.exists) warnings.push(`Semantic file missing: ${sf.name}`);
        } catch {
          warnings.push(`Cannot access semantic file: ${sf.name}`);
        }
      } else {
        warnings.push(`Semantic file not generated: ${sf.name}`);
      }
    }

    if (
      session?.imuSampleCount !== undefined &&
      session.imuSampleCount < MIN_IMU_SAMPLES_FOR_UPLOAD
    ) {
      warnings.push(
        `Low IMU sample count: ${session.imuSampleCount} (min recommended: ${MIN_IMU_SAMPLES_FOR_UPLOAD})`,
      );
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

async function getFileBlob(uri: string): Promise<Blob> {
  const response = await fetch(uri);
  return await response.blob();
}

async function uploadSmallFileNative(
  fileUri: string,
  s3Key: string,
  contentType: string,
  token: string,
): Promise<string> {
  const baseUrl = getApiUrl();

  const presignRes = await fetch(new URL("/api/uploads/presign", baseUrl).toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ s3Key, contentType }),
  });
  if (!presignRes.ok) throw new Error(`Failed to get presigned URL for ${s3Key}`);
  const { presignedUrl } = await presignRes.json();

  const uploadResult = await FileSystem.uploadAsync(presignedUrl, fileUri, {
    httpMethod: "PUT",
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    headers: { "Content-Type": contentType },
  });

  if (uploadResult.status < 200 || uploadResult.status >= 300) {
    throw new Error(`Upload failed for ${s3Key} (status ${uploadResult.status})`);
  }
  return s3Key;
}

async function uploadSmallFileWeb(
  fileUri: string,
  s3Key: string,
  contentType: string,
  token: string,
): Promise<string> {
  const baseUrl = getApiUrl();

  const presignRes = await fetch(new URL("/api/uploads/presign", baseUrl).toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ s3Key, contentType }),
  });
  if (!presignRes.ok) throw new Error(`Failed to get presigned URL for ${s3Key}`);
  const { presignedUrl } = await presignRes.json();

  const blob = await getFileBlob(fileUri);
  const uploadRes = await fetch(presignedUrl, {
    method: "PUT",
    body: blob,
    headers: { "Content-Type": contentType },
  });
  if (!uploadRes.ok) throw new Error(`Failed to upload ${s3Key}`);
  return s3Key;
}

async function uploadSmallFile(
  fileUri: string,
  s3Key: string,
  contentType: string,
  token: string,
): Promise<string> {
  if (Platform.OS !== "web") {
    return uploadSmallFileNative(fileUri, s3Key, contentType, token);
  }
  return uploadSmallFileWeb(fileUri, s3Key, contentType, token);
}

async function tryUploadFile(
  filePath: string | undefined,
  s3Key: string,
  contentType: string,
  token: string,
  label: string,
): Promise<boolean> {
  if (!filePath) return false;
  try {
    if (Platform.OS !== "web") {
      const info = await FileSystem.getInfoAsync(filePath);
      if (!info.exists) {
        console.warn(`[UPLOAD] ${label} file not found, skipping`);
        return false;
      }
    }
    await uploadSmallFile(filePath, s3Key, contentType, token);
    console.log(`[UPLOAD] ${label} uploaded`);
    return true;
  } catch (e) {
    console.warn(`[UPLOAD] ${label} upload failed (non-blocking):`, e);
    return false;
  }
}

async function uploadVideoNative(
  videoUri: string,
  s3Key: string,
  token: string,
  onProgress?: (p: UploadProgress) => void,
): Promise<string> {
  const baseUrl = getApiUrl();

  const fileInfo = await FileSystem.getInfoAsync(videoUri);
  if (!fileInfo.exists) throw new Error("Video file not found on device");
  const fileSize = (fileInfo as any).size || 0;
  const contentType = "video/mp4";

  if (fileSize > 0 && fileSize > CHUNK_SIZE) {
    return uploadVideoMultipartWeb(videoUri, s3Key, token, onProgress);
  }

  onProgress?.({ chunkIndex: 0, totalChunks: 1, bytesUploaded: 0, totalBytes: fileSize, phase: "video" });

  const presignRes = await fetch(new URL("/api/uploads/presign", baseUrl).toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ s3Key, contentType }),
  });
  if (!presignRes.ok) {
    const err = await presignRes.json().catch(() => ({}));
    throw new Error(err.message || "Failed to get presigned URL");
  }
  const { presignedUrl } = await presignRes.json();

  const uploadResult = await FileSystem.uploadAsync(presignedUrl, videoUri, {
    httpMethod: "PUT",
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    headers: { "Content-Type": contentType },
  });

  if (uploadResult.status < 200 || uploadResult.status >= 300) {
    throw new Error(`Video upload failed (status ${uploadResult.status}): ${uploadResult.body?.substring(0, 200)}`);
  }

  onProgress?.({ chunkIndex: 1, totalChunks: 1, bytesUploaded: fileSize, totalBytes: fileSize, phase: "video" });

  const location = `https://kaivideo.s3.us-east-1.amazonaws.com/${s3Key}`;
  return location;
}

async function uploadVideoMultipartWeb(
  videoUri: string,
  s3Key: string,
  token: string,
  onProgress?: (p: UploadProgress) => void,
): Promise<string> {
  const baseUrl = getApiUrl();
  const contentType = "video/mp4";

  const blob = await getFileBlob(videoUri);
  const fileSize = blob.size;

  const initiateRes = await fetch(new URL("/api/uploads/initiate", baseUrl).toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ s3Key, contentType }),
  });
  if (!initiateRes.ok) {
    const err = await initiateRes.json().catch(() => ({}));
    throw new Error(err.message || "Failed to initiate upload");
  }
  const { uploadId, s3Key: confirmedKey } = await initiateRes.json();

  const totalChunks = Math.max(1, Math.ceil(fileSize / CHUNK_SIZE));
  const parts: { PartNumber: number; ETag: string }[] = [];

  try {
    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, fileSize);
      const chunk = blob.slice(start, end, contentType);
      const partNumber = i + 1;

      const urlRes = await fetch(new URL("/api/uploads/part-url", baseUrl).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ uploadId, s3Key: confirmedKey, partNumber }),
      });
      if (!urlRes.ok) throw new Error(`Failed to get URL for part ${partNumber}`);
      const { presignedUrl } = await urlRes.json();

      const uploadRes = await fetch(presignedUrl, {
        method: "PUT",
        body: chunk,
        headers: { "Content-Type": contentType },
      });
      if (!uploadRes.ok) throw new Error(`Part ${partNumber} upload failed`);

      const etag =
        uploadRes.headers.get("ETag") ||
        uploadRes.headers.get("etag") ||
        `"part-${partNumber}"`;
      parts.push({ PartNumber: partNumber, ETag: etag });

      onProgress?.({
        chunkIndex: partNumber,
        totalChunks,
        bytesUploaded: end,
        totalBytes: fileSize,
        phase: "video",
      });
    }

    const completeRes = await fetch(new URL("/api/uploads/complete", baseUrl).toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ uploadId, s3Key: confirmedKey, parts }),
    });
    if (!completeRes.ok) throw new Error("Failed to complete upload");
    const { location } = await completeRes.json();
    return location as string;
  } catch (err) {
    await fetch(new URL("/api/uploads/abort", baseUrl).toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ uploadId, s3Key: confirmedKey }),
    }).catch(() => {});
    throw err;
  }
}

export async function uploadVideoChunked(
  videoUri: string,
  questId: string,
  recordingId: string,
  token: string,
  onProgress?: (p: UploadProgress) => void,
  sessionFiles?: SessionFileOptions,
): Promise<string> {
  const sessionId = sessionFiles?.sessionId ?? recordingId;
  const s3Key = `sessions/${sessionId}/video.mp4`;

  let location: string;

  if (Platform.OS !== "web") {
    location = await uploadVideoNative(videoUri, s3Key, token, onProgress);
  } else {
    location = await uploadVideoMultipartWeb(videoUri, s3Key, token, onProgress);
  }

  if (sessionFiles && Platform.OS !== "web") {
    onProgress?.({ chunkIndex: 1, totalChunks: 1, bytesUploaded: 0, totalBytes: 0, phase: "imu" });
    await tryUploadFile(sessionFiles.imuPath, `sessions/${sessionId}/imu.jsonl`, "application/x-ndjson", token, "imu.jsonl");

    onProgress?.({ chunkIndex: 1, totalChunks: 1, bytesUploaded: 0, totalBytes: 0, phase: "metadata" });
    await tryUploadFile(sessionFiles.metadataPath, `sessions/${sessionId}/metadata.json`, "application/json", token, "metadata.json");

    onProgress?.({ chunkIndex: 1, totalChunks: 1, bytesUploaded: 0, totalBytes: 0, phase: "qc" });
    await tryUploadFile(sessionFiles.qcReportPath, `sessions/${sessionId}/qc_report.json`, "application/json", token, "qc_report.json");

    onProgress?.({ chunkIndex: 1, totalChunks: 1, bytesUploaded: 0, totalBytes: 0, phase: "artifacts" });
    await tryUploadFile(sessionFiles.videoTimestampPath, `sessions/${sessionId}/video_timestamps.jsonl`, "application/x-ndjson", token, "video_timestamps.jsonl");
    await tryUploadFile(sessionFiles.handLandmarksPath, `sessions/${sessionId}/hand_landmarks.jsonl`, "application/x-ndjson", token, "hand_landmarks.jsonl");
    await tryUploadFile(sessionFiles.facePresencePath, `sessions/${sessionId}/face_presence.jsonl`, "application/x-ndjson", token, "face_presence.jsonl");
    await tryUploadFile(sessionFiles.frameQcMetricsPath, `sessions/${sessionId}/frame_qc_metrics.jsonl`, "application/x-ndjson", token, "frame_qc_metrics.jsonl");
    await tryUploadFile(sessionFiles.manifestPath, `sessions/${sessionId}/session_manifest.json`, "application/json", token, "session_manifest.json");
    await tryUploadFile(sessionFiles.headPosePath, `sessions/${sessionId}/head_pose.jsonl`, "application/x-ndjson", token, "head_pose.jsonl");
    await tryUploadFile(sessionFiles.cameraCalibrationPath, `sessions/${sessionId}/camera_calibration.json`, "application/json", token, "camera_calibration.json");
    await tryUploadFile(sessionFiles.cameraMountPath, `sessions/${sessionId}/camera_mount.json`, "application/json", token, "camera_mount.json");
  }

  return location;
}
