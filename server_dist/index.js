// server/index.ts
import express from "express";

// server/routes.ts
import { createServer } from "node:http";

// server/storage.ts
import { randomUUID } from "crypto";
import * as fs from "fs";
import * as path from "path";
var DATA_FILE = path.join(process.cwd(), ".data", "users.json");
function ensureDataDir() {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}
function readUsers() {
  try {
    ensureDataDir();
    if (!fs.existsSync(DATA_FILE)) return /* @__PURE__ */ new Map();
    const raw = fs.readFileSync(DATA_FILE, "utf-8");
    const arr = JSON.parse(raw);
    return new Map(arr.map((u) => [u.id, u]));
  } catch {
    return /* @__PURE__ */ new Map();
  }
}
function writeUsers(users) {
  try {
    ensureDataDir();
    fs.writeFileSync(DATA_FILE, JSON.stringify(Array.from(users.values()), null, 2));
  } catch (e) {
    console.error("Failed to persist users:", e);
  }
}
var FileStorage = class {
  users;
  constructor() {
    this.users = readUsers();
    console.log(`Loaded ${this.users.size} user(s) from disk`);
  }
  async getUser(id) {
    return this.users.get(id);
  }
  async getUserByUsername(username) {
    return Array.from(this.users.values()).find(
      (user) => user.username === username
    );
  }
  async createUser(insertUser) {
    const id = randomUUID();
    const user = { ...insertUser, id };
    this.users.set(id, user);
    writeUsers(this.users);
    return user;
  }
};
var storage = new FileStorage();

// server/routes.ts
import * as crypto from "crypto";
import * as path2 from "path";
import * as fs2 from "fs";

