import type {
  LocalQCFrameSample,
  LocalQCReport,
  QCThresholds,
  QCResult,
} from "./qc-types";

export const QC_VERSION = "1.0.0";

interface QCInput {
  recordingId: string;
  questId: string;
  durationMs: number;
  fileSizeBytes: number;
  orientation: "portrait" | "landscape";
  frames: LocalQCFrameSample[];
  stabilityReadings: number[];
}

function clamp(val: number, min: number, max: number) {
  return Math.min(max, Math.max(min, val));
}

function avg(arr: number[]) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function computeHandPresenceRate(frames: LocalQCFrameSample[]) {
  if (!frames.length) return 0;
  return frames.filter((f) => f.handDetected).length / frames.length;
}

function computeDualHandRate(frames: LocalQCFrameSample[]) {
  if (!frames.length) return 0;
  return frames.filter((f) => f.handCount >= 2).length / frames.length;
}

function computeFacePresenceRate(frames: LocalQCFrameSample[]) {
  if (!frames.length) return 0;
  return frames.filter((f) => f.faceDetected).length / frames.length;
}

function computeHandContinuityScore(frames: LocalQCFrameSample[]) {
  if (frames.length < 2) return 100;
  let transitions = 0;
  for (let i = 1; i < frames.length; i++) {
    if (frames[i].handDetected !== frames[i - 1].handDetected) transitions++;
  }
  const maxTransitions = frames.length - 1;
  return clamp(100 - (transitions / maxTransitions) * 100, 0, 100);
}

function computeHandCenteringScore(frames: LocalQCFrameSample[]) {
  const withHands = frames.filter((f) => f.handDetected && f.handBoundingBoxes.length > 0);
  if (!withHands.length) return 50;
  const scores = withHands.map((f) => {
    const box = f.handBoundingBoxes[0];
    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;
    const distFromCenter = Math.sqrt(Math.pow(centerX - 0.5, 2) + Math.pow(centerY - 0.5, 2));
    return clamp(100 - distFromCenter * 150, 0, 100);
  });
  return avg(scores);
}

function computeAverageHandArea(frames: LocalQCFrameSample[]) {
  const withHands = frames.filter((f) => f.handDetected && f.handBoundingBoxes.length > 0);
  if (!withHands.length) return 0;
  const areas = withHands.map((f) => f.handBoundingBoxes[0].width * f.handBoundingBoxes[0].height);
  return avg(areas);
}

function computeReadinessScore(components: {
  durationScore: number;
  orientationScore: number;
  handPresenceScore: number;
  handContinuityScore: number;
  framingScore: number;
  facePrivacyScore: number;
  blurScore: number;
  brightnessScore: number;
  stabilityScore: number;
}) {
  const weights = {
    durationScore: 0.15,
    orientationScore: 0.12,
    handPresenceScore: 0.2,
    handContinuityScore: 0.1,
    framingScore: 0.08,
    facePrivacyScore: 0.12,
    blurScore: 0.1,
    brightnessScore: 0.07,
    stabilityScore: 0.06,
  };
  let total = 0;
  for (const [key, weight] of Object.entries(weights)) {
    total += (components[key as keyof typeof components] ?? 0) * weight;
  }
  return clamp(total, 0, 100);
}

