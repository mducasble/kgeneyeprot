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

export type UploadStatus = "queued" | "uploading" | "uploaded" | "failed" | "retrying";

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
}
