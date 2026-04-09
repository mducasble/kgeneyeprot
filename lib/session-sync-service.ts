export interface SessionTiming {
  sessionStartEpochMs: number;
  imuStartEpochMs: number;
  videoStartEpochMs: number;
  recordingStopEpochMs: number;
  durationMs: number;
}

interface SessionState {
  sessionId: string;
  sessionStartEpochMs: number;
  imuStartEpochMs: number;
  videoStartEpochMs: number;
  recordingStopEpochMs: number;
}

let session: SessionState | null = null;

export function createSession(): { sessionId: string; sessionStartEpochMs: number } {
  const sessionId =
    Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
  const sessionStartEpochMs = Date.now();

  session = {
    sessionId,
    sessionStartEpochMs,
    imuStartEpochMs: 0,
    videoStartEpochMs: 0,
    recordingStopEpochMs: 0,
  };

  console.log(`[SYNC] Session created: ${sessionId} at ${sessionStartEpochMs}`);
  return { sessionId, sessionStartEpochMs };
}

export function markIMUStart(): void {
  if (!session) return;
  session.imuStartEpochMs = Date.now();
  console.log(`[SYNC] IMU start: ${session.imuStartEpochMs}`);
}

export function markVideoStart(): void {
  if (!session) return;
  session.videoStartEpochMs = Date.now();
  console.log(`[SYNC] Video start: ${session.videoStartEpochMs}`);
}

export function markRecordingStop(): void {
  if (!session) return;
  session.recordingStopEpochMs = Date.now();
  console.log(`[SYNC] Recording stop: ${session.recordingStopEpochMs}`);
}

export function getSessionTiming(): SessionTiming {
  if (!session) {
    return {
      sessionStartEpochMs: 0,
      imuStartEpochMs: 0,
      videoStartEpochMs: 0,
      recordingStopEpochMs: 0,
      durationMs: 0,
    };
  }
  const durationMs =
    session.recordingStopEpochMs > 0 && session.videoStartEpochMs > 0
      ? session.recordingStopEpochMs - session.videoStartEpochMs
      : 0;

  return {
    sessionStartEpochMs: session.sessionStartEpochMs,
    imuStartEpochMs: session.imuStartEpochMs,
    videoStartEpochMs: session.videoStartEpochMs,
    recordingStopEpochMs: session.recordingStopEpochMs,
    durationMs,
  };
}

export function getCurrentSessionId(): string | null {
  return session?.sessionId ?? null;
}

export function clearSession(): void {
  session = null;
}
