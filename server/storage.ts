import { type User, type InsertUser } from "@shared/schema";
import { randomUUID } from "crypto";
import * as fs from "fs";
import * as path from "path";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
}

const DATA_FILE = path.join(process.cwd(), ".data", "users.json");

function ensureDataDir() {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function readUsers(): Map<string, User> {
  try {
    ensureDataDir();
    if (!fs.existsSync(DATA_FILE)) return new Map();
    const raw = fs.readFileSync(DATA_FILE, "utf-8");
    const arr: User[] = JSON.parse(raw);
    return new Map(arr.map((u) => [u.id, u]));
  } catch {
    return new Map();
  }
}

function writeUsers(users: Map<string, User>) {
  try {
    ensureDataDir();
    fs.writeFileSync(DATA_FILE, JSON.stringify(Array.from(users.values()), null, 2));
  } catch (e) {
    console.error("Failed to persist users:", e);
  }
}

export class FileStorage implements IStorage {
  private users: Map<string, User>;

  constructor() {
    this.users = readUsers();
    console.log(`Loaded ${this.users.size} user(s) from disk`);
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    writeUsers(this.users);
    return user;
  }
}

export const storage = new FileStorage();