// server/s3-multipart.ts
import {
  S3Client,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  PutObjectCommand
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
var s3 = new S3Client({
  region: process.env.AWS_S3_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});
var BUCKET = process.env.AWS_S3_BUCKET === "kaivoice" ? "kaivideo" : process.env.AWS_S3_BUCKET;
async function initiateMultipartUpload(s3Key, contentType) {
  const cmd = new CreateMultipartUploadCommand({
    Bucket: BUCKET,
    Key: s3Key,
    ContentType: contentType
  });
  const result = await s3.send(cmd);
  return { uploadId: result.UploadId, s3Key };
}
async function getPartPresignedUrl(s3Key, uploadId, partNumber) {
  const cmd = new UploadPartCommand({
    Bucket: BUCKET,
    Key: s3Key,
    UploadId: uploadId,
    PartNumber: partNumber
  });
  return await getSignedUrl(s3, cmd, { expiresIn: 3600 });
}
async function completeMultipartUpload(s3Key, uploadId, parts) {
  const cmd = new CompleteMultipartUploadCommand({
    Bucket: BUCKET,
    Key: s3Key,
    UploadId: uploadId,
    MultipartUpload: { Parts: parts }
  });
  const result = await s3.send(cmd);
  return result.Location ?? `https://${BUCKET}.s3.${process.env.AWS_S3_REGION}.amazonaws.com/${s3Key}`;
}
async function abortMultipartUpload(s3Key, uploadId) {
  const cmd = new AbortMultipartUploadCommand({
    Bucket: BUCKET,
    Key: s3Key,
    UploadId: uploadId
  });
  await s3.send(cmd);
}
async function getObjectPresignedUrl(s3Key, contentType) {
  const cmd = new PutObjectCommand({
    Bucket: BUCKET,
    Key: s3Key,
    ContentType: contentType
  });
  return await getSignedUrl(s3, cmd, { expiresIn: 3600 });
}

// server/routes.ts
var SESSIONS_FILE = path2.join(process.cwd(), ".data", "sessions.json");
function loadSessions() {
  try {
    if (!fs2.existsSync(SESSIONS_FILE)) return /* @__PURE__ */ new Map();
    const raw = fs2.readFileSync(SESSIONS_FILE, "utf-8");
    const obj = JSON.parse(raw);
    return new Map(Object.entries(obj));
  } catch {
    return /* @__PURE__ */ new Map();
  }
}
function saveSessions(sessions2) {
  try {
    const dir = path2.dirname(SESSIONS_FILE);
    if (!fs2.existsSync(dir)) fs2.mkdirSync(dir, { recursive: true });
    fs2.writeFileSync(SESSIONS_FILE, JSON.stringify(Object.fromEntries(sessions2), null, 2));
  } catch (e) {
    console.error("Failed to persist sessions:", e);
  }
}
var sessions = loadSessions();
var quests = [
  {
    id: "quest-001",
    title: "Morning Routine Capture",
    description: "Record your complete morning routine from waking up to leaving home. Focus on showing each step clearly.",
    instructions: [
      "Start recording when you wake up",
      "Show your morning preparation steps",
      "Include any breakfast preparation",
      "End recording when you leave or start your day"
    ],
    category: "Daily Life",
    estimatedDuration: "5-15 min",
    reward: 50,
    status: "available",
    difficulty: "easy"
  },
  {
    id: "quest-002",
    title: "Kitchen Cooking Session",
    description: "Record yourself cooking a meal from start to finish. Show ingredient preparation, cooking steps, and plating.",
    instructions: [
      "Show all ingredients before starting",
      "Record each cooking step clearly",
      "Keep the camera steady on the cooking area",
      "Show the final plated dish"
    ],
    category: "Cooking",
    estimatedDuration: "15-30 min",
    reward: 100,
    status: "available",
    difficulty: "medium"
  },
  {
    id: "quest-003",
    title: "Outdoor Walking Path",
    description: "Record a walking session outdoors. Capture the environment, path conditions, and navigation decisions.",
    instructions: [
      "Hold the camera at chest level",
      "Walk at a normal pace",
      "Capture intersections and turns",
      "Record for at least 5 minutes"
    ],
    category: "Navigation",
    estimatedDuration: "5-10 min",
    reward: 40,
    status: "available",
    difficulty: "easy"
  },
  {
    id: "quest-004",
    title: "Workspace Setup Documentation",
    description: "Record a tour of your workspace, showing your desk setup, equipment, and how you organize your work area.",
    instructions: [
      "Start with a wide shot of the workspace",
      "Show each piece of equipment",
      "Demonstrate your organization system",
      "Include any unique features"
    ],
    category: "Work",
    estimatedDuration: "3-5 min",
    reward: 30,
    status: "available",
    difficulty: "easy"
  },
  {
    id: "quest-005",
    title: "Public Transport Journey",
    description: "Record a public transportation trip from boarding to arriving at your destination.",
    instructions: [
      "Record boarding the vehicle",
      "Show the interior environment",
      "Capture stops and announcements",
      "Record the exit at your destination"
    ],
    category: "Transportation",
    estimatedDuration: "10-30 min",
    reward: 75,
    status: "available",
    difficulty: "medium"
  },
  {
    id: "quest-006",
    title: "Grocery Shopping Trip",
    description: "Record your grocery shopping experience from entering the store to checkout.",
    instructions: [
      "Show the store entrance",
      "Record browsing through aisles",
      "Show product selection process",
      "Capture the checkout process"
    ],
    category: "Shopping",
    estimatedDuration: "15-30 min",
    reward: 80,
    status: "available",
    difficulty: "medium"
  }
];
function authenticateRequest(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  return sessions.get(token) || null;
}
async function registerRoutes(app2) {
  app2.post("/api/auth/register", async (req, res) => {
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
  app2.post("/api/auth/login", async (req, res) => {
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
  app2.get("/api/auth/me", async (req, res) => {
    const userId = authenticateRequest(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const user = await storage.getUser(userId);
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json({ id: user.id, username: user.username });
  });
  app2.post("/api/auth/logout", (req, res) => {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
      sessions.delete(authHeader.slice(7));
      saveSessions(sessions);
    }
    res.json({ message: "Logged out" });
  });
  app2.get("/api/quests", (req, res) => {
    const userId = authenticateRequest(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    res.json(quests);
  });
  app2.get("/api/quests/:id", (req, res) => {
    const userId = authenticateRequest(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const quest = quests.find((q) => q.id === req.params.id);
    if (!quest) return res.status(404).json({ message: "Quest not found" });
    res.json(quest);
  });
  app2.post("/api/submissions", (req, res) => {
    const userId = authenticateRequest(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const { questId, recordingId } = req.body;
    if (!questId || !recordingId) {
      return res.status(400).json({ message: "questId and recordingId are required" });
    }
    const submissionId = crypto.randomUUID();
    res.json({ submissionId, questId, recordingId, status: "pending" });
  });
  app2.post("/api/submissions/:id/confirm", (req, res) => {
    const userId = authenticateRequest(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const { s3Url } = req.body;
    res.json({ submissionId: req.params.id, status: "uploaded", s3Url });
  });
  app2.post("/api/uploads/initiate", async (req, res) => {
    const userId = authenticateRequest(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const { s3Key, contentType } = req.body;
    if (!s3Key || !contentType) {
      return res.status(400).json({ message: "s3Key and contentType are required" });
    }
    try {
      const result = await initiateMultipartUpload(s3Key, contentType);
      res.json(result);
    } catch (err) {
      console.error("Initiate multipart upload error:", err);
      const awsErr = err;
      const code = awsErr?.name ?? "UnknownError";
      const detail = awsErr?.message ?? "Failed to initiate upload";
      res.status(500).json({ message: `S3 error (${code}): ${detail}` });
    }
  });
  app2.post("/api/uploads/part-url", async (req, res) => {
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
  app2.post("/api/uploads/complete", async (req, res) => {
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
  app2.post("/api/uploads/abort", async (req, res) => {
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
  app2.post("/api/uploads/presign", async (req, res) => {
    const userId = authenticateRequest(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const { s3Key, contentType } = req.body;
    if (!s3Key || !contentType) {
      return res.status(400).json({ message: "s3Key and contentType are required" });
    }
    try {
      const presignedUrl = await getObjectPresignedUrl(s3Key, contentType);
      res.json({ presignedUrl, s3Key });
    } catch (err) {
      console.error("Presign error:", err);
      const awsErr = err;
      const code = awsErr?.name ?? "UnknownError";
      const detail = awsErr?.message ?? "Failed to generate presigned URL";
      res.status(500).json({ message: `S3 error (${code}): ${detail}` });
    }
  });
  const httpServer = createServer(app2);
  return httpServer;
}

// server/index.ts
import * as fs3 from "fs";
import * as path3 from "path";
var app = express();
var log = console.log;
function setupCors(app2) {
  app2.use((req, res, next) => {
    const origins = /* @__PURE__ */ new Set();
    if (process.env.REPLIT_DEV_DOMAIN) {
      origins.add(`https://${process.env.REPLIT_DEV_DOMAIN}`);
    }
    if (process.env.REPLIT_DOMAINS) {
      process.env.REPLIT_DOMAINS.split(",").forEach((d) => {
        origins.add(`https://${d.trim()}`);
      });
    }
    const origin = req.header("origin");
    const isLocalhost = origin?.startsWith("http://localhost:") || origin?.startsWith("http://127.0.0.1:");
    if (origin && (origins.has(origin) || isLocalhost)) {
      res.header("Access-Control-Allow-Origin", origin);
      res.header(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, DELETE, OPTIONS"
      );
      res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.header("Access-Control-Allow-Credentials", "true");
    }
    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }
    next();
  });
}
function setupBodyParsing(app2) {
  app2.use(
    express.json({
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      }
    })
  );
  app2.use(express.urlencoded({ extended: false }));
}
function setupRequestLogging(app2) {
  app2.use((req, res, next) => {
    const start = Date.now();
    const path4 = req.path;
    let capturedJsonResponse = void 0;
    const originalResJson = res.json;
    res.json = function(bodyJson, ...args) {
      capturedJsonResponse = bodyJson;
      return originalResJson.apply(res, [bodyJson, ...args]);
    };
    res.on("finish", () => {
      if (!path4.startsWith("/api")) return;
      const duration = Date.now() - start;
      let logLine = `${req.method} ${path4} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse && !path4.startsWith("/api/auth")) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }
      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "\u2026";
      }
      log(logLine);
    });
    next();
  });
}
function getAppName() {
  try {
    const appJsonPath = path3.resolve(process.cwd(), "app.json");
    const appJsonContent = fs3.readFileSync(appJsonPath, "utf-8");
    const appJson = JSON.parse(appJsonContent);
    return appJson.expo?.name || "App Landing Page";
  } catch {
    return "App Landing Page";
  }
}
function serveExpoManifest(platform, res) {
  const manifestPath = path3.resolve(
    process.cwd(),
    "static-build",
    platform,
    "manifest.json"
  );
  if (!fs3.existsSync(manifestPath)) {
    return res.status(404).json({ error: `Manifest not found for platform: ${platform}` });
  }
  res.setHeader("expo-protocol-version", "1");
  res.setHeader("expo-sfv-version", "0");
  res.setHeader("content-type", "application/json");
  const manifest = fs3.readFileSync(manifestPath, "utf-8");
  res.send(manifest);
}
function serveLandingPage({
  req,
  res,
  landingPageTemplate,
  appName
}) {
  const forwardedProto = req.header("x-forwarded-proto");
  const protocol = forwardedProto || req.protocol || "https";
  const forwardedHost = req.header("x-forwarded-host");
  const host = forwardedHost || req.get("host");
  const baseUrl = `${protocol}://${host}`;
  const expsUrl = `${host}`;
  log(`baseUrl`, baseUrl);
  log(`expsUrl`, expsUrl);
  const html = landingPageTemplate.replace(/BASE_URL_PLACEHOLDER/g, baseUrl).replace(/EXPS_URL_PLACEHOLDER/g, expsUrl).replace(/APP_NAME_PLACEHOLDER/g, appName);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(200).send(html);
}
function configureExpoAndLanding(app2) {
  const templatePath = path3.resolve(
    process.cwd(),
    "server",
    "templates",
    "landing-page.html"
  );
  const landingPageTemplate = fs3.readFileSync(templatePath, "utf-8");
  const appName = getAppName();
  log("Serving static Expo files with dynamic manifest routing");
  app2.use((req, res, next) => {
    if (req.path.startsWith("/api")) {
      return next();
    }
    if (req.path !== "/" && req.path !== "/manifest") {
      return next();
    }
    const platform = req.header("expo-platform");
    if (platform && (platform === "ios" || platform === "android")) {
      return serveExpoManifest(platform, res);
    }
    if (req.path === "/") {
      return serveLandingPage({
        req,
        res,
        landingPageTemplate,
        appName
      });
    }
    next();
  });
  app2.use("/assets", express.static(path3.resolve(process.cwd(), "assets")));
  app2.use(express.static(path3.resolve(process.cwd(), "static-build")));
  log("Expo routing: Checking expo-platform header on / and /manifest");
}
function setupErrorHandler(app2) {
  app2.use((err, _req, res, next) => {
    const error = err;
    const status = error.status || error.statusCode || 500;
    const message = error.message || "Internal Server Error";
    console.error("Internal Server Error:", err);
    if (res.headersSent) {
      return next(err);
    }
    return res.status(status).json({ message });
  });
}
(async () => {
  setupCors(app);
  setupBodyParsing(app);
  setupRequestLogging(app);
  const awsVars = ["AWS_S3_BUCKET", "AWS_S3_REGION", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"];
  const missingAws = awsVars.filter((v) => !process.env[v]);
  if (missingAws.length > 0) {
    console.warn(`[S3] Missing AWS env vars: ${missingAws.join(", ")} \u2014 uploads will fail`);
  } else {
    const effectiveBucket = process.env.AWS_S3_BUCKET === "kaivoice" ? "kaivideo" : process.env.AWS_S3_BUCKET;
    log(`[S3] Configured: bucket=${effectiveBucket} region=${process.env.AWS_S3_REGION}`);
  }
  configureExpoAndLanding(app);
  const server = await registerRoutes(app);
  setupErrorHandler(app);
  const port = parseInt(process.env.PORT || "5000", 10);
  server.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true
    },
    () => {
      log(`express server serving on port ${port}`);
    }
  );
})();
