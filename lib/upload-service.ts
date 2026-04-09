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
  phase: "video" | "imu" | "metadata" | "qc";
}

export interface SessionFileOptions {
  sessionId: string;
  imuPath?: string;
  metadataPath?: string;
  qcReportPath?: string;
  imuSampleCount?: number;
}

export interface SessionUploadValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
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
      if (!videoInfo.exists) warnings.push("Video file could not be verified locally");
    } catch {
      // URI format from camera may not be stat-able — let the upload attempt decide
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

async function uploadSmallFile(
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

export async function uploadVideoChunked(
  videoUri: string,
  questId: string,
  recordingId: string,
  token: string,
  onProgress?: (p: UploadProgress) => void,
  sessionFiles?: SessionFileOptions,
): Promise<string> {
  const baseUrl = getApiUrl();
  const sessionId = sessionFiles?.sessionId ?? recordingId;

  const blob = await getFileBlob(videoUri);
  const fileSize = blob.size;
  const contentType = blob.type || "video/mp4";
  const s3Key = `sessions/${sessionId}/video.mp4`;

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

    if (sessionFiles && Platform.OS !== "web") {
      if (sessionFiles.imuPath) {
        try {
          onProgress?.({ chunkIndex: 1, totalChunks: 1, bytesUploaded: 0, totalBytes: 0, phase: "imu" });
          await uploadSmallFile(
            sessionFiles.imuPath,
            `sessions/${sessionId}/imu.jsonl`,
            "application/x-ndjson",
            token,
          );
          console.log("[UPLOAD] imu.jsonl uploaded");
        } catch (e) {
          console.warn("[UPLOAD] imu.jsonl upload failed (non-blocking):", e);
        }
      }

      if (sessionFiles.metadataPath) {
        try {
          onProgress?.({ chunkIndex: 1, totalChunks: 1, bytesUploaded: 0, totalBytes: 0, phase: "metadata" });
          await uploadSmallFile(
            sessionFiles.metadataPath,
            `sessions/${sessionId}/metadata.json`,
            "application/json",
            token,
          );
          console.log("[UPLOAD] metadata.json uploaded");
        } catch (e) {
          console.warn("[UPLOAD] metadata.json upload failed (non-blocking):", e);
        }
      }

      if (sessionFiles.qcReportPath) {
        try {
          onProgress?.({ chunkIndex: 1, totalChunks: 1, bytesUploaded: 0, totalBytes: 0, phase: "qc" });
          await uploadSmallFile(
            sessionFiles.qcReportPath,
            `sessions/${sessionId}/qc_report.json`,
            "application/json",
            token,
          );
          console.log("[UPLOAD] qc_report.json uploaded");
        } catch (e) {
          console.warn("[UPLOAD] qc_report.json upload failed (non-blocking):", e);
        }
      }
    }

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
