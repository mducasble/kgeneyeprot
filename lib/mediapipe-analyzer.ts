import { Platform } from "react-native";
import type { LocalQCFrameSample } from "./qc-types";

const MEDIAPIPE_VERSION = "0.10.32";
const SINGLETON_KEY = `mp-${MEDIAPIPE_VERSION}`;
const MEDIAPIPE_WASM_CDN = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;
const MEDIAPIPE_WASM_FALLBACK = `https://unpkg.com/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;

const HAND_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

const FACE_LANDMARKER_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

let _singletonKey: string | null = null;
let handLandmarker: any = null;
let faceLandmarker: any = null;
let initPromise: Promise<boolean> | null = null;
let mediaPipeReady = false;

function resetSingletons() {
  handLandmarker = null;
  faceLandmarker = null;
  initPromise = null;
  mediaPipeReady = false;
  _singletonKey = null;
}

async function tryInitWithWasm(wasmPath: string): Promise<boolean> {
  const { FilesetResolver, HandLandmarker, FaceLandmarker } = await import(
    "@mediapipe/tasks-vision"
  );
  console.log("[MediaPipe] Trying WASM from:", wasmPath);
  const vision = await FilesetResolver.forVisionTasks(wasmPath);
  console.log("[MediaPipe] FilesetResolver OK, loading HandLandmarker...");

  handLandmarker = await HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: HAND_MODEL_URL,
    },
    runningMode: "IMAGE",
    numHands: 2,
    minHandDetectionConfidence: 0.4,
    minHandPresenceConfidence: 0.4,
    minTrackingConfidence: 0.4,
  });

  console.log("[MediaPipe] HandLandmarker ready. Trying FaceLandmarker...");

  try {
    faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: FACE_LANDMARKER_URL,
      },
      runningMode: "IMAGE",
      numFaces: 1,
      minFaceDetectionConfidence: 0.4,
      minFacePresenceConfidence: 0.4,
      minTrackingConfidence: 0.4,
    });
    console.log("[MediaPipe] FaceLandmarker ready");
  } catch (fe: any) {
    console.warn(
      "[MediaPipe] FaceLandmarker unavailable — face checks will default to 'no face':",
      fe?.message ?? fe,
    );
    faceLandmarker = null;
  }

  mediaPipeReady = true;
  _singletonKey = SINGLETON_KEY;
  console.log("[MediaPipe] Init complete (hands=ready, face=" + (faceLandmarker ? "ready" : "unavailable") + ")");
  return true;
}

async function initMediaPipe(): Promise<boolean> {
  if (mediaPipeReady && handLandmarker && _singletonKey === SINGLETON_KEY) return true;
  if (_singletonKey !== SINGLETON_KEY) resetSingletons();
  if (initPromise) return initPromise;

  initPromise = (async () => {
    for (const wasmPath of [MEDIAPIPE_WASM_CDN, MEDIAPIPE_WASM_FALLBACK]) {
      try {
        const ok = await tryInitWithWasm(wasmPath);
        if (ok) return true;
      } catch (e: any) {
        const msg = e?.message ?? JSON.stringify(e);
        console.warn(`[MediaPipe] Init failed with ${wasmPath}:`, msg);
        handLandmarker = null;
        faceLandmarker = null;
      }
    }
    initPromise = null;
    return false;
  })();

  return initPromise;
}

function seekAndCapture(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  timeS: number,
): Promise<ImageData | null> {
  return new Promise((resolve) => {
    const cleanup = setTimeout(() => {
      video.onseeked = null;
      resolve(null);
    }, 5000);

    video.onseeked = () => {
      clearTimeout(cleanup);
      video.onseeked = null;
      try {
        const ctx = canvas.getContext("2d");
        if (!ctx) { resolve(null); return; }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        resolve(ctx.getImageData(0, 0, canvas.width, canvas.height));
      } catch {
        resolve(null);
      }
    };

    video.currentTime = timeS;
  });
}

function pixelBrightnessAndVariance(data: Uint8ClampedArray): {
  brightness: number;
  variance: number;
} {
  const total = data.length / 4;
  const step = Math.max(1, Math.floor(total / 2000));
  let sum = 0;
  let count = 0;

  for (let i = 0; i < data.length; i += 4 * step) {
    sum += data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    count++;
  }

  const mean = count > 0 ? sum / count : 128;
  let varSum = 0;

  for (let i = 0; i < data.length; i += 4 * step) {
    const lum = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    varSum += (lum - mean) ** 2;
  }

  const variance = count > 0 ? varSum / count : 1000;
  return { brightness: mean, variance };
}

function isSimulatedUri(uri: string): boolean {
  return uri.startsWith("file://simulated") || uri === "";
}

async function analyzeOnWeb(
  videoUri: string,
  durationMs: number,
  stabilityData: number[],
  onProgress?: (p: number) => void,
): Promise<LocalQCFrameSample[]> {
  if (isSimulatedUri(videoUri)) {
    return generateSimulatedFrames(durationMs, stabilityData);
  }

  onProgress?.(2);

  const ok = await initMediaPipe();
  onProgress?.(12);

  if (!ok || !handLandmarker) {
    console.warn("[MediaPipe] Falling back to simulation");
    return generateSimulatedFrames(durationMs, stabilityData);
  }

  const video = document.createElement("video");
  video.crossOrigin = "anonymous";
  video.preload = "auto";
  video.muted = true;
  video.playsInline = true;

  const loadVideo = new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("Video load timeout")), 20000);
    video.onloadeddata = () => { clearTimeout(t); resolve(); };
    video.onerror = () => { clearTimeout(t); reject(new Error("Video load error")); };
    video.src = videoUri;
    video.load();
  });

  try {
    await loadVideo;
  } catch (e) {
    console.warn("[MediaPipe] Video load failed:", e);
    return generateSimulatedFrames(durationMs, stabilityData);
  }

  onProgress?.(15);

  const canvas = document.createElement("canvas");
  const maxDim = 480;
  const vw = video.videoWidth || 640;
  const vh = video.videoHeight || 480;
  const scale = Math.min(1, maxDim / Math.max(vw, vh));
  canvas.width = Math.round(vw * scale);
  canvas.height = Math.round(vh * scale);

  const totalSeconds = Math.max(1, Math.floor(durationMs / 1000));
  const sampleTimes: number[] = [];
  for (let t = 0.5; t < totalSeconds; t += 1) {
    sampleTimes.push(t);
    if (sampleTimes.length >= 60) break;
  }

  const avgStability =
    stabilityData.length
      ? stabilityData.reduce((a, b) => a + b, 0) / stabilityData.length
      : 75;

  const frames: LocalQCFrameSample[] = [];

  for (let i = 0; i < sampleTimes.length; i++) {
    const t = sampleTimes[i];
    const pct = 15 + ((i + 1) / sampleTimes.length) * 78;
    onProgress?.(pct);

    const imageData = await seekAndCapture(video, canvas, t);

    let handDetected = false;
    let handCount = 0;
    let handConfidence = 0;
    let handBoundingBoxes: { x: number; y: number; width: number; height: number }[] = [];
    let faceDetected = false;
    let faceConfidence = 0;
    let brightnessValue = 60;
    let blurValue = 60;
    let contrastValue = 60;

    if (imageData) {
      const { brightness, variance } = pixelBrightnessAndVariance(imageData.data);
      brightnessValue = Math.min(100, (brightness / 255) * 100);
      blurValue = Math.min(100, Math.max(10, (variance / 2500) * 100));
      contrastValue = Math.min(100, variance / 30);
    }

    try {
      const handResult = handLandmarker.detect(canvas);
      handCount = handResult.landmarks.length;
      handDetected = handCount > 0;

      if (handDetected && handResult.handedness.length > 0) {
        handConfidence = handResult.handedness[0]?.[0]?.score ?? 0.8;
        handBoundingBoxes = handResult.landmarks.map(
          (landmarks: { x: number; y: number }[]) => {
            const xs = landmarks.map((l) => l.x);
            const ys = landmarks.map((l) => l.y);
            const minX = Math.min(...xs);
            const minY = Math.min(...ys);
            return {
              x: minX,
              y: minY,
              width: Math.max(...xs) - minX,
              height: Math.max(...ys) - minY,
            };
          },
        );
      }
    } catch (e) {
      console.warn("[MediaPipe] Hand detection error:", e);
    }

    if (faceLandmarker) {
      try {
        const faceResult = faceLandmarker.detect(canvas);
        faceDetected = (faceResult.faceLandmarks?.length ?? 0) > 0;
        if (faceDetected) {
          faceConfidence = faceResult.faceBlendshapes?.[0]?.categories?.[0]?.score ?? 0.6;
        }
      } catch (e) {
        console.warn("[MediaPipe] Face detection error:", e);
      }
    }

    const stabilityNow = avgStability + (Math.random() - 0.5) * 10;

    frames.push({
      timestampMs: Math.floor(t * 1000),
      handDetected,
      handCount,
      handConfidence,
      handBoundingBoxes,
      faceDetected,
      faceConfidence,
      brightnessValue,
      blurValue,
      contrastValue,
      motionValue: Math.max(0, 100 - stabilityNow),
    });
  }

  onProgress?.(95);
  return frames;
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

function avg(arr: number[]) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function generateSimulatedFrames(
  durationMs: number,
  stabilityData: number[],
): LocalQCFrameSample[] {
  const totalFrames = Math.max(1, Math.floor(durationMs / 1000));
  const avgStability = stabilityData.length ? avg(stabilityData) : 80;
  const frames: LocalQCFrameSample[] = [];

  for (let i = 0; i < totalFrames; i++) {
    const t = i / totalFrames;
    const stabilityNow = avgStability + (Math.random() - 0.5) * 20;
    const handDetected = Math.random() > 0.2;
    const handCount = handDetected ? (Math.random() > 0.6 ? 2 : 1) : 0;
    const faceDetected = Math.random() < 0.05;

    frames.push({
      timestampMs: Math.floor(t * durationMs),
      handDetected,
      handCount,
      handConfidence: handDetected ? 0.7 + Math.random() * 0.3 : 0,
      handBoundingBoxes: handDetected
        ? [
            {
              x: 0.2 + Math.random() * 0.3,
              y: 0.3 + Math.random() * 0.3,
              width: 0.15 + Math.random() * 0.1,
              height: 0.2 + Math.random() * 0.1,
            },
          ]
        : [],
      faceDetected,
      faceConfidence: faceDetected ? 0.6 + Math.random() * 0.4 : 0,
      brightnessValue: clamp(60 + (Math.random() - 0.5) * 30, 0, 100),
      blurValue: clamp(stabilityNow * 0.7 + Math.random() * 20, 0, 100),
      contrastValue: clamp(55 + (Math.random() - 0.5) * 25, 0, 100),
      motionValue: clamp(100 - stabilityNow + Math.random() * 10, 0, 100),
    });
  }

  return frames;
}

export async function analyzeVideo(
  videoUri: string,
  durationMs: number,
  stabilityReadings: number[],
  onProgress?: (p: number) => void,
): Promise<LocalQCFrameSample[]> {
  if (Platform.OS === "web") {
    try {
      return await analyzeOnWeb(videoUri, durationMs, stabilityReadings, onProgress);
    } catch (e) {
      console.warn("[MediaPipe] Web analysis failed, using simulation:", e);
      return generateSimulatedFrames(durationMs, stabilityReadings);
    }
  }

  onProgress?.(10);
  await new Promise((r) => setTimeout(r, 200));
  onProgress?.(50);
  await new Promise((r) => setTimeout(r, 200));
  onProgress?.(90);

  return generateSimulatedFrames(durationMs, stabilityReadings);
}

export { generateSimulatedFrames };
