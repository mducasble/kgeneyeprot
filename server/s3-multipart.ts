import {
  S3Client,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const s3 = new S3Client({
  region: process.env.AWS_S3_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const BUCKET = process.env.AWS_S3_BUCKET === "kaivoice" ? "kaivideo" : process.env.AWS_S3_BUCKET!;

export async function initiateMultipartUpload(
  s3Key: string,
  contentType: string,
): Promise<{ uploadId: string; s3Key: string }> {
  const cmd = new CreateMultipartUploadCommand({
    Bucket: BUCKET,
    Key: s3Key,
    ContentType: contentType,
  });
  const result = await s3.send(cmd);
  return { uploadId: result.UploadId!, s3Key };
}

export async function getPartPresignedUrl(
  s3Key: string,
  uploadId: string,
  partNumber: number,
): Promise<string> {
  const cmd = new UploadPartCommand({
    Bucket: BUCKET,
    Key: s3Key,
    UploadId: uploadId,
    PartNumber: partNumber,
  });
  return await getSignedUrl(s3, cmd, { expiresIn: 3600 });
}

export async function completeMultipartUpload(
  s3Key: string,
  uploadId: string,
  parts: { PartNumber: number; ETag: string }[],
): Promise<string> {
  const cmd = new CompleteMultipartUploadCommand({
    Bucket: BUCKET,
    Key: s3Key,
    UploadId: uploadId,
    MultipartUpload: { Parts: parts },
  });
  const result = await s3.send(cmd);
  return (
    result.Location ??
    `https://${BUCKET}.s3.${process.env.AWS_S3_REGION}.amazonaws.com/${s3Key}`
  );
}

export async function abortMultipartUpload(
  s3Key: string,
  uploadId: string,
): Promise<void> {
  const cmd = new AbortMultipartUploadCommand({
    Bucket: BUCKET,
    Key: s3Key,
    UploadId: uploadId,
  });
  await s3.send(cmd);
}

export async function getObjectPresignedUrl(
  s3Key: string,
  _contentType: string,
): Promise<string> {
  const cmd = new PutObjectCommand({
    Bucket: BUCKET,
    Key: s3Key,
  });
  return await getSignedUrl(s3, cmd, { expiresIn: 3600 });
}
