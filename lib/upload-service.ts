import { Platform } from "react-native";
import { getApiUrl } from "@/lib/query-client";

const CHUNK_SIZE = 120 * 1024 * 1024;

export interface UploadProgress {
  chunkIndex: number;
  totalChunks: number;
  bytesUploaded: number;
  totalBytes: number;
}

async function getFileBlob(videoUri: string): Promise<Blob> {
  const response = await fetch(videoUri);
  const blob = await response.blob();
  return blob;
}

export async function uploadVideoChunked(
  videoUri: string,
  questId: string,
  recordingId: string,
  token: string,
  onProgress?: (p: UploadProgress) => void,
): Promise<string> {
  const baseUrl = getApiUrl();

  const blob = await getFileBlob(videoUri);
  const fileSize = blob.size;
  const contentType = blob.type || "video/mp4";
  const s3Key = `recordings/${questId}/${recordingId}_${Date.now()}.mp4`;

  const initiateRes = await fetch(
    new URL("/api/uploads/initiate", baseUrl).toString(),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ s3Key, contentType }),
    },
  );
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

      const urlRes = await fetch(
        new URL("/api/uploads/part-url", baseUrl).toString(),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ uploadId, s3Key: confirmedKey, partNumber }),
        },
      );
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
      });
    }

    const completeRes = await fetch(
      new URL("/api/uploads/complete", baseUrl).toString(),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ uploadId, s3Key: confirmedKey, parts }),
      },
    );
    if (!completeRes.ok) throw new Error("Failed to complete upload");
    const { location } = await completeRes.json();
    return location as string;
  } catch (err) {
    await fetch(new URL("/api/uploads/abort", baseUrl).toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ uploadId, s3Key: confirmedKey }),
    }).catch(() => {});
    throw err;
  }
}
