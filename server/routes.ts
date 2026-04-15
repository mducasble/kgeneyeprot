import type { Express, Request, Response } from "express";
import { createServer, type Server } from "node:http";
import { storage } from "./storage";
import * as crypto from "crypto";
import * as path from "path";
import * as fs from "fs";
import {
  initiateMultipartUpload,
  getPartPresignedUrl,
  completeMultipartUpload,
  abortMultipartUpload,
  getObjectPresignedUrl,
  listSessionObjects,
} from "./s3-multipart";

const SESSIONS_FILE = path.join(process.cwd(), ".data", "sessions.json");

function loadSessions(): Map<string, string> {
  try {
    if (!fs.existsSync(SESSIONS_FILE)) return new Map();
    const raw = fs.readFileSync(SESSIONS_FILE, "utf-8");
    const obj: Record<string, string> = JSON.parse(raw);
    return new Map(Object.entries(obj));
  } catch {
    return new Map();
  }
}

function saveSessions(sessions: Map<string, string>) {
  try {
    const dir = path.dirname(SESSIONS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(Object.fromEntries(sessions), null, 2));
  } catch (e) {
    console.error("Failed to persist sessions:", e);
  }
}

const sessions: Map<string, string> = loadSessions();

const quests = [
  {
    id: "quest-001",
    title: "Morning Routine Capture",
    description: "Record your complete morning routine from waking up to leaving home. Focus on showing each step clearly.",
    instructions: [
      "Start recording when you wake up",
      "Show your morning preparation steps",
      "Include any breakfast preparation",
      "End recording when you leave or start your day",
    ],
    category: "Daily Life",
    estimatedDuration: "5-15 min",
    reward: 50,
    status: "available" as const,
    difficulty: "easy" as const,
  },
  {
    id: "quest-002",
    title: "Kitchen Cooking Session",
    description: "Record yourself cooking a meal from start to finish. Show ingredient preparation, cooking steps, and plating.",
    instructions: [
      "Show all ingredients before starting",
      "Record each cooking step clearly",
      "Keep the camera steady on the cooking area",
      "Show the final plated dish",
    ],
    category: "Cooking",
    estimatedDuration: "15-30 min",
    reward: 100,
    status: "available" as const,
    difficulty: "medium" as const,
  },
  {
    id: "quest-003",
    title: "Outdoor Walking Path",
    description: "Record a walking session outdoors. Capture the environment, path conditions, and navigation decisions.",
    instructions: [
      "Hold the camera at chest level",
      "Walk at a normal pace",
      "Capture intersections and turns",
      "Record for at least 5 minutes",
    ],
    category: "Navigation",
    estimatedDuration: "5-10 min",
    reward: 40,
    status: "available" as const,
    difficulty: "easy" as const,
  },
  {
    id: "quest-004",
    title: "Workspace Setup Documentation",
    description: "Record a tour of your workspace, showing your desk setup, equipment, and how you organize your work area.",
    instructions: [
      "Start with a wide shot of the workspace",
      "Show each piece of equipment",
      "Demonstrate your organization system",
      "Include any unique features",
    ],
    category: "Work",
    estimatedDuration: "3-5 min",
    reward: 30,
    status: "available" as const,
    difficulty: "easy" as const,
  },
  {
    id: "quest-005",
    title: "Public Transport Journey",
    description: "Record a public transportation trip from boarding to arriving at your destination.",
    instructions: [
      "Record boarding the vehicle",
      "Show the interior environment",
      "Capture stops and announcements",
      "Record the exit at your destination",
    ],
    category: "Transportation",
    estimatedDuration: "10-30 min",
    reward: 75,
    status: "available" as const,
    difficulty: "medium" as const,
  },
  {
    id: "quest-006",
    title: "Grocery Shopping Trip",
    description: "Record your grocery shopping experience from entering the store to checkout.",
    instructions: [
      "Show the store entrance",
      "Record browsing through aisles",
      "Show product selection process",
      "Capture the checkout process",
    ],
    category: "Shopping",
    estimatedDuration: "15-30 min",
    reward: 80,
    status: "available" as const,
    difficulty: "medium" as const,
  },
];