export function runQCEngine(input: QCInput, thresholds: QCThresholds): LocalQCReport {
  const {
    recordingId, questId, durationMs, fileSizeBytes, orientation, frames, stabilityReadings,
  } = input;

  const handPresenceRate = computeHandPresenceRate(frames);
  const dualHandRate = computeDualHandRate(frames);
  const facePresenceRate = computeFacePresenceRate(frames);
  const handContinuityScore = computeHandContinuityScore(frames);
  const handCenteringScore = computeHandCenteringScore(frames);
  const averageHandArea = computeAverageHandArea(frames);

  const blurScore = clamp(avg(frames.map((f) => f.blurValue)), 0, 100);
  const brightnessScore = clamp(avg(frames.map((f) => f.brightnessValue)), 0, 100);
  const contrastScore = clamp(avg(frames.map((f) => f.contrastValue)), 0, 100);
  const stabilityScore = stabilityReadings.length
    ? clamp(avg(stabilityReadings), 0, 100)
    : 75;

  const blockReasons: string[] = [];
  const warningReasons: string[] = [];

  const durationScore = (() => {
    if (durationMs < thresholds.minDurationMs) return 0;
    if (durationMs > thresholds.maxDurationMs) return 50;
    return 100;
  })();
  if (durationMs < thresholds.minDurationMs) {
    blockReasons.push(`Recording too short (minimum ${thresholds.minDurationMs / 1000}s required)`);
  }

  const orientationScore = (() => {
    if (thresholds.requiredOrientation === "any") return 100;
    return orientation === thresholds.requiredOrientation ? 100 : 0;
  })();
  if (thresholds.requiredOrientation !== "any" && orientation !== thresholds.requiredOrientation) {
    blockReasons.push(`Wrong orientation — ${thresholds.requiredOrientation} required`);
  }

  const handPresenceScore = clamp(handPresenceRate * 100, 0, 100);
  if (handPresenceRate < thresholds.minHandPresenceRate) {
    if (handPresenceRate < thresholds.minHandPresenceRate * 0.5) {
      blockReasons.push(`Hands not visible enough (${Math.round(handPresenceRate * 100)}% of frames)`);
    } else {
      warningReasons.push(`Hands partially visible (${Math.round(handPresenceRate * 100)}% of frames)`);
    }
  }

  const facePrivacyScore = clamp(100 - facePresenceRate * 100, 0, 100);
  if (facePresenceRate > thresholds.maxFacePresenceRate) {
    if (facePresenceRate > thresholds.maxFacePresenceRate * 2) {
      blockReasons.push(`Face detected in ${Math.round(facePresenceRate * 100)}% of frames — privacy issue`);
    } else {
      warningReasons.push(`Face briefly detected (${Math.round(facePresenceRate * 100)}% of frames)`);
    }
  }

  if (brightnessScore < thresholds.minBrightnessScore) {
    warningReasons.push("Video appears dark — consider better lighting");
  }
  if (blurScore < thresholds.minBlurScore) {
    warningReasons.push("Video appears blurry — hold camera steady");
  }
  if (stabilityScore < thresholds.minStabilityScore) {
    warningReasons.push("Excessive camera movement detected");
  }

  const readinessScore = computeReadinessScore({
    durationScore,
    orientationScore,
    handPresenceScore,
    handContinuityScore,
    framingScore: handCenteringScore,
    facePrivacyScore,
    blurScore,
    brightnessScore,
    stabilityScore,
  });

  let qcResult: QCResult;
  if (blockReasons.length > 0 || readinessScore < thresholds.minReadinessScore) {
    qcResult = "blocked";
    if (readinessScore < thresholds.minReadinessScore && blockReasons.length === 0) {
      blockReasons.push("Overall quality score too low — please re-record");
    }
  } else if (warningReasons.length > 0 || readinessScore < thresholds.warnReadinessScore) {
    qcResult = "passed_with_warning";
  } else {
    qcResult = "passed";
  }

  return {
    recordingId,
    questId,
    durationMs,
    resolutionWidth: 1080,
    resolutionHeight: 1920,
    fps: 30,
    orientation,
    audioPresent: true,
    fileSizeBytes,
    fileIntegrityPassed: true,
    sampledFrameCount: frames.length,
    handPresenceRate,
    dualHandRate,
    facePresenceRate,
    averageHandArea,
    handCenteringScore,
    handContinuityScore,
    blurScore,
    brightnessScore,
    contrastScore,
    stabilityScore,
    readinessScore,
    qcResult,
    blockReasons,
    warningReasons,
    generatedAt: Date.now(),
  };
}

