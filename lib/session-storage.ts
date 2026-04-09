import { Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";

function sessionDir(sessionId: string): string {
  return `${FileSystem.documentDirectory ?? ""}sessions/${sessionId}/`;
}

export async function createSessionFolder(sessionId: string): Promise<string> {
  const dir = sessionDir(sessionId);
  if (Platform.OS !== "web") {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
  console.log(`[SESSION] Folder created: ${dir}`);
  return dir;
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
}> {
  const dir = sessionDir(sessionId);
  return {
    imuPath: `${dir}imu.jsonl`,
    metadataPath: `${dir}metadata.json`,
    qcReportPath: `${dir}qc_report.json`,
  };
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