function authenticateRequest(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  return sessions.get(token) || null;
}

export async function registerRoutes(app: Express): Promise<Server> {
  app.post("/api/auth/register", async (req: Request, res: Response) => {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: "Username and password are required" });
    }
    const existing = await storage.getUserByUsername(username);
    if (existing) {
      return res.status(409).json({ message: "Username already exists" });
    }
    const hashedPassword = crypto.createHash("sha256").update(password).digest("hex");
    const user = await storage.createUser({ username, password: hashedPassword });
    const token = crypto.randomUUID();
    sessions.set(token, user.id);
    saveSessions(sessions);
    res.json({ token, user: { id: user.id, username: user.username } });
  });

  app.post("/api/auth/login", async (req: Request, res: Response) => {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: "Username and password are required" });
    }
    const user = await storage.getUserByUsername(username);
    const hashedPassword = crypto.createHash("sha256").update(password).digest("hex");
    if (!user || user.password !== hashedPassword) {
      return res.status(401).json({ message: "Invalid credentials" });
    }
    const token = crypto.randomUUID();
    sessions.set(token, user.id);
    saveSessions(sessions);
    res.json({ token, user: { id: user.id, username: user.username } });
  });

  app.get("/api/auth/me", async (req: Request, res: Response) => {
    const userId = authenticateRequest(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const user = await storage.getUser(userId);
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json({ id: user.id, username: user.username });
  });

  app.post("/api/auth/logout", (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
      sessions.delete(authHeader.slice(7));
      saveSessions(sessions);
    }
    res.json({ message: "Logged out" });
  });

  app.get("/api/quests", (req: Request, res: Response) => {
    const userId = authenticateRequest(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    res.json(quests);
  });

  app.get("/api/quests/:id", (req: Request, res: Response) => {
    const userId = authenticateRequest(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const quest = quests.find((q) => q.id === req.params.id);
    if (!quest) return res.status(404).json({ message: "Quest not found" });
    res.json(quest);
  });

  app.post("/api/submissions", (req: Request, res: Response) => {
    const userId = authenticateRequest(req);
    if (!userId) {
      const authHeader = req.headers.authorization;
      console.warn(`[AUTH] /api/submissions 401 — header="${authHeader?.slice(0, 40) ?? "(missing)"}"`);
      return res.status(401).json({ message: "Unauthorized" });
    }
    const { questId, recordingId } = req.body;
    if (!questId || !recordingId) {
      return res.status(400).json({ message: "questId and recordingId are required" });
    }
    const submissionId = crypto.randomUUID();
    res.json({ submissionId, questId, recordingId, status: "pending" });
  });

  app.post("/api/submissions/:id/confirm", (req: Request, res: Response) => {
    const userId = authenticateRequest(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const { s3Url } = req.body;
    res.json({ submissionId: req.params.id, status: "uploaded", s3Url });
  });

  app.post("/api/uploads/initiate", async (req: Request, res: Response) => {
    const userId = authenticateRequest(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const { s3Key, contentType } = req.body;
    if (!s3Key || !contentType) {
      return res.status(400).json({ message: "s3Key and contentType are required" });
    }
    try {
      const result = await initiateMultipartUpload(s3Key, contentType);
      res.json(result);
    } catch (err: unknown) {
      console.error("Initiate multipart upload error:", err);
      const awsErr = err as { name?: string; message?: string };
      const code = awsErr?.name ?? "UnknownError";
      const detail = awsErr?.message ?? "Failed to initiate upload";
      res.status(500).json({ message: `S3 error (${code}): ${detail}` });
    }
  });

  app.post("/api/uploads/part-url", async (req: Request, res: Response) => {
    const userId = authenticateRequest(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const { uploadId, s3Key, partNumber } = req.body;
    if (!uploadId || !s3Key || !partNumber) {
      return res.status(400).json({ message: "uploadId, s3Key, and partNumber are required" });
    }
    try {
      const presignedUrl = await getPartPresignedUrl(s3Key, uploadId, partNumber);
      res.json({ presignedUrl });
    } catch (err) {
      console.error("Get part URL error:", err);
      res.status(500).json({ message: "Failed to generate part URL" });
    }
  });

  app.post("/api/uploads/complete", async (req: Request, res: Response) => {
    const userId = authenticateRequest(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const { uploadId, s3Key, parts } = req.body;
    if (!uploadId || !s3Key || !parts) {
      return res.status(400).json({ message: "uploadId, s3Key, and parts are required" });
    }
    try {
      const location = await completeMultipartUpload(s3Key, uploadId, parts);
      res.json({ location });
    } catch (err) {
      console.error("Complete multipart upload error:", err);
      res.status(500).json({ message: "Failed to complete upload" });
    }
  });

  app.post("/api/uploads/abort", async (req: Request, res: Response) => {
    const userId = authenticateRequest(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const { uploadId, s3Key } = req.body;
    if (!uploadId || !s3Key) {
      return res.status(400).json({ message: "uploadId and s3Key are required" });
    }
    try {
      await abortMultipartUpload(s3Key, uploadId);
      res.json({ aborted: true });
    } catch (err) {
      console.error("Abort multipart upload error:", err);
      res.status(500).json({ message: "Failed to abort upload" });
    }
  });

  app.post("/api/uploads/presign", async (req: Request, res: Response) => {
    const userId = authenticateRequest(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const { s3Key, contentType } = req.body;
    if (!s3Key || !contentType) {
      return res.status(400).json({ message: "s3Key and contentType are required" });
    }
    try {
      const presignedUrl = await getObjectPresignedUrl(s3Key, contentType);
      res.json({ presignedUrl, s3Key });
    } catch (err: unknown) {
      console.error("Presign error:", err);
      const awsErr = err as { name?: string; message?: string };
      const code = awsErr?.name ?? "UnknownError";
      const detail = awsErr?.message ?? "Failed to generate presigned URL";
      res.status(500).json({ message: `S3 error (${code}): ${detail}` });
    }
  });

  app.get("/api/admin/s3-audit", async (_req: Request, res: Response) => {
    try {
      const objects = await listSessionObjects("sessions/");
      const sessions: Record<string, { file: string; sizeMB: string; lastModified: string | undefined }[]> = {};
      for (const obj of objects) {
        const parts = obj.key.split("/");
        const sid = parts[1];
        const file = parts[2];
        if (!sid || !file) continue;
        if (!sessions[sid]) sessions[sid] = [];
        sessions[sid].push({
          file,
          sizeMB: (obj.size / 1024 / 1024).toFixed(3),
          lastModified: obj.lastModified?.toISOString(),
        });
      }
      const REQUIRED = ["video.mp4","imu.jsonl","metadata.json","qc_report.json","video_timestamps.jsonl","hand_landmarks.jsonl","face_presence.jsonl","frame_qc_metrics.jsonl","session_manifest.json","camera_mount.json"];
      const OPTIONAL = ["head_pose.jsonl","camera_calibration.json"];
      const report = Object.entries(sessions).map(([sid, files]) => {
        const names = files.map((f) => f.file);
        return {
          sessionId: sid,
          fileCount: files.length,
          files,
          missingRequired: REQUIRED.filter((f) => !names.includes(f)),
          missingOptional: OPTIONAL.filter((f) => !names.includes(f)),
          complete: REQUIRED.every((f) => names.includes(f)),
        };
      });
      res.json({ bucket: process.env.AWS_S3_BUCKET, totalSessions: report.length, sessions: report });
    } catch (err: unknown) {
      res.status(500).json({ error: String(err) });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
