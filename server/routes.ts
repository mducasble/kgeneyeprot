import type { Express, Request, Response } from "express";
import { createServer, type Server } from "node:http";
import { storage } from "./storage";
import * as crypto from "crypto";

const sessions: Map<string, string> = new Map();

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
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const { questId, recordingId } = req.body;
    if (!questId || !recordingId) {
      return res.status(400).json({ message: "questId and recordingId are required" });
    }
    const submissionId = crypto.randomUUID();
    res.json({
      submissionId,
      questId,
      recordingId,
      uploadUrl: `https://mock-s3-bucket.s3.amazonaws.com/uploads/${submissionId}`,
      status: "pending",
    });
  });

  app.post("/api/submissions/:id/confirm", (req: Request, res: Response) => {
    const userId = authenticateRequest(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    res.json({ submissionId: req.params.id, status: "uploaded" });
  });

  const httpServer = createServer(app);
  return httpServer;
}
